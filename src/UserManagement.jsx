import { useState, Fragment } from "react";
import { ChevronDown, RefreshCw, Trash2 } from "lucide-react";
import { F, C, S } from "./theme.js";
import { NAV_TABS, EXTRA_SECTIONS, SECTIONS } from "./constants.js";

// The User Management screen — who can see and do what.
//
// Split out of App.jsx, where it lived inside the Stock Manager as one
// branch of a long chain of tab conditionals. It sat among the master data
// screens but isn't master data at all: those describe the business (sizes,
// grades, customers), this decides access. Worth being readable on its own,
// since it is the most security-sensitive screen in the app — every check
// elsewhere trusts the flags set here.
//
// Admin-only. The caller does that gating; by the time this renders, the
// viewer is already known to be an admin.
//
// SavedCheck is passed in rather than imported: it closes over the parent's
// lastSaved state to flash a tick after an edit saves.
export default function UserManagement({
  people,
  master,
  updatePersonField,
  updatePersonPermission,
  toggleProcessTypeAccess,
  resetPersonAccess,
  deletePersonPermanently,
  SavedCheck,
}) {
  // Which cards are open. Nothing outside this screen cares, so it lives
  // here rather than in the parent.
  const [personExpanded, setPersonExpanded] = useState({});

  return (
    <>
      <div style={S.roleHint}>
        Everyone here signed up for their own account — you can't create a login for someone else. Once they've
        signed up, they'll appear below with zero access; tick what they should be able to do.
      </div>
      {people === null && <div style={S.empty}>Loading people…</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {(people || []).map((p) => (
          <div key={p.id} style={S.deptCard}>
            <div style={S.deptCardHead}>
              <button
                type="button"
                className="stk-btn"
                style={S.iconBtn}
                onClick={() => setPersonExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                title={personExpanded[p.id] ? "Collapse" : "Expand to set permissions"}
              >
                <ChevronDown size={16} style={{ transform: personExpanded[p.id] ? "rotate(180deg)" : "none" }} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center" }}>
                  {p.name}
                  <SavedCheck fieldKey={`person-${p.id}`} />
                </div>
                <div style={{ fontFamily: F.mono, fontSize: 12.5, color: C.muted }}>{p.email}</div>
              </div>
              <label style={{ ...S.deptToggleItem, flexShrink: 0 }}>
                <input type="checkbox" checked={p.isAdmin} onChange={(e) => updatePersonField(p.id, "isAdmin", e.target.checked)} />
                Admin
              </label>
              <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => resetPersonAccess(p.id)} title="Reset all access (keeps their login)">
                <RefreshCw size={13} />
              </button>
              <button
                type="button"
                className="stk-btn"
                style={{ ...S.managerDelete, color: C.danger }}
                onClick={() => deletePersonPermanently(p.id, p.name)}
                title="Permanently delete — removes their login entirely"
              >
                <Trash2 size={13} />
              </button>
            </div>
            {personExpanded[p.id] && (
            <>
            {/* An admin already has everything; showing the individual
                permissions would suggest they can be narrowed, which they
                can't while the Admin box is ticked. */}
            {!p.isAdmin && (
              <>
                <div style={S.deptPermGrid}>
                  <div />
                  <div style={S.deptPermHead}>View</div>
                  <div style={S.deptPermHead}>Edit qty</div>
                  {SECTIONS.map((sec) => (
                    <Fragment key={sec}>
                      <div style={S.deptPermLabel}>{[...NAV_TABS, ...EXTRA_SECTIONS].find((t) => t.key === sec)?.label}</div>
                      <input
                        type="checkbox"
                        checked={!!p.permissions[sec]?.view}
                        onChange={(e) => updatePersonPermission(p.id, sec, "view", e.target.checked)}
                      />
                      <input
                        type="checkbox"
                        checked={!!p.permissions[sec]?.edit}
                        onChange={(e) => updatePersonPermission(p.id, sec, "edit", e.target.checked)}
                      />
                    </Fragment>
                  ))}
                </div>
                <div style={S.deptToggleGrid}>
                  <label style={S.deptToggleItem}>
                    <input
                      type="checkbox"
                      checked={!!p.canAddItems}
                      onChange={(e) => updatePersonField(p.id, "canAddItems", e.target.checked)}
                    />
                    Can add new material
                  </label>
                  <label style={S.deptToggleItem}>
                    <input
                      type="checkbox"
                      checked={!!p.canEditItems}
                      onChange={(e) => updatePersonField(p.id, "canEditItems", e.target.checked)}
                    />
                    Can edit / duplicate items
                  </label>
                  <label style={S.deptToggleItem}>
                    <input
                      type="checkbox"
                      checked={!!p.canRequisition}
                      onChange={(e) => updatePersonField(p.id, "canRequisition", e.target.checked)}
                    />
                    Can request stock
                  </label>
                  <label style={S.deptToggleItem}>
                    <input
                      type="checkbox"
                      checked={!!p.canMarkReceived}
                      onChange={(e) => updatePersonField(p.id, "canMarkReceived", e.target.checked)}
                    />
                    Can mark stock received
                  </label>
                  <label style={S.deptToggleItem}>
                    <input
                      type="checkbox"
                      checked={!!p.canSeeValue}
                      onChange={(e) => updatePersonField(p.id, "canSeeValue", e.target.checked)}
                    />
                    Can see Rand values
                  </label>
                  <label style={S.deptToggleItem}>
                    <input
                      type="checkbox"
                      checked={!!p.canAccessStockManager}
                      onChange={(e) => updatePersonField(p.id, "canAccessStockManager", e.target.checked)}
                    />
                    Can access Stock Manager
                  </label>
                  <label style={S.deptToggleItem}>
                    <input
                      type="checkbox"
                      checked={!!p.canManageRequisitions}
                      onChange={(e) => updatePersonField(p.id, "canManageRequisitions", e.target.checked)}
                    />
                    Can manage requisitions (full buyer powers)
                  </label>
                  <label style={S.deptToggleItem}>
                    <input
                      type="checkbox"
                      checked={!!p.canRaisePO}
                      onChange={(e) => updatePersonField(p.id, "canRaisePO", e.target.checked)}
                    />
                    Can raise Purchase Orders
                  </label>
                  <label style={S.deptToggleItem}>
                    <input
                      type="checkbox"
                      checked={!!p.canViewUsageLog}
                      onChange={(e) => updatePersonField(p.id, "canViewUsageLog", e.target.checked)}
                    />
                    Can view Usage Log
                  </label>
                  <label style={S.deptToggleItem}>
                    <input
                      type="checkbox"
                      checked={!!p.canManageInvoicing}
                      onChange={(e) => updatePersonField(p.id, "canManageInvoicing", e.target.checked)}
                    />
                    Can manage Invoicing
                  </label>
                </div>
              </>
            )}
            <label style={S.deptToggleItem}>
              <input
                type="checkbox"
                checked={!!p.isSalesPerson}
                onChange={(e) => updatePersonField(p.id, "isSalesPerson", e.target.checked)}
              />
              Is a Sales Person (can be assigned to jobs, appears in Sales Person pickers)
            </label>
            <label style={S.deptToggleItem}>
              <input
                type="checkbox"
                checked={!!p.isShortageHandler}
                onChange={(e) => updatePersonField(p.id, "isShortageHandler", e.target.checked)}
              />
              Is a Shortage Handler (always notified of shortages, sees the Shortage Center tab)
            </label>
            <div style={{ marginTop: 8 }}>
              <label style={S.label}>Department</label>
              <select
                style={S.input}
                value={p.department || ""}
                onChange={(e) => updatePersonField(p.id, "department", e.target.value)}
              >
                <option value="">Not set</option>
                {master.staffDepartments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 8 }}>
              <label style={S.label}>
                Production access — which processes this person handles (gives them the Production tab, scoped to just these)
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {master.jobProcessTypes.map((proc) => {
                  const has = (p.allowedProcessTypes || []).includes(proc);
                  return (
                    <button
                      type="button"
                      key={proc}
                      className="stk-btn"
                      onClick={() => toggleProcessTypeAccess(p.id, proc)}
                      style={{ ...S.segBtn, ...(has ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}) }}
                    >
                      {proc}
                    </button>
                  );
                })}
              </div>
            </div>
            </>
            )}
          </div>
        ))}
        {people && people.length === 0 && <div style={S.empty}>Nobody's signed up yet.</div>}
      </div>
    </>
  );
}
