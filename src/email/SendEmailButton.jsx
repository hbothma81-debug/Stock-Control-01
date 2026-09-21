import { useEffect, useRef, useState } from "react";
import { Mail, X } from "lucide-react";
import { C, S } from "../theme.js";
import { supabase } from "../lib/supabaseClient.js";
import { emailIsSetUp, connectedMailbox, connectMailbox, disconnectMailbox, sendOutlookMail, outlookErrorText } from "./outlook.js";
import { MAX_ATTACHMENT_BYTES, goesToSelf, checkAddresses, actualRecipients, graphMessage, sentLine } from "./emailRules.js";

// "Email …" on a document, and the window it opens: To, Cc, subject and
// message filled in and all changeable, the PDF attached, sent from the
// signed-in person's own Outlook mailbox (outlook.js). One button for
// every document the app emails, so the window, the wording and the record
// are the same everywhere. The first user is the purchase order card.
//
//   appUser        { id, name }: the app login, for the record and so a
//                  mailbox connected by one login is not used by the next
//   getDefaults    () => { to, cc, subject, body, suggestions }, asked when
//                  the window opens (poEmailDefaults in emailRules.js)
//   buildAttachment  async () => ({ fileName, blob }), asked on Send
//   record         { documentType, relatedId, jobId } for the sent_emails row
//   onSent         called once the email has gone
//
// Draws nothing until the Microsoft setup's two IDs are in the build
// (emailIsSetUp): a button that can only fail is worse than none.
export default function SendEmailButton({ label, title, style, appUser, getDefaults, buildAttachment, record, onSent }) {
  const [open, setOpen] = useState(false);
  if (!emailIsSetUp()) return null;
  return (
    <>
      <button type="button" className="stk-btn" style={style || S.reqActionBtn} title={title} onClick={() => setOpen(true)}>
        <Mail size={13} /> {label}
      </button>
      {open && (
        <SendEmailModal
          heading={label}
          appUser={appUser}
          defaults={getDefaults()}
          buildAttachment={buildAttachment}
          record={record}
          onSent={onSent}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("The file could not be read."));
    reader.readAsDataURL(blob);
  });
}

