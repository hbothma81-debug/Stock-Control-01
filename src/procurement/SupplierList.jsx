// Suppliers -> Supplier list: every supplier, A-Z, one line each, a card
// behind it. Heinrich, 19 Oct 2026: "the stock manager is a mission to go
// to each time". The same supplier list as Stock Manager -> Suppliers, read
// and saved the same way (App's setMaster and its save queue); that tab
// stays as it was. Removing a supplier stays in Stock Manager only.
//
// Editing follows Stock Manager's own rule: admins and people with "Can
// access Stock Manager". Everyone else who sees the page reads the cards.

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Section from "../Section.jsx";
import RecordRow from "../RecordRow.jsx";
import { C, S } from "../theme.js";
import { QuoteLines } from "./QuotesList.jsx";

function Field({ label, value, canEdit, onChange, placeholder }) {
  if (!canEdit) {
    if (!value) return null;
    return (
      <div style={{ display: "flex", gap: 8, fontSize: 14, marginTop: 4, flexWrap: "wrap" }}>
        <span style={{ color: C.muted, minWidth: 110 }}>{label}</span>
        <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>{value}</span>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 6 }}>
      <label style={S.label}>{label}</label>
      <input style={S.input} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || label} />
    </div>
  );
}

export default function SupplierList({ suppliers, requests, quotes, onOpenQuote, onReadAgain, raisePoFor, canEdit, onField, onAddSupplier, onAddContact, onContactField, onRemoveContact }) {
  const [search, setSearch] = useState("");

  // Open requests per supplier, shown on the line.
  const openBySupplier = useMemo(() => {
    const counts = new Map();
    for (const r of requests || []) {
      if (!["Draft", "Sent", "Reply", "Pro forma"].includes(r.status)) continue;
      const key = r.supplier_id || (r.supplier_name || "").trim().toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [requests]);

  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return [...(suppliers || [])]
      .filter((s) => {
        const text = [s.name, s.email, s.phone, s.accountNo, ...(s.contacts || []).flatMap((c) => [c.name, c.email])]
          .join(" ")
          .toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));
  }, [suppliers, search]);

  const exactMatch = (suppliers || []).some((s) => (s.name || "").trim().toLowerCase() === search.trim().toLowerCase());

  return (
    <div>
      <input
        style={{ ...S.input, marginTop: 10 }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search supplier, contact, email, phone or account no…"
      />
      {canEdit && search.trim() && !exactMatch && (
        <button
          type="button"
          className="stk-btn"
          style={{ ...S.reqActionBtnMuted, marginTop: 8 }}
          onClick={() => {
            onAddSupplier(search.trim());
            setSearch(search.trim());
          }}
        >
          <Plus size={12} /> Add "{search.trim()}" as a new supplier
        </button>
      )}

      <Section title="Suppliers" count={shown.length} defaultOpen>
        {shown.map((s) => {
          const open = openBySupplier.get(s.id) || openBySupplier.get((s.name || "").trim().toLowerCase()) || 0;
          const summary = [s.terms, s.phone, open ? `${open} open request${open === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
          return (
            <RecordRow key={s.id} title={s.name} summary={summary}>
              <Field label="Email" value={s.email} canEdit={canEdit} onChange={(v) => onField(s.id, "email", v)} />
              <Field label="Phone" value={s.phone} canEdit={canEdit} onChange={(v) => onField(s.id, "phone", v)} />
              <Field label="Our account no" value={s.accountNo} canEdit={canEdit} onChange={(v) => onField(s.id, "accountNo", v)} placeholder="Our account no (prints on the PO)" />
              {canEdit ? (
                <div style={{ marginTop: 6 }}>
                  <label style={S.label}>Terms</label>
                  <select style={S.input} value={s.terms || ""} onChange={(e) => onField(s.id, "terms", e.target.value)}>
                    <option value="">Terms not known</option>
                    <option value="Account">Account</option>
                    <option value="Pro forma">Pro forma</option>
                  </select>
                </div>
              ) : (
                <Field label="Terms" value={s.terms} canEdit={false} />
              )}
              <Field label="Address" value={s.address} canEdit={canEdit} onChange={(v) => onField(s.id, "address", v)} />
              <Field label="VAT number" value={s.vatNumber} canEdit={canEdit} onChange={(v) => onField(s.id, "vatNumber", v)} />

              {(() => {
                const theirs = (quotes || []).filter(
                  (q) => q.supplier_id === s.id || (!q.supplier_id && (q.supplier_name || "").trim().toLowerCase() === (s.name || "").trim().toLowerCase())
                );
                return (
                  theirs.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                      <label style={S.label}>Their quotes ({theirs.length}), newest first</label>
                      <QuoteLines quotes={theirs} onOpen={onOpenQuote} onReadAgain={onReadAgain} raisePoFor={raisePoFor} showSupplier={false} />
                    </div>
                  )
                );
              })()}

              <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={S.label}>Contact people</label>
                  {canEdit && (
                    <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => onAddContact(s.id)}>
                      <Plus size={12} /> Add contact
                    </button>
                  )}
                </div>
                {(s.contacts || []).length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No contacts yet.</div>}
                {(s.contacts || []).map((c) =>
                  canEdit ? (
                    <div key={c.id} style={{ ...S.formGrid, marginTop: 6 }}>
                      <input style={S.input} value={c.name || ""} onChange={(e) => onContactField(s.id, c.id, "name", e.target.value)} placeholder="Contact name" />
                      <div style={{ display: "flex", gap: 6 }}>
                        <input style={{ ...S.input, flex: 1 }} value={c.email || ""} onChange={(e) => onContactField(s.id, c.id, "email", e.target.value)} placeholder="Email" />
                        <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => onRemoveContact(s.id, c.id)} title="Remove this contact">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={c.id} style={{ fontSize: 14, marginTop: 4 }}>
                      {c.name || "—"} {c.email && <span style={{ color: C.muted }}>· {c.email}</span>}
                    </div>
                  )
                )}
              </div>
            </RecordRow>
          );
        })}
      </Section>
    </div>
  );
}
