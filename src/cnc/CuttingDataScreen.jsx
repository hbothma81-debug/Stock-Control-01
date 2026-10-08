// The CNC tab's Cutting data (build step 5; Heinrich, 8 Oct 2026: cutting
// data first, admins only). LEO1600 CUTTING DATA.xlsx moved into the app:
// a button per sheet as the Excel tabs, the rows in the sheet's order, one
// search box. An admin changes a cell in place (saved on leaving it, read
// back), adds or removes a row, and imports a whole workbook (all or
// nothing) or exports it. Everyone with the CNC tick reads it.

import { useEffect, useState } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { C, F, S } from "../theme.js";
import { addCuttingRow, importWorkbook, loadCuttingData, removeCuttingRow, saveCuttingRow } from "./cncTables.js";
import EngineSource, { NEEDS } from "./EngineSource.jsx";
import { cellsFromTable, readCell, rowMatches, workbookSheets } from "./cuttingData.js";

const { borderColor: _unused, ...chipActiveRest } = S.chipActive;
const CHIP_ON = { ...chipActiveRest, border: `1px solid ${C.accentFinished}` };

export default function CuttingDataScreen({ machine, isAdmin, userName }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // { id, col, text }
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  async function reload() {
    setError("");
    try {
      const d = await loadCuttingData(machine.id);
      setData(d);
      setSheet((s) => (s && d.sheets.some((x) => x.sheet === s) ? s : d.sheets[0]?.sheet || null));
    } catch (err) {
      setError(`The cutting data could not be loaded: ${err.message || err}`);
    }
  }

  useEffect(() => {
    setData(null);
    reload();
  }, [machine.id]);

  async function onImport(file) {
    if (!file) return;
    setError("");
    setNote("");
    let XLSX;
    try {
      XLSX = await import("xlsx");
    } catch {
      setError("The spreadsheet reader could not load. Reload the page and try again.");
      return;
    }
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheets = workbookSheets(wb.SheetNames, (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, raw: true, blankrows: false }));
      if (!sheets.length) {
        setError("That file has no sheets with a header row.");
        return;
      }
      const words = sheets.map((s) => `${s.sheet} (${s.rows.length})`).join(", ");
      if (!window.confirm(`Replace ${machine.name}'s cutting data with ${file.name}?\n\n${words}\n\nThe sheets named here are replaced as the file has them; others are left alone.`)) return;
      setBusy("Importing…");
      const n = await importWorkbook({ machineId: machine.id, sheets, userName });
      setNote(`Imported ${file.name}: ${sheets.length} sheets, ${n} rows now held.`);
      await reload();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy("");
    }
  }

  async function onExport() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    for (const s of data.sheets) {
      const rows = data.rows.filter((r) => r.sheet === s.sheet).map((r) => r.data);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cellsFromTable(s.columns, rows)), s.sheet.slice(0, 31));
    }
    XLSX.writeFile(wb, `${machine.name} CUTTING DATA.xlsx`);
  }

  async function commitCell(row, col, text) {
    setEditing(null);
    const value = readCell(text);
    if ((row.data[col] ?? null) === value) return;
    try {
      const saved = await saveCuttingRow({ id: row.id, data: { ...row.data, [col]: value }, userName });
      setData((d) => ({ ...d, rows: d.rows.map((r) => (r.id === saved.id ? saved : r)) }));
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function addRow(cols) {
    const mine = data.rows.filter((r) => r.sheet === sheet);
    const rowNo = (mine.length ? Math.max(...mine.map((r) => r.row_no)) : 0) + 1;
    try {
      const added = await addCuttingRow({ machineId: machine.id, sheet, rowNo, data: Object.fromEntries(cols.map((c) => [c, null])), userName });
      setData((d) => ({ ...d, rows: [...d.rows, added] }));
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function removeRow(row) {
    if (!window.confirm(`Remove row ${row.row_no} of ${sheet}?`)) return;
    try {
      await removeCuttingRow(row.id);
      setData((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== row.id) }));
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  const banner = <EngineSource what="spreadsheet" needs={NEEDS.cutting} />;

  if (error && !data) return <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>;
  if (!data) return <div style={S.empty}>Loading cutting data…</div>;

  const current = data.sheets.find((s) => s.sheet === sheet) || null;
  const cols = current?.columns || [];
  const rows = data.rows.filter((r) => r.sheet === sheet && rowMatches(r.data, cols, search));
  const cell = { padding: "3px 6px", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", fontSize: 12.5, verticalAlign: "top" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {banner}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {isAdmin && (
          <label className="stk-btn" style={{ ...S.chip, display: "inline-flex", alignItems: "center", gap: 6, cursor: busy ? "default" : "pointer" }}>
            <Upload size={14} /> {busy || "Import from Excel"}
            <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} disabled={!!busy} onChange={(e) => onImport(e.target.files?.[0])} />
          </label>
        )}
        {data.sheets.length > 0 && (
          <button type="button" className="stk-btn" style={S.chip} onClick={onExport}>
            <Download size={14} /> Export to Excel
          </button>
        )}
        <span style={{ fontSize: 13, color: C.muted }}>
          {machine.name} · {data.rows.length} rows in {data.sheets.length} sheets
        </span>
      </div>
      {note && <div style={{ color: C.accentFinished, fontSize: 14 }}>{note}</div>}
      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
      {data.sheets.length === 0 ? (
        <div style={S.empty}>No cutting data yet{isAdmin ? ": import LEO1600 CUTTING DATA.xlsx with the button above." : "."}</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {data.sheets.map((s) => (
              <button key={s.sheet} type="button" className="stk-btn" style={{ ...S.chip, ...(sheet === s.sheet ? CHIP_ON : {}) }} onClick={() => setSheet(s.sheet)}>
                {s.sheet} <span style={{ opacity: 0.7 }}>{data.rows.filter((r) => r.sheet === s.sheet).length}</span>
              </button>
            ))}
          </div>
          <input style={S.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this sheet (tool, material, insert…)" />
          <div style={{ overflow: "auto", maxHeight: 560, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <table style={{ borderCollapse: "collapse", fontFamily: F.body }}>
              <thead>
                <tr>
                  {isAdmin && <th style={{ ...cell, background: C.surface, position: "sticky", top: 0 }} />}
                  {cols.map((c) => (
                    <th key={c} style={{ ...cell, background: C.surface, position: "sticky", top: 0, textAlign: "left", color: C.muted, whiteSpace: "normal", minWidth: 70 }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    {isAdmin && (
                      <td style={cell}>
                        <button type="button" className="stk-btn" title="Remove this row" onClick={() => removeRow(r)} style={{ background: "transparent", border: "none", color: C.danger, cursor: "pointer", padding: 0 }}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    )}
                    {cols.map((c) => {
                      const isEditing = editing && editing.id === r.id && editing.col === c;
                      const v = r.data[c];
                      return (
                        <td
                          key={c}
                          style={{ ...cell, cursor: isAdmin ? "text" : "default", textAlign: typeof v === "number" ? "right" : "left" }}
                          title={v == null ? "" : String(v)}
                          onClick={() => isAdmin && !isEditing && setEditing({ id: r.id, col: c, text: v == null ? "" : String(v) })}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              style={{ ...S.input, padding: "2px 4px", fontSize: 12.5, minWidth: 80 }}
                              value={editing.text}
                              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                              onBlur={() => commitCell(r, c, editing.text)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                                if (e.key === "Escape") setEditing(null);
                              }}
                            />
                          ) : v == null ? (
                            ""
                          ) : (
                            String(v)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isAdmin && (
            <button type="button" className="stk-btn" style={{ ...S.chip, alignSelf: "flex-start" }} onClick={() => addRow(cols)}>
              <Plus size={13} /> Add a row to {sheet}
            </button>
          )}
        </>
      )}
    </div>
  );
}
