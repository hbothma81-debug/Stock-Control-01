// Items quoted: every line Claude read from the saved supplier quotes, one
// line per item, newest quote first, one search box (Heinrich, 19 Oct 2026:
// "one listing each item quoted ... with search filters"). On each supplier's
// own page, and as its own tab across all suppliers ("Both but all items
// should be on its own tab").
//
// On an item: Raise PO (a PO with just this line, for ordering or
// re-ordering later), Add as stock item (the New stock item form filled in),
// Link to a stock item (a Customer Stock item remembers this quote, and
// with the tick takes its price; Heinrich, 20 Oct 2026), and the quote's PDF.

import { useMemo, useState } from "react";
import TypeToFind from "../TypeToFind.jsx";
import { FileText, Link2, PackagePlus, ShoppingCart } from "lucide-react";
import Section from "../Section.jsx";
import RecordRow from "../RecordRow.jsx";
import { C, S } from "../theme.js";

// Items shown at once; the search finds the rest.
const SHOWN = 300;

const money = (n) =>
  n == null || n === "" ? "" : `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? String(d).slice(0, 10) : "");

// Picks a Customer Stock item and saves the link. Open item (1), Link to a
// stock item (2), type and pick (3), Save (4).
function LinkToStock({ q, line, lineIndex, stockItems, onLinkStock }) {
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [usePrice, setUsePrice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const options = useMemo(
    () =>
      (stockItems || []).map((it) => ({
        value: it.id,
        label: `${it.partNumber || "no code"} — ${it.name || ""}`,
        hint: it.customer || "",
      })),
    [stockItems]
  );
  if (!open) {
    return (
      <>
        <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => setOpen(true)}>
          <Link2 size={12} /> Link to a stock item
        </button>
        {note && <span style={{ color: C.accentFinished, fontSize: 13, alignSelf: "center" }}>{note}</span>}
      </>
    );
  }
  const chosen = (stockItems || []).find((it) => it.id === itemId);
  return (
    <div style={{ width: "100%", marginTop: 6 }}>
      <TypeToFind options={options} value={itemId} onChange={setItemId} placeholder="Type a Customer Stock code or description…" autoFocus />
      {chosen && (
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          Its cost now R{Number(chosen.value || 0).toFixed(2)}
          {chosen.supplier ? ` from ${chosen.supplier}` : ""}
        </div>
      )}
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14, marginTop: 6 }}>
        <input type="checkbox" checked={usePrice} onChange={(e) => setUsePrice(e.target.checked)} />
        Also use this quote's price (and supplier) for the item
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button
          type="button"
          className="stk-btn"
          style={S.reqActionBtnAlertOn}
          disabled={!itemId || busy}
          onClick={async () => {
            setBusy(true);
            const problem = await onLinkStock(q, line, lineIndex, itemId, usePrice);
            setBusy(false);
            if (problem) {
              alert(problem);
              return;
            }
            setNote(`Linked to ${chosen?.partNumber || "the item"}${usePrice ? ", price used" : ""}.`);
            setOpen(false);
            setItemId("");
            setUsePrice(false);
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="stk-btn" style={S.reqActionBtnMuted} disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ItemsList({ quotes, showSupplier = true, onOpenQuote, raiseItemPo, addStock, stockItems, onLinkStock }) {
  const [search, setSearch] = useState("");

  const items = useMemo(
    () =>
      (quotes || [])
        .filter((q) => q.read_status === "read")
        .flatMap((q) =>
          (q.lines || [])
            .map((line, lineIndex) => ({ q, line, lineIndex, key: `${q.id}-${lineIndex}` }))
            .filter(({ line }) => (line.description || "").trim())
        ),
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
          {shown.slice(0, SHOWN).map(({ q, line, lineIndex, key }) => {
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
                  {onLinkStock && <LinkToStock q={q} line={line} lineIndex={lineIndex} stockItems={stockItems} onLinkStock={onLinkStock} />}
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
