// The Customer Stock list (Heinrich, 7 Oct 2026; docs/CUSTOMER-STOCK-SUPPLIER-PLAN.md).
//
// The catalogue of every customer's parts. Two levels since 12 Oct 2026,
// because Heinrich wanted a customer to be a page of his own rather than
// one pill in a long list of pills:
//
//   Level 1  every customer, A to Z, one card each with how many parts
//            and how many have stock, plus a type-to-find box to go
//            straight to one. Two taps to a customer's parts.
//   Level 2  that customer's page, with two tabs: Items and Customer.
//
// Since 21 Oct 2026 the Items tab is a sheet, the same as the job page's
// Items tab (Heinrich: "I want to change the customer stock codes to the
// same layout, it reads better"). Headings once, a line between the
// columns, one row per part, and everything typed straight onto the line:
// code, description, revision, cost, low at, supplier, shelf. On hand
// keeps its Use and Add buttons, because a quantity change is a usage
// record, never a typed number. Request stock and the drawing sit on the
// right of the line, then a ⋮ ("3 dots on the end", his words) for the
// rest: Edit, Duplicate, an attachment, Remove, and "The rest of it",
// which opens one line under the row with what is reserved, what it is
// worth, its note, its supplier quotes and which customer it belongs to.
//
// The Customer tab is the same customer card as Stock Manager -> Customers
// (Heinrich, 21 Oct 2026: "not 2 separate menus"), plus the counts: the
// name, how many parts, how many with stock, what is on hand, and the
// contact people. Filled in here or there, the same rows either way.
//
// Zero quantities are included (1,724 of the 1,732 parts on live are at
// zero, and the old list hid them).
//
// Search is the Stock tab's own box (ctx.query), one per screen: on
// level 1 it narrows the customers and says how many of each one's parts
// match; on level 2 it narrows that customer's parts.
//
// The tick, the sort and the open tab are remembered between visits in
// localStorage (STORE below); the open customer is not, so the tab always
// opens on the customer list.
//
// Everything that changes a row goes through the same functions the old
// list used (ctx): Use / Add through the usage pop-up, Edit, Duplicate,
// Remove, Request stock, and updateCustomerStockField for the boxes.

