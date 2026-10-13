// The Customer Stock list (Heinrich, 7 Oct 2026; docs/CUSTOMER-STOCK-SUPPLIER-PLAN.md).
//
// The catalogue of every customer's parts. Two levels since 12 Oct 2026,
// because Heinrich wanted a customer to be a page of his own rather than
// one pill in a long list of pills:
//
//   Level 1  every customer, A to Z, one card each with how many parts
//            and how many have stock, plus a type-to-find box to go
//            straight to one. Two taps to a customer's parts.
//   Level 2  that customer's page: Back, the parts A to Z by stock code,
//            a Has stock only tick and a sort choice. The customer box
//            stays at the top, so switching customer is one tap, not a
//            trip back and in again.
//
// Zero quantities are included (1,724 of the 1,732 parts on live are at
// zero, and the old list hid them). A tap opens a row in place with its
// boxes; no new page.
//
// Search is the Stock tab's own box (ctx.query), one per screen: on
// level 1 it narrows the customers and says how many of each one's parts
// match; on level 2 it narrows that customer's parts.
//
// The tick and the sort are remembered between visits in localStorage
// (STORE below); the open customer is not, so the tab always opens on
// the customer list.
//
// What a row reads: the stock code in its own box, the description in
// its own box, the customer's revision, the quantity, the cost (Rand
// values only; it is what we pay, never "price"), the supplier.
//
// Everything that changes a row goes through the same functions the old
// list used (ctx): Use / Add through the usage pop-up, Edit, Duplicate,
// Remove, Request stock, and updateCustomerStockField for the boxes.

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ClipboardList, Copy, FileText, ImageIcon, Pencil, Search, Trash2 } from "lucide-react";
import TypeToFind from "../TypeToFind.jsx";
import { C, S } from "../theme.js";
import { stockSearchText, searchWords, matchesWords } from "../lib/stockSearch.js";

// Codes sort as people read them: HPE-10 after HPE-9, letters case ignored.
const byCode = (a, b) =>
  String(a.partNumber || "").localeCompare(String(b.partNumber || ""), undefined, { numeric: true, sensitivity: "base" }) ||
  String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
const byDescription = (a, b) =>
  String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true, sensitivity: "base" }) || byCode(a, b);
const byMostOnHand = (a, b) => Number(b.qty || 0) - Number(a.qty || 0) || byCode(a, b);
const SORTS = { code: byCode, description: byDescription, qty: byMostOnHand };
const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const NO_CUSTOMER = "No customer";

// How many of a customer's parts are drawn before the "Show them all"
// button. 200 rows redraw on a keystroke without the typing stuttering.
const PAGE = 200;

// What the tick and the sort were set to last time. A browser with
// storage switched off just starts fresh every visit.
const STORE = "customerStockView";
function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}") || {};
  } catch {
    return {};
  }
}

const box = {
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "3px 8px",
  background: "transparent",
  whiteSpace: "nowrap",
};

