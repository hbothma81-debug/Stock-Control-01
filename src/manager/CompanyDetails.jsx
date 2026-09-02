import { Paperclip, Image as ImageIcon } from "lucide-react";
import { C, S } from "../theme.js";

// Your own company's letterhead — the details printed at the top of every
// Purchase Order.
//
// Split out of App.jsx as the first of the Stock Manager tabs. It is the
// cleanest of them: three things from the parent and no local state, which
// makes it a fair test of the boundary before the larger tabs follow.
export default function CompanyDetails({ companyDetails, updateCompanyDetail, handleCompanyLogoSelect }) {
  return (
    <>
      <div style={S.roleHint}>This is your own letterhead — it appears at the top of every Purchase Order.</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        {companyDetails.logo ? (
          <img src={companyDetails.logo} alt="" style={S.supplierLogoPreview} />
        ) : (
          <div style={S.supplierLogoPlaceholder}>
            <ImageIcon size={16} color={C.muted} />
          </div>
        )}
        <label className="stk-btn" style={{ ...S.addBtn, cursor: "pointer" }}>
          <Paperclip size={14} />
          Upload logo
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleCompanyLogoSelect} />
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={S.label}>Company name</label>
        <input
          style={S.input}
          value={companyDetails.name}
          onChange={(e) => updateCompanyDetail("name", e.target.value)}
        />
      </div>
      <div style={{ marginTop: 10 }}>
        <label style={S.label}>Address</label>
        <input
          style={S.input}
          value={companyDetails.address}
          onChange={(e) => updateCompanyDetail("address", e.target.value)}
        />
      </div>
      <div style={S.formGrid}>
        <div>
          <label style={S.label}>Phone</label>
          <input
            style={S.input}
            value={companyDetails.phone}
            onChange={(e) => updateCompanyDetail("phone", e.target.value)}
          />
        </div>
        <div>
          <label style={S.label}>Email</label>
          <input
            style={S.input}
            type="email"
            value={companyDetails.email}
            onChange={(e) => updateCompanyDetail("email", e.target.value)}
          />
        </div>
      </div>
      <div style={S.formGrid}>
        <div>
          <label style={S.label}>VAT number</label>
          <input
            style={S.input}
            value={companyDetails.vatNumber}
            onChange={(e) => updateCompanyDetail("vatNumber", e.target.value)}
            placeholder="e.g. 4420263735"
          />
        </div>
        <div>
          <label style={S.label}>Registration number</label>
          <input
            style={S.input}
            value={companyDetails.regNumber}
            onChange={(e) => updateCompanyDetail("regNumber", e.target.value)}
            placeholder="e.g. 2013/089712/07"
          />
        </div>
      </div>
    </>
  );
}