import { rand } from "../lib/money.js";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronUp, ClipboardList, Copy, FileText, ImageIcon, Pencil, Plus, Search, Trash2 } from "lucide-react";
import CardMenu from "../CardMenu.jsx";
import EditableName from "../EditableName.jsx";
import MoneyInput from "../MoneyInput.jsx";
import LastQuoted from "../procurement/LastQuoted.jsx";
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
//
// as: the box to draw instead of a plain input — MoneyInput for a cost, so
// it carries its grey R like every other price box in the app.
function SaveOnLeave({ value, onSave, style, placeholder, title, type = "text", as: As = "input", onInput }) {
  return (
    <As
      key={value ?? ""}
      type={type}
      step={type === "number" ? "any" : undefined}
      defaultValue={value ?? ""}
      placeholder={placeholder}
      title={title}
      style={style}
      onInput={onInput}
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
  const { addCustomerContact, allocationsForItem, canDelete, canEditItems, canEditQty, canRequisition, canSeeValue,
    canView, drawingLookup, isLowStock, items, master, openDrawingPreviewByPartNumber, openDuplicate, openEdit,
    openPreview, openRequest, openUsageModal, query, removeCustomerContact, removeItem, renameMasterEntry, setQuery,
    updateCustomerContact, updateCustomerStockField, openSupplierQuote } = ctx;
  const saved = readStore();
  const [hasStockOnly, setHasStockOnly] = useState(!!saved.hasStockOnly);
  const [sort, setSort] = useState(SORTS[saved.sort] ? saved.sort : "code");
  const [custTab, setCustTab] = useState(saved.custTab === "customer" ? "customer" : "items");
  const [customer, setCustomer] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState(null);

  // A new customer, a new search, a new sort: back to the first page.
  useEffect(() => {
    setShowAll(false);
  }, [customer, query, hasStockOnly, sort]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ hasStockOnly, sort, custTab }));
    } catch {
      // Storage off: the view simply starts fresh next time.
    }
  }, [hasStockOnly, sort, custTab]);

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

  // The sheet's own styles, the job page's Items tab to the pixel: the
  // lines between the columns come from the shared `stk-sheet` class.
  const cell = { padding: "3px 4px", verticalAlign: "middle", whiteSpace: "nowrap" };
  const head = { ...cell, ...S.label, marginTop: 0, marginBottom: 0, textAlign: "left", fontWeight: 400 };
  const sheetBox = { ...S.input, fontSize: 13, padding: "3px 6px", width: "100%" };
  const miniBtn = { ...S.reqActionBtnMuted, padding: "2px 6px", fontSize: 11 };
  // Code and Description grow with their text as it is typed, never
  // narrower than they start and at most 70% wider — the job sheet's rule.
  const fitWidth = (text, least) => Math.min(Math.round(least * 1.7), Math.max(least, String(text || "").length * 7.5 + 16));
  const fitStyle = (base, text, least) => ({ ...base, width: fitWidth(text, least) });
  const growOnInput = (least) => (e) => { e.target.style.width = `${fitWidth(e.target.value, least)}px`; };
  const columns = 8 + (canSeeValue ? 1 : 0);

  // One part as a line on the sheet.
  function sheetRow(it) {
    const isOpen = openId === it.id;
    const low = isLowStock(it);
    const drawing = it.partNumber && drawingLookup?.[it.partNumber.trim()];
    const reserved = allocationsForItem ? allocationsForItem(it.id) : [];
    const held = reserved.reduce((sum, a) => sum + (Number(a.qty_allocated) - Number(a.qty_used)), 0);
    // The edge the card used to carry on its left: red below the low
    // mark, green with stock on the shelf, plain at nought.
    const edge = low ? C.danger : Number(it.qty) > 0 ? C.accentFinished : C.border;
    const qtyColour = low ? C.danger : Number(it.qty) > 0 ? C.text : C.muted;
    const menu = [];
    if (canEditItems) {
      menu.push({ label: "Edit item", icon: <Pencil size={14} />, onClick: () => openEdit(it) });
      menu.push({ label: "Duplicate", icon: <Copy size={14} />, onClick: () => openDuplicate(it) });
    }
    if (it.attachmentType) {
      menu.push({
        label: it.attachmentName || "Attachment",
        icon: it.attachmentType === "pdf" ? <FileText size={14} /> : <ImageIcon size={14} />,
        onClick: () => openPreview(it),
      });
    }
    menu.push({
      label: isOpen ? "Hide the rest" : "The rest of it",
      icon: isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />,
      onClick: () => setOpenId(isOpen ? null : it.id),
    });
    if (canDelete) menu.push({ label: "Remove part", icon: <Trash2 size={14} />, onClick: () => removeItem(it.id) });
    return (
      <tbody key={it.id}>
        <tr style={{ borderTop: `1px solid ${C.border}` }}>
          <td style={{ ...cell, borderLeft: `4px solid ${edge}` }}>
            {canEditItems ? (
              <SaveOnLeave
                value={it.partNumber || ""}
                onSave={(v) => updateCustomerStockField(it.id, "partNumber", v.trim())}
                onInput={growOnInput(130)}
                style={{ ...fitStyle(sheetBox, it.partNumber, 130), fontFamily: "monospace", color: C.accentRaw }}
                placeholder="Stock code"
                title="The customer's stock code"
              />
            ) : (
              <span style={{ fontFamily: "monospace", fontSize: 13, color: C.accentRaw }}>{it.partNumber || "no code"}</span>
            )}
          </td>
          <td style={cell}>
            {canEditItems ? (
              <SaveOnLeave
                value={it.name || ""}
                onSave={(v) => updateCustomerStockField(it.id, "name", v)}
                onInput={growOnInput(240)}
                style={fitStyle(sheetBox, it.name, 240)}
                placeholder="Description"
                title="What the part is"
              />
            ) : (
              <span style={{ fontSize: 13, fontWeight: 600 }}>{it.name}</span>
            )}
          </td>
          <td style={cell}>
            {canEditItems ? (
              <SaveOnLeave
                value={it.customerRevision || ""}
                onSave={(v) => updateCustomerStockField(it.id, "customerRevision", v.trim())}
                style={{ ...sheetBox, width: 58 }}
                placeholder="rev"
                title="The customer's own revision"
              />
            ) : (
              <span style={{ fontSize: 13, color: C.muted }}>{it.customerRevision || ""}</span>
            )}
          </td>
          <td style={{ ...cell, textAlign: "right" }} title={held > 0 ? `${held} reserved for jobs` : "On hand"}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
              {canEditQty("custom") && (
                <button type="button" className="stk-btn" style={miniBtn} onClick={() => openUsageModal(it, "use")} title="Take some off the shelf">
                  Use
                </button>
              )}
              <span style={{ fontSize: 13, fontWeight: 700, color: qtyColour }}>{it.qty}</span>
              <span style={{ fontSize: 11, color: C.muted }}>{it.unit || "ea"}</span>
              {held > 0 && <span style={{ fontSize: 11, color: C.accentRaw }}>({held} res)</span>}
              {canEditQty("custom") && (
                <button type="button" className="stk-btn" style={miniBtn} onClick={() => openUsageModal(it, "add")} title="Put some on the shelf">
                  Add
                </button>
              )}
            </span>
          </td>
          {canSeeValue && (
            <td style={cell}>
              {canEditItems ? (
                <SaveOnLeave
                  as={MoneyInput}
                  type="number"
                  value={it.value === 0 ? "" : it.value}
                  onSave={(v) => updateCustomerStockField(it.id, "value", v)}
                  style={{ ...sheetBox, width: 92 }}
                  placeholder="0"
                  title="What we pay, each"
                />
              ) : (
                <span style={{ fontSize: 13, color: C.muted }}>{rand(it.value || 0)}</span>
              )}
            </td>
          )}
          <td style={cell}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {canEditItems ? (
                <SaveOnLeave
                  type="number"
                  value={it.low === 0 ? "" : it.low}
                  onSave={(v) => updateCustomerStockField(it.id, "low", v)}
                  style={{ ...sheetBox, width: 64 }}
                  placeholder="0"
                  title="Warn when on hand drops below this"
                />
              ) : (
                <span style={{ fontSize: 13, color: C.muted }}>{it.low || ""}</span>
              )}
              {low && (
                <span title={`Below ${it.low}`} style={{ display: "inline-flex" }}>
                  <AlertTriangle size={12} strokeWidth={2.5} color={C.danger} />
                </span>
              )}
            </span>
          </td>
          <td style={cell}>
            {canEditItems ? (
              <TypeToFind
                style={{ width: 150 }}
                inputStyle={{ ...sheetBox, padding: "3px 22px 3px 6px", boxSizing: "border-box" }}
                options={(master.suppliers || []).map((s) => s.name)}
                value={it.supplier || ""}
                allowNew
                onChange={(v) => updateCustomerStockField(it.id, "supplier", v)}
                emptyLabel="None"
                title="Who we buy it from. None: the customer's own part."
              />
            ) : (
              <span style={{ fontSize: 13, color: C.muted }}>{it.supplier || ""}</span>
            )}
          </td>
          <td style={cell}>
            {canEditItems ? (
              <SaveOnLeave
                value={it.loc || ""}
                onSave={(v) => updateCustomerStockField(it.id, "loc", v)}
                style={{ ...sheetBox, width: 80 }}
                placeholder="Shelf"
                title="Where it is kept"
              />
            ) : (
              <span style={{ fontSize: 13, color: C.muted }}>{it.loc || ""}</span>
            )}
          </td>
          <td style={{ ...cell, width: 1 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, justifyContent: "flex-end" }}>
              {canRequisition && (
                <button type="button" className="stk-btn" style={S.iconRowBtn} onClick={() => openRequest({ lines: [{ item: it }] })} title="Request stock for this part">
                  <ClipboardList size={14} />
                </button>
              )}
              {drawing && canView("drawings") && (
                <button type="button" className="stk-btn" style={S.iconRowBtn} onClick={() => openDrawingPreviewByPartNumber(it.partNumber.trim())} title="View drawing">
                  <FileText size={14} />
                </button>
              )}
              <CardMenu items={menu} fixed />
            </span>
          </td>
        </tr>
        {isOpen && (
          <tr>
            <td colSpan={columns} style={{ ...cell, whiteSpace: "normal", padding: "6px 10px 10px 14px" }}>
              <div className="stk-meta-row" style={S.rowMeta}>
                {it.customer && <span style={S.customerTag}>{it.customer}</span>}
                {held > 0 && <span style={{ color: C.accentRaw, fontWeight: 600 }}>{held} reserved for jobs</span>}
                {canSeeValue && <span>Cost {rand(it.value || 0)} each · {rand(Number(it.value || 0) * Number(it.qty || 0))} on hand</span>}
              </div>
              {/* Supplier quotes linked to this part on Suppliers -> Items
                  quoted (src/procurement/LastQuoted.jsx); a tap opens the quote. */}
              {canSeeValue && openSupplierQuote && <LastQuoted itemId={it.id} onOpenQuote={openSupplierQuote} />}
              {it.comment && <div style={S.itemComment}>{it.comment}</div>}
              {canEditItems && (
                <div style={{ marginTop: 6 }}>
                  <label style={S.label}>Customer</label>
                  <TypeToFind
                    style={{ width: 200 }}
                    inputStyle={{ ...S.managerFactorInput, width: "100%", padding: "5px 24px 5px 7px", boxSizing: "border-box" }}
                    options={master.customers || []}
                    value={it.customer || ""}
                    // allowNew so a customer not on the master list (an
                    // imported sheet's name) still reads in the box.
                    allowNew
                    onChange={(v) => updateCustomerStockField(it.id, "customer", v)}
                    emptyLabel="No customer"
                    title="Move this part to another customer"
                  />
                </div>
              )}
            </td>
          </tr>
        )}
      </tbody>
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
  const worth = mine.reduce((sum, it) => sum + Number(it.value || 0) * Number(it.qty || 0), 0);
  // Renaming is the master list's own rename, which carries the parts, the
  // jobs and the shortages with it. Only offered for a customer the master
  // list holds: "No customer" is not a name, and a name that only exists
  // on imported parts would be added to the list by renaming it.
  const onMasterList = customer !== NO_CUSTOMER && (master.customers || []).includes(customer);
  const canRename = canEditItems && onMasterList && !!renameMasterEntry;
  const contacts = master.customerContacts?.[customer] || [];

  const itemsPane = (
    <>
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
      {shown.length === 0 ? (
        <div style={S.empty}>{mine.length === 0 ? "No parts for this customer yet." : "Nothing here matches that."}</div>
      ) : (
        // Narrow screens scroll the sheet sideways, never wrap it.
        <div style={{ overflowX: "auto" }}>
          <table className="stk-sheet" style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={head}>Code</th>
                <th style={head}>Description</th>
                <th style={head} title="The customer's own revision">Rev</th>
                <th style={{ ...head, textAlign: "right" }}>On hand</th>
                {canSeeValue && <th style={head} title="What we pay, each">Cost</th>}
                <th style={head} title="Warn when on hand drops below this">Low at</th>
                <th style={head}>Supplier</th>
                <th style={head} title="Where it is kept">Shelf</th>
                <th style={head}></th>
              </tr>
            </thead>
            {drawn.map(sheetRow)}
          </table>
        </div>
      )}
      {drawn.length < shown.length && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => setShowAll(true)}>
            Show them all ({shown.length - drawn.length} more)
          </button>
          <span style={S.roleHint}>Showing the first {drawn.length}. Type in the search box to narrow it.</span>
        </div>
      )}
    </>
  );

  // The customer's own card: the counts, and the same contact people as
  // Stock Manager -> Customers, so there is one place to keep them.
  const customerPane = (
    <div style={S.deptCard}>
      <div style={S.deptCardHead}>
        {canRename ? (
          <EditableName
            value={customer}
            onCommit={(v) => {
              renameMasterEntry("customers", customer, v);
              setCustomer(v.trim());
            }}
            style={{ fontWeight: 600, fontSize: 15 }}
          />
        ) : (
          <span style={{ fontWeight: 600, fontSize: 15 }}>{customer}</span>
        )}
      </div>
      <div className="stk-meta-row" style={{ ...S.rowMeta, marginTop: 4 }}>
        <span>{mine.length} part{mine.length === 1 ? "" : "s"}</span>
        <span>{mineOnHand} with stock</span>
        {canSeeValue && <span>{rand(worth)} on hand</span>}
      </div>
      {canRename && (
        <div style={{ ...S.roleHint, marginTop: 2 }}>
          Renaming the customer here renames it on every part, job and shortage.
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label style={S.label}>Contact people</label>
          {canEditItems && addCustomerContact && (
            <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => addCustomerContact(customer)}>
              <Plus size={12} /> Add contact
            </button>
          )}
        </div>
        {contacts.map((c) => (
          <div key={c.id} style={{ marginTop: 6 }}>
            <input
              style={S.input}
              value={c.name}
              onChange={(e) => updateCustomerContact(customer, c.id, "name", e.target.value)}
              placeholder="Contact name"
              disabled={!canEditItems}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <input
                style={{ ...S.input, flex: 1 }}
                type="email"
                value={c.email}
                onChange={(e) => updateCustomerContact(customer, c.id, "email", e.target.value)}
                placeholder="Email"
                disabled={!canEditItems}
              />
              <input
                style={{ ...S.input, flex: 1 }}
                type="tel"
                value={c.phone || ""}
                onChange={(e) => updateCustomerContact(customer, c.id, "phone", e.target.value)}
                placeholder="Phone"
                disabled={!canEditItems}
              />
              {canEditItems && removeCustomerContact && (
                <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeCustomerContact(customer, c.id)}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
        {contacts.length === 0 && <div style={{ ...S.roleHint, marginTop: 4 }}>No contacts added yet.</div>}
      </div>
    </div>
  );

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
      {/* No customer picker here, by his word on 13 Oct 2026: the heading
          says which customer it is, and All customers is how you reach
          another. Two boxes reading the same name is what he had taken off. */}
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{customer}</div>
      <div style={S.segRow}>
        {[
          { key: "items", label: `Items (${mine.length})` },
          { key: "customer", label: "Customer" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            className="stk-btn"
            onClick={() => setCustTab(t.key)}
            style={{
              ...S.segBtn,
              ...(custTab === t.key ? { background: C.accentTint, color: C.accentRaw, border: `1px solid ${C.accentRaw}` } : {}),
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{custTab === "customer" ? customerPane : itemsPane}</div>
    </div>
  );
}
