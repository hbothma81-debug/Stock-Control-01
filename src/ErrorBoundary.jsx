// The safety net around the whole app (LoginGate.jsx wraps the app in it).
// A crash while a screen is being drawn used to leave a blank white page
// with nothing to say why (the tube re-cut, 16 Sep 2026). Now the person
// gets a message, a way back, and the error's own words to photograph.
//
// It catches crashes in drawing only. A save or a load that fails is not
// one, and has its own message on its own screen.
//
// A class, because React offers no other way to catch a drawing crash.
// Its colours are its own: the app's theme may be the thing that broke.
import { Component } from "react";
import { isNewVersionError, crashDetails } from "./lib/crashText.js";

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
    console.error("The app crashed while drawing a screen:", error, info?.componentStack);
  }

  render() {
    const { error, componentStack, at } = this.state;
    if (!error) return this.props.children;

    const newVersion = isNewVersionError(error);
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
              <button type="button" style={S.mainBtn} onClick={() => this.setState({ error: null, componentStack: "", at: null })}>
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