// A text box that saves when it is left or on Enter, never per keystroke,
// and is rebuilt when the stored value changes under it.
function SaveOnLeave({ value, onSave, style, placeholder, title, type = "text" }) {
  return (
    <input
      key={value ?? ""}
      type={type}
      step={type === "number" ? "any" : undefined}
      defaultValue={value ?? ""}
      placeholder={placeholder}
      title={title}
      style={style}
      onBlur={(e) => {
        if (e.target.validity?.badInput) return;
        if (String(e.target.value) !== String(value ?? "")) onSave(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.target.blur();
      }}
    />
  );
}

export default function CustomerStock({ ctx }) {
  const { allocationsForItem, canDelete, canEditItems, canEditQty, canRequisition, canSeeValue, canView, drawingLookup,
    isLowStock, items, master, openDrawingPreviewByPartNumber, openDuplicate, openEdit, openPreview, openRequest,
    openUsageModal, query, removeItem, setQuery, updateCustomerStockField } = ctx;
  const saved = readStore();
  const [hasStockOnly, setHasStockOnly] = useState(!!saved.hasStockOnly);
  const [sort, setSort] = useState(SORTS[saved.sort] ? saved.sort : "code");
  const [customer, setCustomer] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState(null);

  // A new customer, a new search, a new sort: back to the first page.
  useEffect(() => {
    setShowAll(false);
  }, [customer, query, hasStockOnly, sort]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ hasStockOnly, sort }));
    } catch {
      // Storage off: the view simply starts fresh next time.
    }
  }, [hasStockOnly, sort]);

  const words = searchWords(query);
  const all = (items || []).filter((it) => it.mainCat === "custom");
  const nameOf = (it) => (it.customer || "").trim() || NO_CUSTOMER;
  // On the customer list the customer's name counts, so typing it finds
  // them. On one customer's page it does not: every row carries the same
  // name, so a letter of it ("h" for HPE) matched all 1,677 parts and the
  // search looked dead (12 Oct 2026).
  const matches = (it) => matchesWords(stockSearchText(it, [it.customerRevision]), words);
  const matchesHere = (it) => matchesWords(stockSearchText({ ...it, customer: "" }, [it.customerRevision]), words);

  // Every customer with parts, with the counts the cards read.
  const byCustomer = new Map();
  for (const it of all) {
    const k = nameOf(it);
    if (!byCustomer.has(k)) byCustomer.set(k, []);
    byCustomer.get(k).push(it);
  }
  const customers = [...byCustomer.keys()].sort(byName);

  // The parts on the open customer's page, after the tick and the search.
  const mine = customer ? byCustomer.get(customer) || [] : [];
  const shown = mine
    .filter((it) => !hasStockOnly || Number(it.qty) > 0)
    .filter(matchesHere)
    .sort(SORTS[sort] || byCode);
  // HPE alone has 1,677 parts. Drawing every one of them cost about a
  // fifth of a second on each letter typed, so the search box felt stuck.
  // The page draws a window and offers the rest on a button.
  const drawn = showAll ? shown : shown.slice(0, PAGE);

  // The Stock tab's own search box, drawn down here instead of at the top
  // of the page (Heinrich, 13 Oct 2026: up there it "reads difficult").
  // Still one search box on the screen: App.jsx leaves its own out for
  // this division.
  const searchBox = (what) => (
    <div style={{ ...S.searchWrap, maxWidth: 320 }}>
      <Search size={16} color={C.muted} />
      <input style={S.searchInput} placeholder={`Search ${what}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
    </div>
  );

  const customerBox = (
    <TypeToFind
      style={{ width: 240 }}
      inputStyle={{ ...S.managerFactorInput, width: "100%", padding: "7px 24px 7px 9px", boxSizing: "border-box" }}
      options={customers.map((name) => ({
        value: name,
        label: name,
        hint: `${(byCustomer.get(name) || []).length} parts`,
      }))}
      value={customer || ""}
      onChange={(v) => {
        setCustomer(v || null);
        setOpenId(null);
      }}
      emptyLabel="All customers"
      title="Go to a customer's parts"
    />
  );

  function row(it) {
    const isOpen = openId === it.id;
    const low = isLowStock(it);
    const drawing = it.partNumber && drawingLookup?.[it.partNumber.trim()];
    const reserved = allocationsForItem ? allocationsForItem(it.id) : [];
    const held = reserved.reduce((sum, a) => sum + (Number(a.qty_allocated) - Number(a.qty_used)), 0);
    return (
      <div key={it.id} style={{ ...S.reqCard, padding: "8px 10px", borderLeft: `4px solid ${low ? C.danger : Number(it.qty) > 0 ? C.accentFinished : C.border}` }}>
        <button
          type="button"
          className="stk-btn"
          onClick={() => setOpenId(isOpen ? null : it.id)}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", color: C.text, cursor: "pointer", padding: 0, textAlign: "left", flexWrap: "wrap", font: "inherit" }}
        >
          <span style={{ ...box, fontFamily: "monospace", fontSize: 13, color: C.accentRaw, borderColor: `${C.accentRaw}88` }} title="Stock code">
            {it.partNumber || "no code"}
          </span>
          <span style={{ ...box, flex: "1 1 220px", minWidth: 0, whiteSpace: "normal", fontWeight: 600 }} title="Description">
            {it.name}
          </span>
          {it.customerRevision && <span style={{ ...box, color: C.muted }} title="Customer's revision">rev {it.customerRevision}</span>}
          <span style={{ ...box, fontWeight: 700, color: low ? C.danger : Number(it.qty) > 0 ? C.text : C.muted }} title="On hand">
            {it.qty} {it.unit || "ea"}
          </span>
          {canSeeValue && <span style={{ ...box, color: C.muted }} title="Cost, what we pay">R{Number(it.value || 0).toFixed(2)}</span>}
          {it.supplier && <span style={{ ...box, color: C.muted }} title="Supplier">{it.supplier}</span>}
          {low && (
            <span style={S.lowTag}>
              <AlertTriangle size={11} strokeWidth={2.5} /> below {it.low}
            </span>
          )}
        </button>
        {isOpen && (
          <div style={{ marginTop: 8 }}>
            <div className="stk-meta-row" style={S.rowMeta}>
              {it.customer && <span style={S.customerTag}>{it.customer}</span>}
              {held > 0 && <span style={{ color: C.accentRaw, fontWeight: 600 }}>{held} reserved for jobs</span>}
              {canSeeValue && <span>Cost R{Number(it.value || 0).toFixed(2)} each · R{(Number(it.value || 0) * Number(it.qty || 0)).toFixed(2)} on hand</span>}
              {it.loc && <span>Shelf {it.loc}</span>}
              {drawing && canView("drawings") && (
                <button type="button" className="stk-btn" style={S.drawingTag} onClick={() => openDrawingPreviewByPartNumber(it.partNumber.trim())}>
                  <FileText size={14} /> Drawing
                </button>
              )}
              {it.attachmentType && (
                <button type="button" className="stk-btn" style={S.drawingTag} onClick={() => openPreview(it)} title={`View ${it.attachmentName || "attachment"}`}>
                  {it.attachmentType === "pdf" ? <FileText size={14} /> : <ImageIcon size={14} />} {it.attachmentName || "Attachment"}
                </button>
              )}
            </div>
            {it.comment && <div style={S.itemComment}>{it.comment}</div>}
            {canEditItems && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                {canSeeValue && (
                  <div>
                    <label style={S.label}>Cost (R)</label>
                    <SaveOnLeave type="number" value={it.value === 0 ? "" : it.value} placeholder="0" title="What we pay, each" style={{ ...S.managerFactorInput, display: "block" }} onSave={(v) => updateCustomerStockField(it.id, "value", v)} />
                  </div>
                )}
                <div>
                  <label style={S.label}>Low at</label>
                  <SaveOnLeave type="number" value={it.low === 0 ? "" : it.low} placeholder="0" title="Warn when on hand drops below this" style={{ ...S.managerFactorInput, display: "block" }} onSave={(v) => updateCustomerStockField(it.id, "low", v)} />
                </div>
                <div>
                  <label style={S.label}>Customer revision</label>
                  <SaveOnLeave value={it.customerRevision || ""} placeholder="e.g. A" title="The customer's own revision" style={{ ...S.managerFactorInput, width: 70, display: "block" }} onSave={(v) => updateCustomerStockField(it.id, "customerRevision", v.trim())} />
                </div>
                <div>
                  <label style={S.label}>Supplier (optional)</label>
                  <TypeToFind
                    style={{ width: 180 }}
                    inputStyle={{ ...S.managerFactorInput, width: "100%", padding: "5px 24px 5px 7px", boxSizing: "border-box" }}
                    options={(master.suppliers || []).map((s) => s.name)}
                    value={it.supplier || ""}
                    allowNew
                    onChange={(v) => updateCustomerStockField(it.id, "supplier", v)}
                    emptyLabel="None: the customer's own part"
                  />
                </div>
                <div>
                  <label style={S.label}>Customer</label>
                  <TypeToFind
                    style={{ width: 160 }}
                    inputStyle={{ ...S.managerFactorInput, width: "100%", padding: "5px 24px 5px 7px", boxSizing: "border-box" }}
                    options={master.customers || []}
                    value={it.customer || ""}
                    // allowNew so a customer not on the master list (an
                    // imported sheet's name) still reads in the box.
                    allowNew
                    onChange={(v) => updateCustomerStockField(it.id, "customer", v)}
                    emptyLabel="No customer"
                  />
                </div>
              </div>
            )}
            <div style={{ ...S.rowControls, marginTop: 8 }}>
              <div style={S.qtyBlock}>
                {canEditQty("custom") && (
                  <button type="button" className="stk-btn" style={S.usageBtnUse} onClick={() => openUsageModal(it, "use")}>
                    Use
                  </button>
                )}
                <div style={S.qtyDisplay}>
                  <span style={{ ...S.qtyNum, color: low ? C.danger : C.text }}>{it.qty}</span>
                  <span style={S.qtyUnit}>{it.unit || "ea"}</span>
                </div>
                {canEditQty("custom") && (
                  <button type="button" className="stk-btn" style={S.usageBtnAdd} onClick={() => openUsageModal(it, "add")}>
                    Add
                  </button>
                )}
              </div>
              <div style={S.rowActionIcons}>
                {canRequisition && (
                  <button type="button" className="stk-btn" style={S.iconRowBtn} onClick={() => openRequest({ lines: [{ item: it }] })} title="Request stock for this part">
                    <ClipboardList size={14} />
                  </button>
                )}
                {canEditItems && (
                  <button type="button" className="stk-btn" style={S.iconRowBtn} onClick={() => openEdit(it)} title="Edit item">
                    <Pencil size={14} />
                  </button>
                )}
                {canEditItems && (
                  <button type="button" className="stk-btn" style={S.iconRowBtn} onClick={() => openDuplicate(it)} title="Duplicate">
                    <Copy size={14} />
                  </button>
                )}
                {canDelete && (
                  <button type="button" className="stk-btn" style={S.deleteBtn} onClick={() => removeItem(it.id)} title="Remove item">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Level 1: the customers. A search narrows it to the ones with a
  // matching part (or whose own name matches) and says how many.
  if (!customer) {
    const cards = customers
      .map((name) => {
        const list = byCustomer.get(name) || [];
        return {
          name,
          total: list.length,
          onHand: list.filter((it) => Number(it.qty) > 0).length,
          matching: words.length === 0 ? list.length : list.filter(matches).length,
        };
      })
      .filter((c) => c.matching > 0 || matchesWords(c.name.toLowerCase(), words));
    return (
      <div style={S.list}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          {customerBox}
          {searchBox("every customer's parts")}
          <span style={S.roleHint}>
            {all.length} part{all.length === 1 ? "" : "s"} for {customers.length} customer{customers.length === 1 ? "" : "s"},{" "}
            {all.filter((it) => Number(it.qty) > 0).length} with stock on hand.
          </span>
        </div>
        {cards.length === 0 && (
          <div style={S.empty}>
            {all.length === 0
              ? "Nothing here yet — add one above, or import a customer's sheet under Stock Manager."
              : "No customer has a part matching that."}
          </div>
        )}
        <div style={S.managerListFullPage}>
          {cards.map((c) => (
            <button
              key={c.name}
              type="button"
              className="stk-btn"
              style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}
              onClick={() => {
                setCustomer(c.name);
                setOpenId(null);
              }}
            >
              <span style={S.itemName}>{c.name}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {words.length > 0 && (
                  <span style={{ ...box, color: C.accentRaw, borderColor: `${C.accentRaw}88` }}>{c.matching} matching</span>
                )}
                {c.onHand > 0 && <span style={{ ...box, color: C.muted }}>{c.onHand} with stock</span>}
                <span style={S.gradeCount}>{c.total}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Level 2: one customer's page.
  const mineOnHand = mine.filter((it) => Number(it.qty) > 0).length;
  return (
    <div style={S.list}>
      <button
        type="button"
        className="stk-btn"
        style={{ ...S.prominentBackBtn, marginBottom: 10 }}
        onClick={() => {
          setCustomer(null);
          setOpenId(null);
        }}
      >
        <ChevronLeft size={18} strokeWidth={2.5} /> All customers
      </button>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{customer}</div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        {searchBox(`${customer}'s parts`)}
        <label style={S.checkRow}>
          <input type="checkbox" checked={hasStockOnly} onChange={(e) => setHasStockOnly(e.target.checked)} />
          Has stock only
        </label>
        <label style={{ ...S.checkRow, gap: 6 }}>
          Sort
          <select style={{ ...S.managerFactorInput, width: 160 }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="code">Stock code A–Z</option>
            <option value="description">Description A–Z</option>
            <option value="qty">Most on hand</option>
          </select>
        </label>
        <span style={S.roleHint}>
          {shown.length} of {mine.length} part{mine.length === 1 ? "" : "s"} match, {mineOnHand} with stock on hand.
        </span>
      </div>
      {shown.length === 0 && (
        <div style={S.empty}>{mine.length === 0 ? "No parts for this customer yet." : "Nothing here matches that."}</div>
      )}
      <div style={S.managerListFullPage}>{drawn.map(row)}</div>
      {drawn.length < shown.length && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => setShowAll(true)}>
            Show them all ({shown.length - drawn.length} more)
          </button>
          <span style={S.roleHint}>Showing the first {drawn.length}. Type in the search box to narrow it.</span>
        </div>
      )}
    </div>
  );
}
