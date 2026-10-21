// The Procurement page: the supplier quote requests register.
//
// Heinrich, 19 Oct 2026. It shows procurement_requests as the Procurement
// panel in Claude Code does: one tab per mailbox, pills per stage of the
// job. When the page opens and on Refresh it reads the mailbox
// (mailSweep.js) for new requests and replies. A mail taken for a request
// by mistake can be marked "Not a request". Send follow-up and the Claude
// reading of quote PDFs come in later steps.
//
// Who sees what is the database's decision (setup-procurement-2-requests.sql):
// rows from a person's own mailbox are theirs alone, sales@ rows go to
// everyone with the Procurement tick. This page shows whatever comes back.
//
// Loads open work plus anything finished in the last 90 days, never the
// whole table: the register will keep growing.

import { rand } from "../lib/money.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { draftFollowUp, isEmailQuote, isEmailWithoutPrice, latestCopies, repliedWithoutQuote } from "./mailRules.js";
import { sendFollowUp } from "./followUp.js";
import Section from "../Section.jsx";
import RecordRow from "../RecordRow.jsx";
import { C, S } from "../theme.js";
import { supabase } from "../lib/supabaseClient.js";
import { GROUPS, classify, matchesSearch, supplierFor, todayInSA } from "./procurementRules.js";
import { sweepMailboxes } from "./mailSweep.js";
import { emailIsSetUp, outlookErrorText } from "../email/outlook.js";
import { useSignature, SignatureBox } from "../email/useSignature.jsx";
import SupplierList from "./SupplierList.jsx";
import QuotesTab, { QuoteLines } from "./QuotesList.jsx";
import ItemsList from "./ItemsList.jsx";

const OPEN_STATUSES = ["Draft", "Sent", "Reply", "Pro forma", "Paid", "Ordered"];
const RECENT_DAYS = 90;

const TONES = {
  grey: { color: C.muted, border: C.border },
  blue: { color: "#5BA3E0", border: "#5BA3E0" },
  amber: { color: C.accentRaw, border: C.accentRaw },
  green: { color: C.accentFinished, border: C.accentFinished },
  red: { color: C.danger, border: C.danger },
};

function Tag({ pill }) {
  const tone = TONES[pill.tone] || TONES.grey;
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.3,
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        color: tone.color,
        whiteSpace: "nowrap",
      }}
    >
      {pill.label}
    </span>
  );
}

function Detail({ label, children }) {
  if (children == null || children === "") return null;
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 14, marginTop: 4, flexWrap: "wrap" }}>
      <span style={{ color: C.muted, minWidth: 110 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>{children}</span>
    </div>
  );
}

