// Items quoted: every line Claude read from the saved supplier quotes, one
// line per item, newest quote first, one search box (Heinrich, 19 Oct 2026:
// "one listing each item quoted ... with search filters"). On each supplier's
// own page, and as its own tab across all suppliers ("Both but all items
// should be on its own tab").
//
// On an item: Raise PO (a PO with just this line, for ordering or
// re-ordering later), Add as stock item (the New stock item form filled in),
// and the quote's PDF.

import { useMemo, useState } from "react";
import { FileText, PackagePlus, ShoppingCart } from "lucide-react";
import Section from "../Section.jsx";
import RecordRow from "../RecordRow.jsx";
import { C, S } from "../theme.js";

// Items shown at once; the search finds the rest.
const SHOWN = 300;

const money = (n) =>
  n == null || n === "" ? "" : `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? String(d).slice(0, 10) : "");

export default function ItemsList({ quotes, showSupplier = true, onOpenQuote, raiseItemPo, addStock }) {
  const [search, setSearch] = useState("");

  const items = useMemo(
    () =>
      (quotes || [])
        .filter((q) => q.read_status === "read")
        .flatMap((q) => (q.lines || []).filter((l) => (l.description || "").trim()).map((line, i) => ({ q, line, key: `${q.id}-${i}` }))),
    [quotes]
  );

  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(({ q, line }) => {
      const text = [line.description, q.supplier_name, q.quote_number, q.pr_number].join(" ").toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [items, search]);

  return (
    <div>
      <input
        style={{ ...S.input, marginTop: 10 }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={showSupplier ? "Search item, supplier or quote number…" : "Search item or quote number…"}
      />
      {items.length === 0 && (
        <div style={{ color: C.muted, marginTop: 12 }}>No items yet. They come from the quotes once Claude has read them.</div>
      )}
      {shown.length > 0 && (
        <Section title="Items quoted" count={shown.length} defaultOpen>
          {shown.slice(0, SHOWN).map(({ q, line, key }) => {
            const unit = line.unit_price_ex_vat != null ? line.unit_price_ex_vat : null;
            const summary = [
              showSupplier ? q.supplier_name : "",
              line.qty != null ? `qty ${line.qty}` : "",
              unit != null ? `${money(unit)} each ex VAT` : money(line.line_total_ex_vat),
              day(q.quote_date || q.received_at),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <RecordRow key={key} title={line.description} summary={summary}>
                <div style={{ fontSize: 14, color: C.muted }}>
                  {q.supplier_name} · quote {q.quote_number || q.file_name}
                  {q.pr_number ? ` · ${q.pr_number}` : ""}
                  {line.line_total_ex_vat != null ? ` · line ${money(line.line_total_ex_vat)} ex VAT` : ""}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {raiseItemPo && (
                    <button type="button" className="stk-btn" style={S.reqActionBtnAlertOn} onClick={() => raiseItemPo(q, line)}>
                      <ShoppingCart size={12} /> Raise PO
                    </button>
                  )}
                  {addStock && (
                    <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => addStock(q, line)}>
                      <PackagePlus size={12} /> Add as stock item
                    </button>
                  )}
                  <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => onOpenQuote(q)}>
                    <FileText size={12} /> Open the quote
                  </button>
                </div>
              </RecordRow>
            );
          })}
          {shown.length > SHOWN && (
            <div style={{ color: C.muted, fontSize: 13 }}>Showing the newest {SHOWN} of {shown.length}. Search to find the rest.</div>
          )}
        </Section>
      )}
    </div>
  );
}
