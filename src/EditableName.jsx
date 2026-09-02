import { useState, useEffect } from "react";
import { S } from "./theme.js";

// An input that edits in place and only commits on blur or Enter.
//
// Split out of App.jsx because every Stock Manager tab uses it, so any tab
// moved to its own file needs it too. Exporting it from App.jsx instead
// would make the import circular: App.jsx imports the tabs, the tabs would
// import back.
//
// Reverts rather than saving when the value is blank or unchanged, so
// tabbing through a list can't quietly wipe a name.
export default function EditableName({ value, onCommit, style }) {
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  return (
    <input
      className="stk-editable"
      style={{ ...S.editableName, ...style }}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        if (val.trim() && val !== value) onCommit(val.trim());
        else setVal(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.target.blur();
      }}
    />
  );
}
