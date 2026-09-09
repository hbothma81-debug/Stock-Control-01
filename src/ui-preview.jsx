// A scratch page for looking at the shared pieces on their own, with
// made-up data and no database or login behind them. Not part of the app
// -- nothing imports it and it is never linked from anywhere.
//
// Open http://localhost:5173/ui-preview.html while the dev server runs.

import React from "react";
import ReactDOM from "react-dom/client";
import { C, S, THEME_CSS } from "./theme.js";
import Section from "./Section.jsx";
import RecordRow from "./RecordRow.jsx";
import TypeToFind from "./TypeToFind.jsx";
import { FileText } from "lucide-react";

const PREVIEW_CUSTOMERS = ["Acme Steel", "acme fabrication", "Bell Equipment", "Greenzone", "HPE", "Zulu Engineering"];
const PREVIEW_SUPPLIERS = [
  { value: "s1", label: "Macsteel", hint: "Germiston branch" },
  { value: "s2", label: "NDE" },
  { value: "s3", label: "Test Steel Supplies" },
];

function TypeToFindDemo() {
  const [filter, setFilter] = React.useState("");
  const [supplier, setSupplier] = React.useState("s2");
  const [customer, setCustomer] = React.useState("");
  return (
    <Section title="Type to find" count={3}>
      <div style={S.roleHint}>Filter: empty means all. Nothing unknown can be typed in.</div>
      <TypeToFind options={PREVIEW_CUSTOMERS} value={filter} onChange={setFilter} emptyLabel="All customers" />
      <div style={S.roleHint} data-testid="filter-value">filter = "{filter}"</div>

      <div style={{ ...S.roleHint, marginTop: 10 }}>Value and label differ: stores the id, shows the name.</div>
      <TypeToFind options={PREVIEW_SUPPLIERS} value={supplier} onChange={setSupplier} emptyLabel="Select a supplier…" />
      <div style={S.roleHint} data-testid="supplier-value">supplier = "{supplier}"</div>

      <div style={{ ...S.roleHint, marginTop: 10 }}>Form field: a new name can be added.</div>
      <TypeToFind options={PREVIEW_CUSTOMERS} value={customer} onChange={setCustomer} allowNew emptyLabel="Type to find or add…" />
      <div style={S.roleHint} data-testid="customer-value">customer = "{customer}"</div>
    </Section>
  );
}

function Preview() {
  // The colours live on a data-stk-theme attribute, same as the app.
  React.useEffect(() => {
    document.documentElement.setAttribute("data-stk-theme", "dark");
  }, []);

  return (
    <>
      <style>{`
        ${THEME_CSS}
        body { margin: 0; background: ${C.bg}; color: ${C.text}; font-family: ${"ui-monospace, SFMono-Regular, Menlo, monospace"}; }
      `}</style>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: 20 }}>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Shared pieces, on their own</h2>
        <div style={S.roleHint}>Made-up data. No database, no login.</div>

        <TypeToFindDemo />

        <Section title="Open by default" count={3}>
          <RecordRow title="DN-0042" summary="JOB-0014 — Greenzone" right={<span style={S.roleHint}>To customer</span>}>
            <div className="stk-meta-row" style={S.rowMeta}>
              <span>Piet at the gate</span>
              <span>Sent by Heinrich</span>
              <span>5 September 2026</span>
            </div>
            <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, marginTop: 8 }}>
              <FileText size={13} /> View document
            </button>
          </RecordRow>

          <RecordRow
            title="M8x40-SHCS"
            summary="Job: JOB-0011"
            right={<span style={{ ...S.reqStatusTag, ...S.reqStatus_cancelled }}>Used 120</span>}
          >
            <div className="stk-meta-row" style={S.rowMeta}>
              <span>By Prince</span>
              <span>5 September 2026, 14:02</span>
            </div>
            <div style={S.itemComment}>Short by 4, took from the spares bin.</div>
          </RecordRow>

          <RecordRow title="A very long part number that should wrap rather than overflow the row 1234567890" summary="No customer">
            <div style={S.roleHint}>Checking a long title does not push the chevron off the edge.</div>
          </RecordRow>
        </Section>

        <Section title="Shut by default" defaultOpen={false} count={0}>
          <div style={S.empty}>Nothing here yet.</div>
        </Section>

        <Section
          title="With a control on the heading"
          count={2}
          right={
            <button type="button" className="stk-btn" style={S.reqActionBtn}>
              <FileText size={13} /> Raise PO for all 2
            </button>
          }
        >
          <RecordRow title="PO-0002" summary="Test Steel Supplies">
            <div style={S.roleHint}>The heading button must not toggle this section.</div>
          </RecordRow>
          <RecordRow title="PO-0003" summary="NDE" right={<span style={S.roleHint}>R 1,240.00</span>}>
            <div style={S.roleHint}>Second row.</div>
          </RecordRow>
        </Section>
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>
);
