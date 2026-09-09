import { useState, useRef } from "react";
import { X } from "lucide-react";
import { C, S } from "./theme.js";

// A box you type in, with suggestions underneath, standing in for a
// scroll-and-pick dropdown wherever the list is long enough that scrolling
// is slower than typing. Same look and the same suggestion list as the
// hand-built ones on the job and purchase order screens (S.suggestDropdown),
// so the app keeps one pattern.
//
//   options    strings, or { value, label } pairs when what is stored
//              differs from what is shown (a supplier's id and its name)
//   value      the chosen option's value, or "" for nothing chosen
//   onChange   called with the new value: an option's value, "" when the
//              box is cleared, or the typed text itself when allowNew is
//              set and nothing in the list matches it
//   allowNew   let the typed text stand as a new entry (form fields);
//              off for filters, where typing something unknown should
//              not silently filter everything out
//   emptyLabel what the box says when nothing is chosen ("All customers")
//   style      goes on the wrapper, for flex rows; the input itself always
//              fills the wrapper
//
// A choice is made by tapping a suggestion, pressing Enter, or simply
// leaving the box: on the way out the text is matched against the list,
// case ignored, so "acme" settles on "Acme Steel" when that is the only
// match, and an exact match always wins over a partial one.
export default function TypeToFind({
  options,
  value,
  onChange,
  placeholder,
  emptyLabel,
  allowNew = false,
  style,
  inputStyle,
  autoFocus,
  title,
  maxShown = 12,
}) {
  const opts = (options || [])
    .filter((o) => o !== null && o !== undefined && o !== "")
    .map((o) => (typeof o === "object" ? { value: String(o.value), label: String(o.label ?? o.value) } : { value: String(o), label: String(o) }));
  const current = opts.find((o) => o.value === String(value ?? ""));
  const currentLabel = current ? current.label : allowNew ? String(value ?? "") : "";

  // What is in the box while it has focus. null means "not editing":
  // the box shows whatever is chosen.
  const [text, setText] = useState(null);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef(null);
  const swallowMouseUp = useRef(false);
  // Set the moment a choice is made, so the blur that follows a tap or
  // Enter does not settle the typed text a second time. Without this a
  // tap on "Acme Steel" was overwritten by "acm" being taken as a new
  // name on the way out. A ref, not state: the blur handler runs before
  // the re-render and would still see the old value.
  const doneEditing = useRef(false);
  const editing = text !== null;
  const shownText = editing ? text : currentLabel;

  const q = editing ? text.trim().toLowerCase() : "";
  // Just focused, nothing typed yet: show the whole list, so a tap on the
  // box still behaves like opening a dropdown.
  const untouched = editing && text === currentLabel;
  const matches = editing
    ? (untouched || !q ? opts : opts.filter((o) => o.label.toLowerCase().includes(q))).slice(0, maxShown)
    : [];
  const exact = editing ? opts.find((o) => o.label.toLowerCase() === q) : null;
  const canAddTyped = allowNew && editing && q && !exact;

  function commit(next) {
    doneEditing.current = true;
    if (next !== String(value ?? "")) onChange(next);
    setText(null);
    setHighlight(0);
  }

  // Leaving the box: settle on the best reading of what was typed.
  function settle() {
    if (!editing || doneEditing.current) return;
    if (untouched) return commit(String(value ?? ""));
    if (!q) return commit("");
    if (exact) return commit(exact.value);
    const partial = opts.filter((o) => o.label.toLowerCase().includes(q));
    if (partial.length === 1 && !allowNew) return commit(partial[0].value);
    if (allowNew) return commit(text.trim());
    // Nothing usable: put the box back to what it was.
    setText(null);
    setHighlight(0);
  }

  function pick(o) {
    commit(o.value);
    inputRef.current?.blur();
  }

  function onKeyDown(e) {
    if (!editing) return;
    const rows = matches.length + (canAddTyped ? 1 : 0);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (rows ? (h + 1) % rows : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (rows ? (h - 1 + rows) % rows : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight < matches.length && matches[highlight] && !(untouched && !q)) pick(matches[highlight]);
      else if (canAddTyped) pick({ value: text.trim() });
      else settle();
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      doneEditing.current = true;
      setText(null);
      setHighlight(0);
      inputRef.current?.blur();
    }
  }

  const hasValue = String(value ?? "") !== "";

  return (
    <div style={{ position: "relative", ...(style || {}) }}>
      <input
        ref={inputRef}
        // Room for the clear button on the right. The whole padding, not
        // just the right side: S.input sets padding as one value and React
        // refuses to mix the two.
        style={{ ...S.input, ...(hasValue && !editing ? { padding: "8px 30px 8px 10px" } : {}), ...(inputStyle || {}) }}
        value={shownText}
        placeholder={emptyLabel || placeholder || "Type to find…"}
        title={title}
        autoFocus={autoFocus}
        autoComplete="off"
        // The current choice is selected on focus, so typing replaces it
        // rather than tacking letters onto the end of "Acme Steel". The
        // mouse-up that follows a click would normally collapse that
        // selection again, so the first one after focus is swallowed.
        onFocus={(e) => {
          doneEditing.current = false;
          setText(currentLabel);
          setHighlight(0);
          e.target.select();
          swallowMouseUp.current = true;
        }}
        onMouseUp={(e) => {
          if (swallowMouseUp.current) {
            e.preventDefault();
            swallowMouseUp.current = false;
          }
        }}
        onChange={(e) => {
          setText(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={settle}
      />
      {hasValue && !editing && (
        <button
          type="button"
          className="stk-btn"
          title="Clear"
          onClick={() => onChange("")}
          style={{
            position: "absolute",
            right: 4,
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            color: C.muted,
            cursor: "pointer",
            padding: 4,
            display: "flex",
          }}
        >
          <X size={14} />
        </button>
      )}
      {editing && (matches.length > 0 || canAddTyped || q) && (
        <div style={S.suggestDropdown}>
          {matches.map((o, i) => (
            <button
              key={o.value}
              type="button"
              className="stk-btn"
              style={{
                ...S.suggestItem,
                ...(i === highlight ? { background: C.surfaceHover } : {}),
                ...(o.value === String(value ?? "") ? { fontWeight: 600 } : {}),
              }}
              // mousedown, not click: it fires before the input loses
              // focus, so the list is still there to be tapped.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {o.label}
            </button>
          ))}
          {canAddTyped && (
            <button
              type="button"
              className="stk-btn"
              style={{
                ...S.suggestItem,
                color: C.accentRaw,
                ...(highlight === matches.length ? { background: C.surfaceHover } : {}),
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                pick({ value: text.trim() });
              }}
              onMouseEnter={() => setHighlight(matches.length)}
            >
              + Add "{text.trim()}"
            </button>
          )}
          {matches.length === 0 && !canAddTyped && q && (
            <div style={{ ...S.suggestItem, color: C.muted, cursor: "default" }}>Nothing matches that.</div>
          )}
        </div>
      )}
    </div>
  );
}
