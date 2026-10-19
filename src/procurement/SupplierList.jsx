// Suppliers -> Supplier list: every supplier, A-Z, one line each. A tap
// opens that supplier's own page with three tabs, Quotes first (Heinrich,
// 19 Oct 2026: big drop-downs out; "Quotes first, Details second", with
// "Items quoted" between them). Heinrich, 19 Oct 2026: "the stock manager is a mission to go
// to each time". The same supplier list as Stock Manager -> Suppliers, read
// and saved the same way (App's setMaster and its save queue); that tab
// stays as it was. Removing a supplier stays in Stock Manager only.
//
// Editing follows Stock Manager's own rule: admins and people with "Can
// access Stock Manager". Everyone else who sees the page reads the cards.

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ItemsList from "./ItemsList.jsx";
import SupplierCategoriesField, { CategoryChips } from "./SupplierCategories.jsx";
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

const TABS = [
  { key: "quotes", label: "Quotes" },
  { key: "items", label: "Items quoted" },
  { key: "details", label: "Details" },
];

const tabStyle = (active) => ({
  ...S.chip,
  ...(active ? { background: S.chipActive.background, color: S.chipActive.color, fontWeight: S.chipActive.fontWeight, border: `1px solid ${C.accentFinished}` } : {}),
});

const sameSupplier = (q, s) =>
  q.supplier_id === s.id || (!q.supplier_id && (q.supplier_name || "").trim().toLowerCase() === (s.name || "").trim().toLowerCase());

function SupplierPage({ s, quotes, categoryList, onBack, onOpenQuote, onReadAgain, raisePoFor, raiseItemPo, addStock, canEdit, onField, onAddContact, onContactField, onRemoveContact }) {
  const [tab, setTab] = useState("quotes");
  const theirs = (quotes || []).filter((q) => sameSupplier(q, s));
  return (
    <div>
      <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, marginTop: 10 }} onClick={onBack}>
        <ChevronLeft size={14} /> All suppliers
      </button>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10 }}>{s.name}</div>
      <div style={{ color: C.muted, fontSize: 14 }}>{[s.terms, s.phone, s.accountNo && `Our account ${s.accountNo}`].filter(Boolean).join(" · ")}</div>
      {s.buys && <div style={{ fontSize: 14, marginTop: 2 }}>Buys: {s.buys}</div>}
      <CategoryChips value={s.categories} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className="stk-btn" style={tabStyle(tab === t.key)} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === "quotes" ? ` (${theirs.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "quotes" &&
        (theirs.length ? (
          <Section title="Quotes" count={theirs.length} defaultOpen>
            <QuoteLines quotes={theirs} onOpen={onOpenQuote} onReadAgain={onReadAgain} raisePoFor={raisePoFor} showSupplier={false} />
          </Section>
        ) : (
          <div style={{ color: C.muted, marginTop: 12 }}>No quotes saved from {s.name} yet.</div>
        ))}

      {tab === "items" && (
        <ItemsList quotes={theirs} showSupplier={false} onOpenQuote={onOpenQuote} raiseItemPo={raiseItemPo} addStock={addStock} />
      )}

      {tab === "details" && (
        <div style={{ ...S.reqCard, marginTop: 12 }}>
          {categoryList && (
            <>
              <SupplierCategoriesField value={s.categories || []} options={categoryList} onChange={(v) => onField(s.id, "categories", v)} canEdit={canEdit} />
              <Field label="What we buy" value={s.buys} canEdit={canEdit} onChange={(v) => onField(s.id, "buys", v)} placeholder="e.g. Engineering steel, EN8 bar" />
            </>
          )}
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
        </div>
      )}
    </div>
  );
}

export default function SupplierList(props) {
  const { suppliers, requests, quotes, canEdit, onAddSupplier, categoryList, onCategoryList } = props;
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const [editingList, setEditingList] = useState(false);

  // Open requests and saved quotes per supplier, shown on the line.
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
        const text = [s.name, s.email, s.phone, s.accountNo, s.buys, ...(s.categories || []), ...(s.contacts || []).flatMap((c) => [c.name, c.email])]
          .join(" ")
          .toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));
  }, [suppliers, search]);

  const opened = openId && (suppliers || []).find((s) => s.id === openId);
  if (opened) return <SupplierPage {...props} s={opened} onBack={() => setOpenId(null)} />;

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

      {categoryList && canEdit && (
        <CategoryListEditor
          open={editingList}
          onToggle={() => setEditingList((v) => !v)}
          list={categoryList}
          suppliers={suppliers}
          onChange={onCategoryList}
        />
      )}

      {/* A pill per category while nothing is typed; a supplier in two
          categories is under both. Typing searches every supplier instead. */}
      {categoryList && !search.trim() ? (
        <>
          {[...categoryList, ""].map((cat) => {
            const inCat = shown.filter((s) => (cat ? (s.categories || []).includes(cat) : !(s.categories || []).length));
            if (!inCat.length) return null;
            return (
              <Section key={cat || "none"} title={cat || "No category"} count={inCat.length} defaultOpen={false}>
                {inCat.map((s) => line(s))}
              </Section>
            );
          })}
        </>
      ) : (
      <Section title="Suppliers" count={shown.length} defaultOpen>
        {shown.map((s) => line(s))}
      </Section>
      )}
    </div>
  );

  // One supplier's line: a tap opens its page.
  function line(s) {
    const open = openBySupplier.get(s.id) || openBySupplier.get((s.name || "").trim().toLowerCase()) || 0;
    const quoteCount = (quotes || []).filter((q) => sameSupplier(q, s)).length;
    const summary = [
      s.buys,
      s.terms,
      s.phone,
      open ? `${open} open request${open === 1 ? "" : "s"}` : "",
      quoteCount ? `${quoteCount} quote${quoteCount === 1 ? "" : "s"}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    // Laid out as RecordRow is, so it reads the same as every other list.
    return (
      <div key={s.id} style={{ ...S.reqCard, padding: "8px 10px" }} title={s.buys || undefined}>
        <button
          type="button"
          className="stk-btn"
          onClick={() => setOpenId(s.id)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 8,
            width: "100%",
            background: "transparent",
            border: "none",
            color: C.text,
            cursor: "pointer",
            padding: 0,
            textAlign: "left",
            flexWrap: "wrap",
            font: "inherit",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</span>
          <span style={{ flex: 1, minWidth: 0, color: C.muted, fontSize: 14 }}>{summary}</span>
          <ChevronRight size={16} style={{ flexShrink: 0, color: C.muted }} />
        </button>
      </div>
    );
  }
}

