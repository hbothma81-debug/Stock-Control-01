import { useState } from "react";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { C, S } from "../theme.js";
import Section from "../Section.jsx";
import DrawingThumb from "../drawings/DrawingThumb.jsx";
import { FILTER_COLUMNS, filterRows, sortRows, nextSort } from "./sheetRows.js";

// The Production tab's Sheet view (Heinrich, 22 Oct 2026: "a excel type
// view, the same we have for the new Jobs page, where all the items are on
// one list with the icon/picture of the pdf drawing linked to the item").
// One department at a time, one row per item at its stage, the same three
// pills as the cards. A tap on a row opens a pop-up for that item: its
// drawing larger, its count and Log, Flag shortage. What the pop-up holds
// is drawn by App.jsx (renderPopup), because the count box, the tick and
// the shortage form all live there; this file only lays the sheet out.
//
// groups: [{ key, title, danger, defaultOpen, quiet, empty, rows }]
// A row: { key, drawing: { storagePath, title, open } | null, job, jobLink,
//   customer, code, description, qty, done, toGo, days, daysText, due,
//   dueText, rep, status, alert }

// Switched on for the live site on Friday 23 Oct 2026 (Heinrich: "add the
// production view switch", a day before the planned Saturday). Was false
// since 22 Oct; practice always had it.
export const PRODUCTION_SHEET_VIEW_ON = true;
const LIVE_HOST = "stock-control-01.vercel.app";
export const sheetViewOffered = () =>
  PRODUCTION_SHEET_VIEW_ON || (typeof window !== "undefined" && window.location.hostname !== LIVE_HOST);

const COLUMNS = [
  { key: "drawing", label: "Drawing", sortable: false },
  { key: "job", label: "Job" },
  { key: "customer", label: "Customer" },
  { key: "code", label: "Code" },
  { key: "description", label: "Description" },
  { key: "qty", label: "Qty", num: true },
  { key: "done", label: "Done", num: true },
  { key: "toGo", label: "To go", num: true },
  { key: "days", label: "Days waiting", num: true },
  { key: "due", label: "Due" },
  { key: "rep", label: "Sales rep" },
  { key: "status", label: "Status" },
];

export default function ProductionSheet({ groups, renderPopup }) {
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);
  const [openKey, setOpenKey] = useState(null);

  const cell = { padding: "4px 6px", verticalAlign: "middle", whiteSpace: "nowrap", fontSize: 13 };
  const head = { ...cell, ...S.label, marginTop: 0, marginBottom: 0, textAlign: "left", fontWeight: 400, cursor: "pointer", userSelect: "none" };
  const box = { ...S.input, fontSize: 12, padding: "2px 5px", width: "100%", minWidth: 60, boxSizing: "border-box" };
  const filtering = Object.values(filters).some((v) => String(v || "").trim());

  // The row the pop-up shows is looked up afresh on every draw, so a Log
  // that reloads the queue shows its new count without closing it.
  const allRows = groups.flatMap((g) => g.rows);
  const openRow = openKey ? allRows.find((r) => r.key === openKey) : null;

  const table = (rows) => (
    <div style={{ overflowX: "auto" }}>
      <table className="stk-sheet" style={{ borderCollapse: "collapse", width: "100%", minWidth: 1000 }}>
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const sorted = sort && sort.key === col.key ? sort.dir : null;
              return (
                <th
                  key={col.key}
                  style={{ ...head, ...(col.num ? { textAlign: "right" } : {}), ...(col.sortable === false ? { cursor: "default" } : {}) }}
                  onClick={col.sortable === false ? undefined : () => setSort((s) => nextSort(s, col.key))}
                  title={col.sortable === false ? undefined : "Sort by this column"}
                >
                  {col.label}
                  {sorted === "asc" && <ChevronUp size={12} style={{ verticalAlign: "middle" }} />}
                  {sorted === "desc" && <ChevronDown size={12} style={{ verticalAlign: "middle" }} />}
                </th>
              );
            })}
          </tr>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.key} style={{ ...cell, paddingTop: 0 }}>
                {FILTER_COLUMNS.includes(col.key) ? (
                  <input
                    style={box}
                    value={filters[col.key] || ""}
                    placeholder="Filter"
                    onChange={(e) => setFilters((f) => ({ ...f, [col.key]: e.target.value }))}
                  />
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              onClick={() => setOpenKey(row.key)}
              style={{ cursor: "pointer", borderTop: `1px solid ${C.border}`, ...(row.alert ? { boxShadow: `inset 3px 0 0 ${C.danger}` } : {}) }}
              title="Open this item"
            >
              <td style={{ ...cell, width: 1 }} onClick={(e) => row.drawing && e.stopPropagation()}>
                {row.drawing ? <DrawingThumb storagePath={row.drawing.storagePath} title={row.drawing.title} onOpen={row.drawing.open} /> : null}
              </td>
              <td style={cell} onClick={(e) => row.jobLink && e.stopPropagation()}>
                {row.jobLink ? (
                  <button
                    type="button"
                    className="stk-btn"
                    title="Open the job"
                    onClick={row.jobLink}
                    style={{ background: "none", border: "none", padding: 0, font: "inherit", color: C.accentRaw, textDecoration: "underline", cursor: "pointer" }}
                  >
                    {row.job}
                  </button>
                ) : (
                  row.job
                )}
              </td>
              <td style={cell}>{row.customer}</td>
              <td style={cell}>{row.code}</td>
              <td style={{ ...cell, whiteSpace: "normal", minWidth: 180 }}>{row.description}</td>
              <td style={{ ...cell, textAlign: "right" }}>{row.qty ?? ""}</td>
              <td style={{ ...cell, textAlign: "right" }}>{row.done ?? ""}</td>
              <td style={{ ...cell, textAlign: "right" }}>{row.toGo ?? ""}</td>
              <td style={{ ...cell, textAlign: "right" }}>{row.daysText}</td>
              <td style={cell}>{row.dueText}</td>
              <td style={cell}>{row.rep}</td>
              <td style={{ ...cell, ...(row.alert ? { color: C.danger, fontWeight: 600 } : {}) }}>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      {filtering && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => setFilters({})}>
            <X size={12} /> Clear filters
          </button>
        </div>
      )}
      {groups.map((g) => {
        const shown = sortRows(filterRows(g.rows, filters), sort?.key, sort?.dir);
        return (
          <Section
            key={g.key}
            title={g.title}
            count={filtering ? `${shown.length} of ${g.rows.length}` : g.rows.length}
            danger={g.danger}
            defaultOpen={g.defaultOpen !== false}
            quiet={g.quiet}
          >
            {g.rows.length === 0 ? (
              <div style={S.empty}>{g.empty || "Nothing here."}</div>
            ) : shown.length === 0 ? (
              <div style={S.empty}>Nothing here matches the filters.</div>
            ) : (
              table(shown)
            )}
          </Section>
        );
      })}
      {openRow && (
        <div style={S.modalOverlay} onClick={() => setOpenKey(null)}>
          <div style={{ ...S.modal, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            {renderPopup(openRow, () => setOpenKey(null))}
          </div>
        </div>
      )}
    </>
  );
}
