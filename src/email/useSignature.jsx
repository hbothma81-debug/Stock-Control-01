// Reads and saves the signed-in person's own email signature, and draws it
// under the message in every send window (SendEmailButton.jsx and the
// Suppliers follow-up), with "Change my signature" beside it: the person
// sees what goes out and changes it where they are sending (no setting on
// another screen). The words and their look are in signature.js.
//
// Read when a send window opens: the person's one row, and the company's
// phone and logo once per page load. Never on a timer. A database without
// email_signatures signs with the made signature and offers no change.

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { supabase } from "../lib/supabaseClient.js";
import { C, S } from "../theme.js";
import { signatureText, signatureHtml } from "./signature.js";

// The company's phone and logo, asked once per page load.
let companyPromise = null;
function companyParts() {
  if (!companyPromise) {
    companyPromise = supabase
      .from("master_company_details")
      .select("phone, logo")
      .limit(1)
      .then(({ data, error }) => (error ? { phone: "", logo: "" } : { phone: data?.[0]?.phone || "", logo: data?.[0]?.logo || "" }))
      .catch(() => ({ phone: "", logo: "" }));
  }
  return companyPromise;
}

// sig: { text, logo, ready, canSave, saved, save(text) }. `mailbox` is the
// address the email goes from, for the made signature's Email line. `by`
// names who saves, when that is not the person themself (an admin on User
// Management, PersonSignature.jsx).
export function useSignature(appUser, mailbox, { by } = {}) {
  const [saved, setSaved] = useState(null);
  const [company, setCompany] = useState({ phone: "", logo: "" });
  const [ready, setReady] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const userId = appUser?.id;

  useEffect(() => {
    let alive = true;
    (async () => {
      const parts = await companyParts();
      let own = null;
      let tableThere = false;
      if (userId && supabase) {
        const { data, error } = await supabase.from("email_signatures").select("signature").eq("user_id", userId).maybeSingle();
        tableThere = !error;
        own = error ? null : data?.signature || null;
      }
      if (!alive) return;
      setCompany(parts);
      setSaved(own);
      setCanSave(tableThere);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  async function save(text) {
    const clean = String(text || "").replace(/\r\n/g, "\n").trim();
    const { data, error } = await supabase
      .from("email_signatures")
      .upsert({ user_id: userId, signature: clean, updated_at: new Date().toISOString(), updated_by: by || appUser?.name || null })
      .select("signature")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("The database did not keep it. Tell Heinrich.");
    setSaved(data.signature || null);
  }

  return {
    text: signatureText(saved, { name: appUser?.name, phone: company.phone, mailbox }),
    logo: company.logo,
    ready,
    canSave,
    saved: !!String(saved || "").trim(),
    save,
  };
}

// The signature as it will go out, under the message box, and its editor.
// forOther: an admin changing somebody else's (User Management): the words
// say "signature", not "my signature".
export function SignatureBox({ sig, disabled, forOther = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  if (!sig?.ready) return <div style={S.roleHint}>Fetching your signature…</div>;

  if (editing) {
    return (
      <div style={{ marginTop: 8 }}>
        <label style={{ ...S.label, display: "block" }}>{forOther ? "EMAIL SIGNATURE" : "MY SIGNATURE"}</label>
        <textarea
          style={{ ...S.input, boxSizing: "border-box", minHeight: 150, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
        <div style={S.roleHint}>The words only: the app writes them in the company's blue and adds the logo. Leave it empty to have one made from {forOther ? "their" : "your"} name.</div>
        {problem && <div style={{ ...S.roleHint, color: C.danger }}>{problem}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button
            type="button"
            className="stk-btn"
            style={S.reqActionBtnAlertOn}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setProblem("");
              try {
                await sig.save(draft);
                setEditing(false);
              } catch (err) {
                setProblem(`Not saved: ${err?.message || err}`);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : forOther ? "Save signature" : "Save my signature"}
          </button>
          <button type="button" className="stk-btn" style={S.reqActionBtnMuted} disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ ...S.label, display: "block" }}>{forOther ? "EMAIL SIGNATURE" : "SIGNATURE"}</span>
        {sig.canSave && !disabled && (
          <button
            type="button"
            className="stk-btn"
            style={{ ...S.reqActionBtnMuted, fontSize: 12 }}
            onClick={() => {
              setDraft(sig.text);
              setProblem("");
              setEditing(true);
            }}
          >
            <Pencil size={11} /> {forOther ? "Change signature" : "Change my signature"}
          </button>
        )}
      </div>
      <div style={{ background: "#ffffff", border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", marginTop: 4 }}>
        <div dangerouslySetInnerHTML={{ __html: signatureHtml(sig.text) }} />
        {sig.logo && <img src={sig.logo} alt="East Rand Supplies" style={{ width: 160, height: "auto", marginTop: 8, display: "block" }} />}
      </div>
    </div>
  );
}