// The short category list, edited where it is used (Heinrich: "Can always
// edit the list"). A category still on a supplier cannot be taken off the
// list: take it off those suppliers first, so none is left pointing at
// nothing.
function CategoryListEditor({ open, onToggle, list, suppliers, onChange }) {
  const [adding, setAdding] = useState("");
  const usedBy = (c) => (suppliers || []).filter((s) => (s.categories || []).includes(c)).length;
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={onToggle}>
        {open ? "Done editing the category list" : "Edit the category list"}
      </button>
      {open && (
        <div style={{ ...S.reqCard, marginTop: 6 }}>
          {list.map((c) => {
            const n = usedBy(c);
            return (
              <div key={c} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ flex: 1 }}>{c}</span>
                <span style={{ color: C.muted, fontSize: 13 }}>{n} supplier{n === 1 ? "" : "s"}</span>
                <button
                  type="button"
                  className="stk-btn"
                  style={S.managerDelete}
                  disabled={n > 0}
                  title={n > 0 ? "Still on suppliers: take it off them first" : `Take ${c} off the list`}
                  onClick={() => onChange(list.filter((x) => x !== c))}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input style={{ ...S.input, flex: 1 }} value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="New category" />
            <button
              type="button"
              className="stk-btn"
              style={S.reqActionBtnMuted}
              disabled={!adding.trim() || list.some((x) => x.toLowerCase() === adding.trim().toLowerCase())}
              onClick={() => {
                onChange([...list, adding.trim()]);
                setAdding("");
              }}
            >
              <Plus size={12} /> Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