function SendEmailModal({ heading, appUser, defaults, buildAttachment, record, onSent, onClose }) {
  const [to, setTo] = useState(defaults.to || "");
  const [cc, setCc] = useState(defaults.cc || "");
  const [subject, setSubject] = useState(defaults.subject || "");
  const [body, setBody] = useState(defaults.body || "");
  // undefined while looking, null when no mailbox is connected.
  const [mailbox, setMailbox] = useState(undefined);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [sentNote, setSentNote] = useState("");
  // A second press while the first is still on its way must not send the
  // order twice; state alone is a render too late for a fast double tap.
  const sendingRef = useRef(false);
  const toSelf = goesToSelf(window.location.hostname);

  useEffect(() => {
    let alive = true;
    connectedMailbox(appUser?.id)
      .then((m) => alive && setMailbox(m))
      .catch((err) => {
        if (!alive) return;
        setMailbox(null);
        setError(outlookErrorText(err));
      });
    return () => {
      alive = false;
    };
  }, [appUser?.id]);

  const toCheck = checkAddresses(to);
  const ccCheck = checkAddresses(cc);
  const unreadable = [...toCheck.bad, ...ccCheck.bad];
  const canSend = !!mailbox && !busy && !sentNote && toCheck.list.length > 0 && unreadable.length === 0 && subject.trim() !== "";
  const unused = (defaults.suggestions || []).filter((s) => !toCheck.list.some((a) => a.toLowerCase() === s.email.toLowerCase()));

  async function connect() {
    setError("");
    setBusy("Waiting for the Microsoft sign-in…");
    try {
      setMailbox(await connectMailbox(appUser?.id));
    } catch (err) {
      setError(outlookErrorText(err));
    } finally {
      setBusy("");
    }
  }

  async function disconnect() {
    setError("");
    try {
      await disconnectMailbox();
      setMailbox(null);
    } catch (err) {
      setError(outlookErrorText(err));
    }
  }

  async function send() {
    if (sendingRef.current || !canSend) return;
    sendingRef.current = true;
    setError("");
    setBusy("Sending…");
    let gone = false;
    try {
      const file = await buildAttachment();
      if (!file?.blob) throw new Error("The PDF could not be made.");
      if (file.blob.size > MAX_ATTACHMENT_BYTES) {
        throw new Error(`${file.fileName} is ${(file.blob.size / 1024 / 1024).toFixed(1)} MB. The app can email files up to 3 MB.`);
      }
      const base64 = await blobToBase64(file.blob);
      const real = actualRecipients({ to: toCheck.list, cc: ccCheck.list, toSelf, ownAddress: mailbox.address });
      if (real.to.length === 0) throw new Error("Microsoft gave no address for your mailbox, so there is nowhere to send a practice email.");
      await sendOutlookMail(
        appUser?.id,
        graphMessage({
          to: real.to,
          cc: real.cc,
          subject: toSelf ? `[PRACTICE] ${subject.trim()}` : subject.trim(),
          body: toSelf ? `PRACTICE COPY. On the live app this would have gone to: ${toCheck.list.join(", ")}${ccCheck.list.length ? ` (cc ${ccCheck.list.join(", ")})` : ""}\n\n${body}` : body,
          attachment: { fileName: file.fileName, base64 },
        })
      );
      gone = true;
      const row = {
        sent_by: appUser?.name || null,
        from_address: mailbox.address || null,
        to_addresses: real.to,
        cc_addresses: real.cc,
        subject: subject.trim(),
        document_type: record.documentType,
        related_id: record.relatedId != null ? String(record.relatedId) : null,
        job_id: record.jobId || null,
        file_name: file.fileName,
        test_mode: toSelf,
      };
      const { error: recordError } = await supabase.from("sent_emails").insert(row);
      if (recordError) throw recordError;
      setSentNote(`Sent to ${real.to.join(", ")}. It is in your Outlook Sent Items.`);
      onSent?.();
    } catch (err) {
      // Once Microsoft has taken it the email cannot be called back, so a
      // failure after that point must never read as "not sent": somebody
      // would press Send again and the supplier gets the order twice.
      if (gone) {
        setSentNote("The email was SENT, and it is in your Outlook Sent Items.");
        setError(`The app could not record that it was sent (${err?.message || err}), so the order will not show "Emailed". Do not send it again. Tell Heinrich.`);
        onSent?.();
      } else {
        setError(outlookErrorText(err));
      }
    } finally {
      sendingRef.current = false;
      setBusy("");
    }
  }

  const box = { ...S.input, boxSizing: "border-box" };
  return (
    <div style={{ ...S.modalOverlay, zIndex: 30 }} onClick={busy ? undefined : onClose}>
      <div style={{ ...S.modal, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>{heading}</span>
          <button type="button" className="stk-btn" style={S.iconBtn} onClick={onClose} disabled={!!busy}>
            <X size={18} />
          </button>
        </div>

        {mailbox === undefined && <div style={S.roleHint}>Checking your Outlook connection…</div>}
        {mailbox === null && (
          <div style={{ ...S.roleHint, marginTop: 0 }}>
            The email goes from your own Outlook mailbox, so sign in to Microsoft once on this device. The app never sees your
            password.
            <div>
              <button type="button" className="stk-btn" style={{ ...S.reqActionBtn, marginTop: 8 }} onClick={connect} disabled={!!busy}>
                <Mail size={13} /> Connect Outlook
              </button>
            </div>
          </div>
        )}
        {mailbox && (
          <div style={{ ...S.roleHint, marginTop: 0 }}>
            From: {mailbox.name ? `${mailbox.name} ` : ""}&lt;{mailbox.address}&gt;{" "}
            {!busy && !sentNote && (
              <button
                type="button"
                className="stk-btn"
                style={{ background: "transparent", border: "none", color: C.muted, textDecoration: "underline", cursor: "pointer", fontSize: 12, padding: 0 }}
                onClick={disconnect}
              >
                not you? disconnect
              </button>
            )}
          </div>
        )}

        {toSelf && (
          <div style={{ ...S.roleHint, color: C.danger }}>
            Practice copy: this email goes to your own mailbox only, never to the addresses below.
          </div>
        )}

        <label style={{ ...S.label, display: "block" }}>TO</label>
        <input style={box} value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@supplier.co.za; second@supplier.co.za" disabled={!!sentNote} />
        {unused.length > 0 && !sentNote && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {unused.map((s) => (
              <button
                key={s.email}
                type="button"
                className="stk-btn"
                style={{ ...S.reqActionBtnMuted, fontSize: 12 }}
                title="Add to To"
                onClick={() => setTo((t) => (t.trim() ? `${t.trim().replace(/[;,]$/, "")}; ${s.email}` : s.email))}
              >
                + {s.name ? `${s.name} · ` : ""}
                {s.email}
              </button>
            ))}
          </div>
        )}
        {(defaults.suggestions || []).length === 0 && !to.trim() && (
          <div style={S.roleHint}>No email address is saved for this supplier. Type one here; add it under Stock Manager → Suppliers to have it filled in next time.</div>
        )}

        <label style={{ ...S.label, display: "block" }}>CC</label>
        <input style={box} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optional" disabled={!!sentNote} />

        <label style={{ ...S.label, display: "block" }}>SUBJECT</label>
        <input style={box} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!!sentNote} />

        <label style={{ ...S.label, display: "block" }}>MESSAGE</label>
        <textarea style={{ ...box, minHeight: 170, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }} value={body} onChange={(e) => setBody(e.target.value)} disabled={!!sentNote} />

        <div style={S.roleHint}>Attached: the PDF of this document, made fresh when you press Send.</div>

        {unreadable.length > 0 && <div style={{ ...S.roleHint, color: C.danger }}>Not an email address: {unreadable.join(", ")}</div>}
        {error && <div style={{ ...S.roleHint, color: C.danger }}>{error}</div>}
        {sentNote && <div style={{ ...S.roleHint, color: C.accentFinished, fontSize: 13.5 }}>{sentNote}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {!sentNote && (
            <button
              type="button"
              className="stk-btn"
              style={{ ...S.submitBtn, flex: 1, marginTop: 0, ...(canSend ? {} : S.submitBtnDisabled) }}
              disabled={!canSend}
              onClick={send}
            >
              {busy || "Send"}
            </button>
          )}
          <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, flex: 1 }} onClick={onClose} disabled={!!busy}>
            {sentNote ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

// The lines under a document saying when it was emailed, to whom and by
// whom: the last five, newest first. Drawn only inside an opened card, so
// it asks the database for one document's few rows when somebody opens it
// and never on a timer. `refresh` changes when a Send has just gone.
// If the table is not there yet (setup-sent-emails.sql) it shows nothing.
export function SentEmailLines({ documentType, relatedId, refresh }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!emailIsSetUp() || !supabase || relatedId == null || relatedId === "") return undefined;
    let alive = true;
    supabase
      .from("sent_emails")
      .select("id, sent_at, sent_by, to_addresses, test_mode")
      .eq("document_type", documentType)
      .eq("related_id", String(relatedId))
      .order("sent_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (alive && !error) setRows(data || []);
      });
    return () => {
      alive = false;
    };
  }, [documentType, relatedId, refresh]);
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 6 }}>
      {rows.map((r) => (
        <div key={r.id} style={{ ...S.itemComment, fontStyle: "normal" }}>
          {sentLine(r)}
        </div>
      ))}
    </div>
  );
}
