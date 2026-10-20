// Saved supplier quotes (supplier_quotes), shown in three places
// (Heinrich, 19 Oct 2026: "can we have both"): the Suppliers page's Quotes
// tab, under a quote request's line, and on a supplier's card.
//
// One line per quote, newest first: when, who, quote number, total and the
// lead time; open it for the rest and the PDF. Until Claude has read a PDF
// its figures are blank and the line says so; a PDF Claude could not read
// says "not read: totals not checked", never shown as checked.

import { useMemo, useState } from "react";
import { FileText, ShoppingCart } from "lucide-react";
import Section from "../Section.jsx";
import RecordRow from "../RecordRow.jsx";
import { C, S } from "../theme.js";

const money = (n) =>
  n == null || n === "" ? "" : `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? String(d).slice(0, 10) : "");

const STATUS = {
  waiting: { label: "READING", color: C.muted },
  read: { label: "READ", color: C.accentFinished },
  "not read": { label: "NOT READ", color: C.danger },
  "over cap": { label: "NOT READ", color: C.danger },
};

function Line({ label, children }) {
  if (children == null || children === "") return null;
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 14, marginTop: 4, flexWrap: "wrap" }}>
      <span style={{ color: C.muted, minWidth: 110 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>{children}</span>
    </div>
  );
}

// The quotes themselves, with no heading: for a request line or a card.
export function QuoteLines({ quotes, onOpen, onReadAgain, raisePoFor, showSupplier = true }) {
  if (!quotes?.length) return null;
  return quotes.map((q) => {
    const st = STATUS[q.read_status] || STATUS.waiting;
    const summary = [
      showSupplier ? q.supplier_name : "",
      q.quote_number,
      money(q.total_ex_vat) && `${money(q.total_ex_vat)} ex VAT`,
      q.lead_time,
      q.pr_number,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <RecordRow
        key={q.id}
        title={day(q.quote_date) || day(q.received_at) || day(q.created_at)}
        summary={summary || q.file_name}
        right={<span style={{ fontSize: 12, fontWeight: 700, color: st.color, whiteSpace: "nowrap" }}>{st.label}</span>}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => onOpen(q)}>
            <FileText size={12} /> Open {q.file_name}
          </button>
          {raisePoFor?.(q) && (
            <button type="button" className="stk-btn" style={S.reqActionBtnAlertOn} onClick={raisePoFor(q)}>
              <ShoppingCart size={12} /> Create PO from quote
            </button>
          )}
        </div>
        {q.read_status !== "read" && (
          <div style={{ color: q.read_status === "waiting" ? C.muted : C.danger, fontSize: 14, marginTop: 6 }}>
            {q.read_status === "waiting" ? "Claude has not read this PDF yet." : `PDF not read: totals not checked.${q.read_note ? ` (${q.read_note})` : ""}`}
            {q.read_status !== "waiting" && onReadAgain && (
              <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, marginLeft: 8 }} onClick={() => onReadAgain(q)}>
                Read again
              </button>
            )}
          </div>
        )}
        <Line label="Supplier">{q.supplier_name}</Line>
        <Line label="Request">{q.pr_number}</Line>
        <Line label="Document">{q.doc_type}</Line>
        <Line label="Quote no">{q.quote_number}</Line>
        <Line label="Quote date">{day(q.quote_date)}</Line>
        <Line label="Total ex VAT">{money(q.total_ex_vat)}</Line>
        <Line label="Total incl VAT">{money(q.total_incl_vat)}</Line>
        <Line label="Lead time">{q.lead_time}</Line>
        <Line label="Valid until">{day(q.valid_until)}</Line>
        <Line label="Received">{day(q.received_at)}</Line>
      </RecordRow>
    );
  });
}

// The Quotes tab: every saved quote, newest first, one search box.
export default function QuotesTab({ quotes, onOpen, onReadAgain, raisePoFor }) {
  const [search, setSearch] = useState("");
  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return (quotes || []).filter((q) => {
      const text = [q.supplier_name, q.quote_number, q.pr_number, q.file_name, q.lead_time, ...(q.lines || []).map((l) => l?.description)]
        .join(" ")
        .toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [quotes, search]);
  return (
    <div>
      <input
        style={{ ...S.input, marginTop: 10 }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search supplier, quote number, PR number or item…"
      />
      {quotes && quotes.length === 0 && (
        <div style={{ color: C.muted, marginTop: 12 }}>
          No quotes saved yet. They are saved from the suppliers' replies each time the mailbox is read.
        </div>
      )}
      {shown.length > 0 && (
        <Section title="Quotes" count={shown.length} defaultOpen>
          <QuoteLines quotes={shown} onOpen={onOpen} onReadAgain={onReadAgain} raisePoFor={raisePoFor} />
        </Section>
      )}
    </div>
  );
}
