// The safety net around the whole app (LoginGate.jsx wraps the app in it).
// A crash while a screen is being drawn used to leave a blank white page
// with nothing to say why (the tube re-cut, 16 Sep 2026). Now the person
// gets a message, a way back, and the error's own words to photograph.
//
// It catches crashes in drawing only. A save or a load that fails is not
// one, and has its own message on its own screen.
//
// Two sizes. Around the whole app it takes the page. With `box`, around
// one piece of a screen (a Production card's count box, Laser Status), it
// takes only that piece's place and the rest of the screen carries on:
// `what` names the piece, `where` the job and stage it was drawing.
// A net catches only what is drawn by a piece inside it, so a screen drawn
// by App.jsx itself falls to the net around the whole app.
//
// A pop-up draws its own dark layer over the page, and that goes with it
// when it crashes: the box would land at the foot of the page, unseen.
// So around a pop-up add `popup`, and the box comes up over the page as
// the pop-up did; `onClose` is what the pop-up's own x does, behind a
// Close button.
//
// A class, because React offers no other way to catch a drawing crash.
// Its colours are its own: the app's theme may be the thing that broke.
// The box follows the theme where the theme is there, and falls back to
// the dark colours where it is not.
import { Component } from "react";
import { isNewVersionError, crashDetails, crashTitle } from "./lib/crashText.js";

const C = {
  bg: "#1B1D1F",
  surface: "#232629",
  border: "#33383C",
  text: "#ECEAE4",
  muted: "#8B9096",
  accentRaw: "#F2A900",
};

const S = {
  page: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "system-ui, -apple-system, sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    boxSizing: "border-box",
  },
  card: { width: "100%", maxWidth: 460 },
  title: { fontSize: 18, fontWeight: 600, marginBottom: 8 },
  text: { fontSize: 14, lineHeight: 1.5, color: C.text, marginBottom: 8 },
  buttons: { display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0" },
  mainBtn: {
    background: C.accentRaw,
    border: "none",
    borderRadius: 6,
    padding: "10px 16px",
    color: "#1B1D1F",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  otherBtn: {
    background: "transparent",
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "10px 16px",
    color: C.text,
    fontSize: 14,
    cursor: "pointer",
  },
  details: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: 10,
    color: C.muted,
    fontSize: 11.5,
    fontFamily: "ui-monospace, Consolas, monospace",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: 0,
  },
};

// The box's colours: the theme's own (src/theme.js sets these names on
// the page), with the dark theme's as the fallback.
const T = {
  surface: `var(--stk-surface, ${C.surface})`,
  border: `var(--stk-border, ${C.border})`,
  text: `var(--stk-text, ${C.text})`,
  muted: `var(--stk-muted, ${C.muted})`,
  danger: "var(--stk-danger, #D6543B)",
  dangerTint: "var(--stk-dangerTint, #3A1E17)",
};

const B = {
  box: {
    background: T.dangerTint,
    border: `1px solid ${T.danger}`,
    borderRadius: 6,
    padding: "10px 12px",
    color: T.text,
    fontFamily: "system-ui, -apple-system, sans-serif",
    textAlign: "left",
    boxSizing: "border-box",
  },
  title: { fontSize: 14, fontWeight: 700, color: T.danger, marginBottom: 4 },
  text: { fontSize: 13, lineHeight: 1.45, color: T.text },
  buttons: { display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" },
  btn: {
    background: "transparent",
    border: `1px solid ${T.danger}`,
    borderRadius: 6,
    padding: "7px 12px",
    color: T.text,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  details: { ...S.details, background: T.surface, border: `1px solid ${T.border}`, color: T.muted, padding: 8, fontSize: 11 },
  // Above every pop-up the app draws (src/theme.js goes up to 30).
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "#00000099",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 60,
  },
  popupCard: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "90vh",
    overflowY: "auto",
    background: T.surface,
    borderRadius: 8,
  },
};

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, componentStack: "", at: null };
  }

  static getDerivedStateFromError(error) {
    return { error: error ?? new Error("Unknown error"), at: new Date() };
  }

  componentDidCatch(error, info) {
    this.setState({ componentStack: info?.componentStack || "" });
    console.error(`${crashTitle(this.props.what, this.props.where)}:`, error, info?.componentStack);
  }

  render() {
    const { error, componentStack, at } = this.state;
    if (!error) return this.props.children;

    const newVersion = isNewVersionError(error);
    const tryAgain = () => this.setState({ error: null, componentStack: "", at: null });

    if (this.props.box || this.props.popup) {
      const { popup, onClose } = this.props;
      const box = (
        <div style={B.box} role="alert">
          <div style={B.title}>{newVersion ? "The app has been updated" : crashTitle(this.props.what, this.props.where)}</div>
          <div style={B.text}>
            {newVersion
              ? "Reload to get the new version."
              : "The rest of the screen still works. Please tell Heinrich, with a photo of this screen."}
          </div>
          <div style={B.buttons}>
            {newVersion ? (
              <button type="button" style={B.btn} onClick={() => window.location.reload()}>
                Reload the app
              </button>
            ) : (
              <button type="button" style={B.btn} onClick={tryAgain}>
                Try again
              </button>
            )}
            {popup && onClose && (
              <button type="button" style={B.btn} onClick={onClose}>
                Close
              </button>
            )}
          </div>
          {!newVersion && (
            <pre style={B.details}>
              {crashDetails(error, componentStack, 4)}
              {"\n"}
              {at ? at.toLocaleString("en-ZA") : ""}
            </pre>
          )}
        </div>
      );
      if (!popup) return box;
      return (
        <div style={B.backdrop}>
          <div style={B.popupCard}>{box}</div>
        </div>
      );
    }

    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.title}>{newVersion ? "The app has been updated" : "Something went wrong on this screen"}</div>
          {newVersion ? (
            <div style={S.text}>Reload to get the new version.</div>
          ) : (
            <>
              <div style={S.text}>Everything saved before this is safe. Anything still being typed may need typing again.</div>
              <div style={S.text}>Please tell Heinrich, with a photo of this screen.</div>
            </>
          )}
          <div style={S.buttons}>
            {!newVersion && (
              <button type="button" style={S.mainBtn} onClick={tryAgain}>
                Try again
              </button>
            )}
            <button type="button" style={newVersion ? S.mainBtn : S.otherBtn} onClick={() => window.location.reload()}>
              Reload the app
            </button>
          </div>
          {!newVersion && (
            <pre style={S.details}>
              {crashDetails(error, componentStack)}
              {"\n"}
              {at ? at.toLocaleString("en-ZA") : ""}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
