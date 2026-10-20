// "Last quoted" on an opened stock item (Customer Stock): the supplier
// quotes linked to it from Suppliers -> Items quoted (stock_item_quotes,
// setup-procurement-8-stock-item-quotes.sql), newest first, the newest three.
// A tap opens the quote's PDF (Heinrich, 20 Oct 2026: "this should also
// open the quote"); only people with the Procurement tick can open it.
//
// Read only when an item is opened, never the whole table. Shows nothing on
// a database without the table, or when nothing is linked.

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { supabase } from "../lib/supabaseClient.js";
import { S } from "../theme.js";

const money = (n) =>
  n == null ? "" : `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function LastQuoted({ itemId, onOpenQuote }) {
  const [links, setLinks] = useState(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("stock_item_quotes")
      .select("id, quote_id, supplier_name, unit_price, quote_number, quote_date, used_as_price")
      .eq("stock_item_id", itemId)
      .order("quote_date", { ascending: false, nullsFirst: false })
      .limit(3)
      .then(({ data, error }) => alive && setLinks(error ? [] : data || []));
    return () => {
      alive = false;
    };
  }, [itemId]);

  if (!links?.length) return null;
  return (
    <div style={{ marginTop: 6 }}>
      {links.map((l, i) => (
        <button
          key={l.id}
          type="button"
          className="stk-btn"
          style={{ ...S.drawingTag, marginRight: 6, marginTop: 4 }}
          onClick={() => onOpenQuote(l.quote_id)}
          title="Open the quote"
        >
          <FileText size={14} />
          {i === 0 ? "Last quoted: " : "Quoted: "}
          {[l.supplier_name, money(l.unit_price), l.quote_date].filter(Boolean).join(", ")}
          {l.quote_number ? ` (${l.quote_number})` : ""}
          {l.used_as_price ? " · price used" : ""}
        </button>
      ))}
    </div>
  );
}
