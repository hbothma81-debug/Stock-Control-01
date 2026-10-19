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

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import Section from "../Section.jsx";
import RecordRow from "../RecordRow.jsx";
import { C, S } from "../theme.js";
import { supabase } from "../lib/supabaseClient.js";
import { GROUPS, classify, matchesSearch, supplierFor, todayInSA } from "./procurementRules.js";
import { sweepMailboxes } from "./mailSweep.js";
import { emailIsSetUp, outlookErrorText } from "../email/outlook.js";

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

export default function ProcurementPage({ suppliers, currentUserId, userName, customerEmails }) {
  const [rows, setRows] = useState(null);
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

  // Rows first, so the page shows at once; then the mailbox, then the rows
  // again with whatever the mailbox changed. interactive: Refresh was
  // pressed, so Microsoft may ask the person to sign in or allow reading.
  const load = useCallback(
    async (interactive) => {
      setLoading(true);
      setFailed(false);
      let current;
      try {
        current = await fetchRows();
        setRows(current);
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
      } catch (err) {
        console.error("Reading the mailbox failed:", err);
        setMailError(outlookErrorText(err));
      } finally {
        setMailBusy(false);
      }
    },
    [fetchRows, currentUserId, userName, suppliers, customerEmails]
  );

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
          return { r, supplier, c: classify(r, today, supplier?.terms || "") };
        }),
    [rows, activeMailbox, search, suppliers, today]
  );

  return (
    <div style={S.list}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {mailboxes.length > 1 &&
          mailboxes.map((m) => (
            <button
              key={m.key}
              type="button"
              className="stk-btn"
              // The whole border, never borderColor beside it: React warns
              // when a shorthand and its part change on the same element.
              style={{
                ...S.chip,
                ...(m.key === activeMailbox
                  ? { background: S.chipActive.background, color: S.chipActive.color, fontWeight: S.chipActive.fontWeight, border: `1px solid ${C.accentFinished}` }
                  : {}),
              }}
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
              `${mail.added} new request${mail.added === 1 ? "" : "s"}, ${mail.moved} moved on.`}
          {mailError && <div style={{ color: C.danger }}>Reading the mailbox failed: {mailError}</div>}
          {(mail?.problems || []).map((p) => (
            <div key={p} style={{ color: C.danger }}>{p}</div>
          ))}
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
        return (
          <Section
            key={`${activeMailbox}-${g.key}`}
            title={overdue ? `${g.label} · ${overdue} overdue` : g.label}
            count={inGroup.length}
            defaultOpen={g.startOpen}
            danger={overdue > 0}
          >
            {inGroup.map(({ r, supplier, c }) => (
              <RecordRow
                key={r.id}
                title={r.pr_number}
                summary={`${r.supplier_name || "—"} · ${r.item || ""}${r.qty ? ` · ${r.qty}` : ""}`}
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
                <Detail label="Notes">{r.notes}</Detail>
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
    </div>
  );
}