const fmtDate = (d) => (d ? String(d).slice(0, 10) : "");
// Close quote: a request that will not be ordered (Heinrich, 19 Oct 2026:
// "Just a close quote button. Basic"; the reason "Optional"). It goes to
// Done as Closed, "No order" and the reason first in its notes; its quotes
// stay on the supplier's page. Reopen puts it back. Open line (1), Close
// quote (2), Save (3).
function CloseQuote({ row, userName, hasQuote, onSaved }) {
  const [reason, setReason] = useState(null);
  const [busy, setBusy] = useState(false);
  const closable = ["Draft", "Sent", "Reply", "Pro forma", "Paid"].includes(row.status);
  const reopenable = row.status === "Closed" && !row.po_number;
  if (!closable && !reopenable) return null;

  async function save(fields) {
    setBusy(true);
    const { data, error } = await supabase
      .from("procurement_requests")
      .update({ ...fields, updated_at: new Date().toISOString(), updated_by: userName })
      .eq("id", row.id)
      .select()
      .single();
    setBusy(false);
    if (error || !data) {
      alert("That did not save. Check your connection and try again.");
      return;
    }
    setReason(null);
    onSaved(data);
  }

  if (reopenable) {
    return (
      <button
        type="button"
        className="stk-btn"
        style={{ ...S.reqActionBtnMuted, marginTop: 8 }}
        disabled={busy}
        onClick={() =>
          save({
            status: hasQuote ? "Reply" : "Sent",
            waiting_since: hasQuote ? null : todayInSA(Date.now()),
            notes: (row.notes || "").replace(/^No order[^\n]*\n?/, ""),
          })
        }
      >
        Reopen
      </button>
    );
  }
  if (reason === null) {
    return (
      <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, marginTop: 8 }} onClick={() => setReason("")}>
        Close quote
      </button>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      <input
        style={S.input}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why, if you want to say (optional): too expensive, job cancelled…"
        autoFocus
      />
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button
          type="button"
          className="stk-btn"
          style={S.reqActionBtnAlertOn}
          disabled={busy}
          onClick={() => {
            const line = `No order${reason.trim() ? `: ${reason.trim()}` : ""} (closed ${todayInSA(Date.now())}${userName ? ` by ${userName}` : ""})`;
            save({ status: "Closed", waiting_since: null, notes: row.notes ? `${line}\n${row.notes}` : line });
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="stk-btn" style={S.reqActionBtnMuted} disabled={busy} onClick={() => setReason(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// Send follow-up, on every line waiting on the supplier (Heinrich, 19 Oct
// 2026: "every line"), stronger once the reminder is due. After two chases
// the line says to phone instead (the Email follow-up program's rule).
// Open line (1), Send follow-up (2), Send (3).
function FollowUp({ row, supplier, c, userName, currentUserId, onSent }) {
  const [text, setText] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const sending = useRef(false);

  if (c.group !== "waiting") return null;
  if (c.action === "phone") {
    return (
      <div style={{ marginTop: 8, color: C.danger, fontWeight: 700 }}>
        Chased {row.chases} times: phone them{supplier?.phone ? ` on ${supplier.phone}` : ""}.
      </div>
    );
  }

  function start() {
    const contact = (supplier?.contacts || []).find((x) => (x.email || "").toLowerCase() === (row.contact_email || "").toLowerCase());
    setText(draftFollowUp({ row, contactName: contact?.name || "", owesProForma: row.status === "Reply", senderName: userName }));
    setError("");
    setNote("");
  }

  async function send(sig) {
    if (sending.current || !text?.trim()) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await sendFollowUp({ supabase, appUserId: currentUserId, userName, row, text: text.trim(), sig });
      setNote(result.practice ? `PRACTICE: sent to your own mailbox (${result.sentTo}) only.` : `Sent to ${result.sentTo}, in the same email thread.`);
      setText(null);
      if (result.row) onSent(result.row);
    } catch (err) {
      setError(outlookErrorText(err));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      {note && <div style={{ color: C.accentFinished, fontSize: 14 }}>{note}</div>}
      {text === null ? (
        <button type="button" className="stk-btn" style={c.isOverdue ? S.reqActionBtnAlertOn : S.reqActionBtnMuted} onClick={start}>
          <Send size={12} /> Send follow-up{c.isOverdue ? " (due)" : ""}
        </button>
      ) : (
        <FollowUpCompose
          row={row}
          text={text}
          setText={setText}
          busy={busy}
          onSend={send}
          appUser={{ id: currentUserId, name: userName }}
        />
      )}
      {error && <div style={{ color: C.danger, fontSize: 14, marginTop: 4 }}>Not sent: {error}</div>}
    </div>
  );
}

// The follow-up being written: the message, the sender's signature under
// it, Send. Its own piece so the signature is read only while somebody is
// writing one, not once for every line on the page.
function FollowUpCompose({ row, text, setText, busy, onSend, appUser }) {
  const sig = useSignature(appUser, row.mailbox);
  return (
    <>
      {/* The request's notes, red above the message, so a quote that does not
          match what was asked (PR-004: 1000 mm and 350 N against 1200 mm and
          100 N) is settled before a pro forma is asked for (Heinrich, 20 Oct
          2026: "show notes in red"). */}
      {(row.notes || "").trim() && (
        <div style={{ color: C.danger, fontSize: 14, fontWeight: 600, whiteSpace: "pre-wrap", marginBottom: 6 }}>
          Notes: {row.notes.trim()}
        </div>
      )}
      <label style={S.label}>To {row.contact_email}, in the same email thread</label>
      <textarea style={{ ...S.input, minHeight: 150, fontFamily: "inherit" }} value={text} onChange={(e) => setText(e.target.value)} />
      <SignatureBox sig={sig} disabled={busy} />
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button type="button" className="stk-btn" style={S.reqActionBtnAlertOn} onClick={() => onSend(sig)} disabled={busy || !sig.ready}>
          <Send size={12} /> {busy ? "Sending…" : "Send"}
        </button>
        <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => setText(null)} disabled={busy}>
          Cancel
        </button>
      </div>
    </>
  );
}

// The page's own tabs.
const VIEWS = [
  { key: "requests", label: "Quote requests" },
  { key: "quotes", label: "Quotes" },
  { key: "items", label: "Items quoted" },
  { key: "suppliers", label: "Supplier list" },
];
// Saved quotes loaded with the page: the newest, never the whole table.
const QUOTES_SHOWN = 500;

// The whole border, never borderColor beside it: React warns when a
// shorthand and its part change on the same element.
const chipStyle = (active) => ({
  ...S.chip,
  ...(active
    ? { background: S.chipActive.background, color: S.chipActive.color, fontWeight: S.chipActive.fontWeight, border: `1px solid ${C.accentFinished}` }
    : {}),
});

// supplierEdits: App's own supplier functions (the ones Stock Manager uses),
// so a change here saves exactly as one made there.
export default function ProcurementPage({ suppliers, currentUserId, userName, customerEmails, canEditSuppliers, supplierEdits, openPdf, onRaisePo, onAddStock, hasSupplierCategories, onLinkStock, customStock }) {
  const [view, setView] = useState("requests");
  const [rows, setRows] = useState(null);
  const [quotes, setQuotes] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [mailbox, setMailbox] = useState(null);
  // What the last mailbox read found: null (not tried), { connected: false },
  // or { connected, address, added, moved, problems, at }.
  const [mail, setMail] = useState(null);
  const [mailBusy, setMailBusy] = useState(false);
  const [mailError, setMailError] = useState("");

  const fetchRows = useCallback(async () => {
    const since = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString();
    const open = OPEN_STATUSES.map((s) => `"${s}"`).join(",");
    const { data, error } = await supabase
      .from("procurement_requests")
      .select("*")
      .or(`status.in.(${open}),updated_at.gte.${since}`)
      .order("pr_number", { ascending: false });
    if (error) throw error;
    return data || [];
  }, []);

  // Saved quotes, newest first. A database without setup-procurement-4
  // simply shows none.
  const fetchQuotes = useCallback(async () => {
    const { data, error } = await supabase
      .from("supplier_quotes")
      .select("*")
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(QUOTES_SHOWN);
    // Newest by the quote's own date where Claude has read one, so old quotes
    // uploaded today sit where they belong, not at the top.
    const when = (q) => String(q.quote_date || q.received_at || q.created_at || "");
    // Of copies of one file on one request only the latest shows, and only it
    // is read (Heinrich, 20 Oct 2026: "always use latest date").
    const list = latestCopies((error ? [] : data || []).sort((a, b) => (when(a) < when(b) ? 1 : -1)));
    setQuotes(list);
    return list;
  }, []);

  // Claude reads each saved quote still waiting (read-document server
  // function, which checks the Procurement tick and the monthly limits
  // itself). A few per page open, one at a time; stops at the first refusal.
  const [reading, setReading] = useState("");
  const [readerProblem, setReaderProblem] = useState("");
  const readWaiting = useCallback(
    async (list) => {
      const waiting = (list || []).filter((q) => q.read_status === "waiting").slice(0, 25);
      if (!waiting.length) return;
      setReaderProblem("");
      for (let i = 0; i < waiting.length; i++) {
        setReading(`Claude is reading quote ${i + 1} of ${waiting.length}…`);
        const { data, error } = await supabase.functions.invoke("read-document", { body: { quoteId: waiting[i].id } });
        if (error) {
          setReaderProblem("The Claude reader is not set up yet, or could not be reached. The quotes are saved and wait to be read.");
          break;
        }
        if (data?.status === "limit") {
          setReaderProblem(data.message || "The Claude limit is reached for now. The quotes are saved and wait to be read.");
          break;
        }
      }
      setReading("");
      fetchQuotes();
    },
    [fetchQuotes]
  );

  // Old quotes uploaded by hand on a supplier's page (Heinrich, 20 Oct 2026:
  // "a manual upload quote option per supplier ... to catch up"): saved like
  // a quote from the mailbox, then read by Claude within the same limits.
  // Returns how many were saved.
  async function uploadQuotes(supplier, files) {
    let saved = 0;
    const skipped = [];
    for (const file of files) {
      const isPdf = /pdf/i.test(file.type || "") || /\.pdf$/i.test(file.name || "");
      if (!isPdf || file.size > 10 * 1024 * 1024) {
        skipped.push(file.name);
        continue;
      }
      const safeName = (file.name || "quote.pdf").replace(/[^\w.\- ]+/g, "_");
      const path = `upload/${supplier.id}/${Date.now()}-${safeName}`;
      const up = await supabase.storage.from("supplier-quotes").upload(path, file, { contentType: "application/pdf" });
      if (up.error) {
        skipped.push(file.name);
        continue;
      }
      const { error } = await supabase.from("supplier_quotes").insert({
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        mailbox: "",
        message_id: `upload:${crypto.randomUUID()}`,
        file_name: file.name,
        storage_path: path,
        file_size: file.size,
        received_at: new Date().toISOString(),
        created_by: userName,
      });
      if (error) {
        await supabase.storage.from("supplier-quotes").remove([path]);
        skipped.push(file.name);
        continue;
      }
      saved++;
    }
    if (skipped.length) alert(`Not saved (not a PDF, over 10 MB, or no connection): ${skipped.join(", ")}`);
    const list = await fetchQuotes();
    readWaiting(list);
    return saved;
  }

  async function readAgain(q) {
    await supabase.from("supplier_quotes").update({ read_status: "waiting", read_note: "" }).eq("id", q.id);
    readWaiting([{ ...q, read_status: "waiting" }]);
  }

  async function openQuote(q) {
    // An email's text opens in a new tab; the tab is opened before the wait,
    // or the browser takes it for a pop-up and blocks it.
    const tab = isEmailQuote(q) ? window.open("", "_blank") : null;
    const { data, error } = await supabase.storage.from("supplier-quotes").createSignedUrl(q.storage_path, 600);
    if (tab) {
      if (error || !data?.signedUrl) tab.close();
      else {
        tab.location = data.signedUrl;
        return;
      }
    }
    if (error || !data?.signedUrl) {
      alert("That PDF could not be opened. Check your connection and try again.");
      return;
    }
    openPdf(data.signedUrl, q.file_name);
  }

  // Rows first, so the page shows at once; then the mailbox, then the rows
  // again with whatever the mailbox changed. interactive: Refresh was
  // pressed, so Microsoft may ask the person to sign in or allow reading.
  const load = useCallback(
    async (interactive) => {
      setLoading(true);
      setFailed(false);
      let current;
      let quotesNow = [];
      try {
        current = await fetchRows();
        setRows(current);
        quotesNow = await fetchQuotes();
      } catch (err) {
        console.error("Procurement requests did not load:", err);
        setFailed(true);
        setLoading(false);
        return;
      }
      setLoading(false);
      if (!emailIsSetUp()) return;
      setMailBusy(true);
      setMailError("");
      try {
        const { data: settings } = await supabase.from("app_settings").select("procurement_shared_mailboxes").maybeSingle();
        const result = await sweepMailboxes({
          supabase,
          appUserId: currentUserId,
          userName,
          interactive,
          rows: current,
          suppliers,
          customerEmails,
          sharedMailboxes: settings?.procurement_shared_mailboxes || [],
        });
        setMail({ ...result, at: new Date() });
        if (result.connected && (result.added || result.moved)) setRows(await fetchRows());
        if (result.connected && result.newQuotes?.length) quotesNow = await fetchQuotes();
      } catch (err) {
        console.error("Reading the mailbox failed:", err);
        setMailError(outlookErrorText(err));
      } finally {
        setMailBusy(false);
      }
      readWaiting(quotesNow);
    },
    [fetchRows, fetchQuotes, readWaiting, currentUserId, userName, suppliers, customerEmails]
  );

  // A PO raised from a quote moved its request on (usePurchasing): show it.
  useEffect(() => {
    const again = () => fetchRows().then(setRows).catch(() => {});
    window.addEventListener("procurement-requests-changed", again);
    return () => window.removeEventListener("procurement-requests-changed", again);
  }, [fetchRows]);

  // Create PO from quote: on every read quote with lines, any time, so
  // ordering again later is one press (Heinrich, 19 Oct 2026). The request
  // moves to Ordered only while it is still open and not on a PO.
  const requestStillOpen = (q) => {
    const req = (rows || []).find((r) => r.id === q.request_id);
    return !!req && !req.po_number && ["Sent", "Reply", "Pro forma", "Paid"].includes(req.status);
  };
  const raisePoFor = (q) => {
    if (!onRaisePo || q.read_status !== "read" || !(q.lines || []).length) return null;
    return () => onRaisePo(q, { linkRequest: requestStillOpen(q) });
  };
  // One item from Items quoted on its own PO.
  const raiseItemPo = onRaisePo ? (q, line) => onRaisePo(q, { lines: [line], linkRequest: requestStillOpen(q) }) : null;
  const addStock = onAddStock || null;

  useEffect(() => {
    load(false);
    // Once when the page opens; Refresh reads again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Not a request" and back. The next mailbox read leaves a row marked so alone.
  async function setStatus(row, status) {
    const { data, error } = await supabase
      .from("procurement_requests")
      .update({ status, updated_at: new Date().toISOString(), updated_by: userName })
      .eq("id", row.id)
      .select()
      .single();
    if (error || !data) {
      alert("That did not save. Check your connection and try again.");
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === data.id ? data : r)));
  }

  const today = todayInSA(Date.now());

  // One tab per mailbox the rows came from. A person's own mailbox first.
  const mailboxes = useMemo(() => {
    const seen = new Map();
    for (const r of rows || []) {
      const key = (r.mailbox || "").toLowerCase();
      if (!seen.has(key)) seen.set(key, { key, label: r.mailbox, own: r.owner_id === currentUserId, count: 0 });
      seen.get(key).count += 1;
    }
    return [...seen.values()].sort((a, b) => (a.own === b.own ? a.key.localeCompare(b.key) : a.own ? -1 : 1));
  }, [rows, currentUserId]);

  const activeMailbox = mailboxes.find((m) => m.key === mailbox)?.key || mailboxes[0]?.key || null;

  const classified = useMemo(
    () =>
      (rows || [])
        .filter((r) => (r.mailbox || "").toLowerCase() === activeMailbox)
        .filter((r) => matchesSearch(r, search))
        .map((r) => {
          const supplier = supplierFor(r, suppliers);
          const c = classify(r, today, supplier?.terms || "");
          // Answered by email with no price, no quote yet (mailRules).
          if (c.pill.label === "QUOTE IN" && repliedWithoutQuote((quotes || []).filter((q) => q.request_id === r.id))) {
            return { r, supplier, c: { ...c, note: "They answered with no price: reply to them", pill: { label: "REPLIED, NO QUOTE", tone: "amber" } } };
          }
          return { r, supplier, c };
        }),
    [rows, activeMailbox, search, suppliers, today, quotes]
  );

  return (
    <div style={S.list}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {VIEWS.map((v) => (
          <button key={v.key} type="button" className="stk-btn" style={chipStyle(view === v.key)} onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </div>

      {view === "requests" && (
        <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {mailboxes.length > 1 &&
          mailboxes.map((m) => (
            <button
              key={m.key}
              type="button"
              className="stk-btn"
              style={chipStyle(m.key === activeMailbox)}
              onClick={() => setMailbox(m.key)}
            >
              {m.label} ({m.count})
            </button>
          ))}
        {mailboxes.length === 1 && <span style={{ color: C.muted, fontSize: 14 }}>{mailboxes[0].label}</span>}
        <button
          type="button"
          className="stk-btn"
          style={{ ...S.reqActionBtnMuted, marginLeft: "auto" }}
          onClick={() => load(true)}
          disabled={loading || mailBusy}
        >
          <RefreshCw size={13} /> {loading ? "Loading…" : mailBusy ? "Reading mail…" : "Refresh"}
        </button>
      </div>

      {emailIsSetUp() && (
        <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
          {mailBusy && "Reading the mailbox…"}
          {!mailBusy && mail?.connected === false && (
            <>
              The mailbox is not read yet on this device.{" "}
              <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => load(true)}>
                Read my mailbox
              </button>
            </>
          )}
          {!mailBusy && mail?.connected &&
            `Mailbox ${mail.address} read at ${mail.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}: ` +
              `${mail.added} new request${mail.added === 1 ? "" : "s"}, ${mail.moved} moved on` +
              (mail.newQuotes?.length ? `, ${mail.newQuotes.length} quote${mail.newQuotes.length === 1 ? "" : "s"} saved.` : ".")}
          {mailError && <div style={{ color: C.danger }}>Reading the mailbox failed: {mailError}</div>}
          {(mail?.problems || []).map((p) => (
            <div key={p} style={{ color: C.danger }}>{p}</div>
          ))}
          {reading && <div>{reading}</div>}
          {readerProblem && <div style={{ color: C.danger }}>{readerProblem}</div>}
        </div>
      )}

      <input
        style={{ ...S.input, marginTop: 10 }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search PR number, supplier, item or notes…"
      />

      {failed && (
        <div style={{ color: C.danger, marginTop: 12 }}>
          The quote requests did not load. Press Refresh to try again.
        </div>
      )}
      {rows && rows.length === 0 && !failed && (
        <div style={{ color: C.muted, marginTop: 12 }}>No quote requests yet.</div>
      )}

      {GROUPS.map((g) => {
        const inGroup = classified.filter((x) => x.c.group === g.key);
        if (inGroup.length === 0) return null;
        const overdue = inGroup.filter((x) => x.c.isOverdue).length;
        // Each quote its own line, a request with none one line, newest
        // first by the quote's date or the day it was asked (Heinrich, 20
        // Oct 2026: "each quote seperate", "should we not arrange by date").
        // A quote's line carries its request's details and buttons too.
        const lines = inGroup
          .flatMap((x) => {
            // An email with no price is shown only while there is no other
            // quote on the request: beside a quote it is just "thanks".
            const all = (quotes || []).filter((q) => q.request_id === x.r.id);
            const theirs = all.some((q) => !isEmailWithoutPrice(q)) ? all.filter((q) => !isEmailWithoutPrice(q)) : all;
            return theirs.length
              ? theirs.map((q) => ({ ...x, q, when: String(q.quote_date || q.received_at || "") }))
              : [{ ...x, q: null, when: String(x.r.requested_at || "") }];
          })
          .sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0));
        return (
          <Section
            key={`${activeMailbox}-${g.key}`}
            title={overdue ? `${g.label} · ${overdue} overdue` : g.label}
            count={lines.length}
            defaultOpen={g.startOpen}
            danger={overdue > 0}
          >
            {lines.map(({ r, supplier, c, q }) => (
              <RecordRow
                key={q ? `${r.id}-${q.id}` : r.id}
                title={r.pr_number}
                summary={
                  q
                    ? [
                        r.supplier_name || "—",
                        isEmailWithoutPrice(q)
                          ? "replied by email, no price"
                          : isEmailQuote(q) && q.read_status !== "read"
                            ? "email reply, being read"
                            : q.doc_type === "other"
                              ? `not a quote: ${q.file_name}`
                              : `quote ${q.quote_number || (isEmailQuote(q) ? "in the email" : q.file_name)}`,
                        q.total_ex_vat != null ? `${rand(q.total_ex_vat)} ex VAT` : "",
                        fmtDate(q.quote_date || q.received_at),
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : `${r.supplier_name || "—"} · ${r.item || ""}${r.qty ? ` · ${r.qty}` : ""}`
                }
                right={<Tag pill={c.pill} />}
              >
                <Detail label="Next">
                  {c.action === "phone" && supplier?.phone ? `${c.note} — phone ${supplier.phone}` : c.note}
                </Detail>
                <Detail label="Status">{r.status}</Detail>
                <Detail label="Requested">{fmtDate(r.requested_at)}</Detail>
                <Detail label="Waiting since">{fmtDate(r.waiting_since)}</Detail>
                <Detail label="Chases">{r.chases ? String(r.chases) : ""}</Detail>
                <Detail label="Contact">{r.contact_email}</Detail>
                <Detail label="Terms">{supplier?.terms || ""}</Detail>
                <Detail label="Our account no">{supplier?.accountNo || ""}</Detail>
                <Detail label="Phone">{supplier?.phone || ""}</Detail>
                <Detail label="Old quote">{r.old_quote}</Detail>
                <Detail label="On PO">{r.po_number}</Detail>
                <Detail label="Notes">{r.notes}</Detail>
                {q && (
                  <div style={{ marginTop: 8 }}>
                    <label style={S.label}>This quote</label>
                    <QuoteLines
                      quotes={[q]}
                      onOpen={openQuote}
                      onReadAgain={readAgain}
                      raisePoFor={raisePoFor}
                      showSupplier={false}
                      raiseItemPo={raiseItemPo}
                      addStock={addStock}
                      stockItems={customStock}
                      onLinkStock={onLinkStock}
                    />
                  </div>
                )}
                {!q && mail?.replies?.[r.id] && (
                  // A reply with no PDF: the price may be typed in the email.
                  <div style={{ marginTop: 8 }}>
                    <label style={S.label}>Their reply, {fmtDate(mail.replies[r.id].at)} (no PDF)</label>
                    <div style={{ fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{mail.replies[r.id].text || "(no text)"}</div>
                    {mail.replies[r.id].link && (
                      <a href={mail.replies[r.id].link} target="_blank" rel="noopener noreferrer" className="stk-btn" style={{ ...S.reqActionBtnMuted, display: "inline-flex", marginTop: 6, textDecoration: "none" }}>
                        Open in Outlook
                      </a>
                    )}
                  </div>
                )}
                <FollowUp
                  row={r}
                  supplier={supplier}
                  c={c}
                  userName={userName}
                  currentUserId={currentUserId}
                  onSent={(saved) => setRows((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))}
                />
                <CloseQuote
                  row={r}
                  userName={userName}
                  hasQuote={!!r.reply_message_id || (quotes || []).some((q) => q.request_id === r.id)}
                  onSaved={(saved) => setRows((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))}
                />
                {["Draft", "Sent"].includes(r.status) && (
                  <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, marginTop: 8 }} onClick={() => setStatus(r, "Not a request")}>
                    Not a request
                  </button>
                )}
                {r.status === "Not a request" && (
                  <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, marginTop: 8 }} onClick={() => setStatus(r, "Sent")}>
                    It is a request after all
                  </button>
                )}
              </RecordRow>
            ))}
          </Section>
        );
      })}
        </>
      )}

      {view === "quotes" && <QuotesTab quotes={(quotes || []).filter((q) => !isEmailWithoutPrice(q))} onOpen={openQuote} onReadAgain={readAgain} raisePoFor={raisePoFor} />}

      {view === "items" && (
        <ItemsList quotes={quotes} onOpenQuote={openQuote} raiseItemPo={raiseItemPo} addStock={addStock} stockItems={customStock} onLinkStock={onLinkStock} />
      )}

      {view === "suppliers" && (
        <SupplierList
          quotes={(quotes || []).filter((q) => !isEmailWithoutPrice(q))}
          onOpenQuote={openQuote}
          onReadAgain={readAgain}
          raisePoFor={raisePoFor}
          raiseItemPo={raiseItemPo}
          addStock={addStock}
          hasCategories={hasSupplierCategories}
          stockItems={customStock}
          onLinkStock={onLinkStock}
          onUploadQuotes={uploadQuotes}
          suppliers={suppliers}
          requests={rows}
          canEdit={canEditSuppliers}
          onField={supplierEdits.updateSupplierField}
          onAddSupplier={supplierEdits.addSupplier}
          onAddContact={supplierEdits.addSupplierContact}
          onContactField={supplierEdits.updateSupplierContact}
          onRemoveContact={supplierEdits.removeSupplierContact}
        />
      )}
    </div>
  );
}
