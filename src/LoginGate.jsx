import { useState, useEffect, lazy, Suspense } from "react";
import { supabase } from "./lib/supabaseClient.js";

// Loaded only once a real session is confirmed — this is the ~470kb+ main
// app bundle. Kept out of the initial page load entirely, so someone on a
// slow or unreliable connection at least reaches a small, fast login form
// almost immediately, instead of the whole app needing to finish
// downloading before anything — even the login page — can appear at all.
const MainApp = lazy(() => import("./App.jsx"));

const C = {
  bg: "#1B1D1F",
  surface: "#232629",
  border: "#33383C",
  text: "#ECEAE4",
  muted: "#8B9096",
  accentRaw: "#F2A900",
  danger: "#D6543B",
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
  },
  card: { width: "100%", maxWidth: 320 },
  promptText: { textAlign: "center", color: C.muted, fontSize: 14 },
  tabs: { display: "flex", gap: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 4, marginBottom: 14 },
  tab: { flex: 1, background: "transparent", border: "none", color: C.muted, borderRadius: 6, padding: "8px 0", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  tabActive: { background: C.bg, color: C.text },
  label: { fontSize: 11, color: C.muted, display: "block", marginBottom: 3 },
  input: {
    width: "100%",
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "9px 10px",
    color: C.text,
    fontSize: 14,
    boxSizing: "border-box",
  },
  error: { color: C.danger, fontSize: 12.5 },
  submitBtn: {
    width: "100%",
    background: C.accentRaw,
    border: "none",
    borderRadius: 6,
    padding: "10px 0",
    color: "#1B1D1F",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 4,
  },
  hint: { fontSize: 11.5, color: C.muted, marginTop: 10, lineHeight: 1.4 },
};

export default function LoginGate() {
  const [session, setSession] = useState(undefined); // undefined = still checking, null = signed out
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("signin");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      setSession(null);
      return;
    }
    let settled = false;
    // Same fix as the main app needed: a network hiccup exactly during this
    // one check must never be able to leave someone stuck on a loading
    // screen forever with no way out.
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.error("Session check timed out — falling back to signed-out state.");
        setSession(null);
        setAuthLoading(false);
      }
    }, 10000);
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        setSession(data.session || null);
        setAuthLoading(false);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        console.error("Failed to check session:", err);
        setSession(null);
        setAuthLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
    });
    return () => {
      clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn(e) {
    e.preventDefault();
    setAuthError("");
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
    setAuthBusy(false);
    if (error) setAuthError(error.message);
  }

  async function signUp(e) {
    e.preventDefault();
    setAuthError("");
    if (!authName.trim() || !authEmail.trim() || !authPassword) {
      setAuthError("Fill in your name, email, and a password.");
      return;
    }
    setAuthBusy(true);
    const { error } = await supabase.auth.signUp({
      email: authEmail.trim(),
      password: authPassword,
      options: { data: { name: authName.trim() } },
    });
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
    } else {
      setAuthError("Account created. If asked, check your email to confirm — otherwise you're signed in already.");
    }
  }

  if (authLoading) {
    return (
      <div style={S.page}>
        <div style={S.promptText}>Checking your session…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.tabs}>
            <button
              type="button"
              style={{ ...S.tab, ...(authMode === "signin" ? S.tabActive : {}) }}
              onClick={() => {
                setAuthMode("signin");
                setAuthError("");
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              style={{ ...S.tab, ...(authMode === "signup" ? S.tabActive : {}) }}
              onClick={() => {
                setAuthMode("signup");
                setAuthError("");
              }}
            >
              Create account
            </button>
          </div>
          <form onSubmit={authMode === "signin" ? signIn : signUp} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {authMode === "signup" && (
              <div>
                <label style={S.label}>Your name</label>
                <input style={S.input} value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="e.g. Thabo M" />
              </div>
            )}
            <div>
              <label style={S.label}>Email</label>
              <input style={S.input} type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <label style={S.label}>Password</label>
              <input
                style={S.input}
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
            {authError && <div style={S.error}>{authError}</div>}
            <button type="submit" style={S.submitBtn} disabled={authBusy}>
              {authBusy ? "Please wait…" : authMode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
          {authMode === "signup" && (
            <div style={S.hint}>
              Your account is created with no access yet — an admin needs to grant you permissions in User Management before you'll
              see any stock.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div style={S.page}>
          <div style={S.promptText}>Loading the app…</div>
        </div>
      }
    >
      <MainApp />
    </Suspense>
  );
}
