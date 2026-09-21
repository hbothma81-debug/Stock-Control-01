// Sending mail through the signed-in person's own Microsoft 365 mailbox.
//
// The person signs in to Microsoft once, in Microsoft's own pop-up; this
// app never sees a password and holds no secret key. What Microsoft hands
// back is a pass that lets this browser send mail as that one person, and
// nothing else (the Mail.Send permission; see docs/EMAIL-SETUP-MICROSOFT.md).
// The mail leaves from their mailbox and lands in their Sent Items.
//
// The two IDs come from the one-off setup in that document. They are not
// secrets. Without them nothing here runs and no Send button is drawn.
//
// The rules (who it goes to, what it says) are in emailRules.js, tested.

const CLIENT_ID = import.meta.env.VITE_MS_CLIENT_ID || "";
const TENANT_ID = import.meta.env.VITE_MS_TENANT_ID || "";
const SCOPES = ["Mail.Send"];

// Which app login connected the mailbox on this device. The Microsoft pass
// is kept in the browser so nobody has to sign in every morning; on a
// shared computer the next person to sign in to the app must not inherit
// it, so it is thrown away as soon as a different app login asks for it.
const OWNER_KEY = "stk-outlook-owner";

// Set just before the whole page goes to Microsoft to sign in (the way in
// for a browser that blocks the pop-up), holding the app login that asked.
// Found again when the page comes back, so the returning sign-in is
// finished and tied to that login. Kept per tab: another tab is not the
// one that went.
const PENDING_KEY = "stk-outlook-signing-in";

export function emailIsSetUp() {
  return !!(CLIENT_ID && TENANT_ID);
}

// The page Microsoft's pop-up comes back to (outlook-signin.html). It has
// to be registered with Microsoft letter for letter.
function redirectUri() {
  return `${window.location.origin}/outlook-signin.html`;
}

let clientPromise = null;
function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      // Loaded only when somebody opens a send window, like the PDF library.
      const { PublicClientApplication } = await import("@azure/msal-browser");
      const client = new PublicClientApplication({
        auth: {
          clientId: CLIENT_ID,
          authority: `https://login.microsoftonline.com/${TENANT_ID}`,
          redirectUri: redirectUri(),
        },
        cache: { cacheLocation: "localStorage" },
      });
      await client.initialize();
      // Microsoft's rule: a sign-in that left by the whole page must be
      // finished before anything else is asked of the library. Costs
      // nothing when no such sign-in is on its way back.
      const pending = readPending();
      try {
        const back = await client.handleRedirectPromise();
        if (back?.account && pending) writeOwner(pending);
      } catch (err) {
        returnProblem = outlookErrorText(err);
      }
      writePending("");
      return client;
    })().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

function readOwner() {
  try {
    return window.localStorage.getItem(OWNER_KEY) || "";
  } catch {
    return "";
  }
}
function writeOwner(id) {
  try {
    if (id) window.localStorage.setItem(OWNER_KEY, id);
    else window.localStorage.removeItem(OWNER_KEY);
  } catch {
    // A browser with storage switched off just asks for the sign-in again.
  }
}

function readPending() {
  try {
    return window.sessionStorage.getItem(PENDING_KEY) || "";
  } catch {
    return "";
  }
}
function writePending(id) {
  try {
    if (id) window.sessionStorage.setItem(PENDING_KEY, id);
    else window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Without storage the page sign-in cannot be finished; the pop-up way still works.
  }
}

// What went wrong with a page sign-in on its way back, said once in the
// next send window that opens.
let returnProblem = "";
export function takeReturnProblem() {
  const text = returnProblem;
  returnProblem = "";
  return text;
}

// The mailbox connected on this device for this app login, or null.
// Opening a send window calls this first, which also gets the Microsoft
// library loaded before anybody presses Connect: a pop-up opened long
// after the press is blocked by the browser.
export async function connectedMailbox(appUserId) {
  if (!emailIsSetUp()) return null;
  const client = await getClient();
  const accounts = client.getAllAccounts();
  if (accounts.length === 0) return null;
  if (readOwner() !== String(appUserId || "")) {
    await client.clearCache();
    writeOwner("");
    return null;
  }
  return { name: accounts[0].name || "", address: accounts[0].username || "" };
}

export async function connectMailbox(appUserId) {
  const client = await getClient();
  const result = await client.loginPopup({ scopes: SCOPES, prompt: "select_account" });
  writeOwner(String(appUserId || ""));
  return { name: result.account?.name || "", address: result.account?.username || "" };
}

export function popupWasBlocked(err) {
  return err?.errorCode === "popup_window_error" || err?.errorCode === "empty_window_error";
}

// The other way in, for a browser that will not open the pop-up (a phone,
// a tablet, the app installed to a home screen): the whole page goes to
// Microsoft and comes back to where it was. The app reloads, so whatever
// was open has to be opened again; once per device, like the pop-up.
export async function connectMailboxOnThisPage(appUserId) {
  const client = await getClient();
  writePending(String(appUserId || ""));
  try {
    await client.loginRedirect({ scopes: SCOPES, prompt: "select_account" });
  } catch (err) {
    writePending("");
    throw err;
  }
}

export async function disconnectMailbox() {
  const client = await getClient();
  await client.clearCache();
  writeOwner("");
}

// Microsoft's errors in words somebody can act on.
export function outlookErrorText(err) {
  const code = err?.errorCode || "";
  if (code === "user_cancelled") return "The Microsoft sign-in window was closed before it finished.";
  if (code === "popup_window_error" || code === "empty_window_error")
    return "The browser blocked the Microsoft sign-in window. Sign in on this page instead, or allow pop-ups for this site and press Connect Outlook again.";
  if (code === "interaction_in_progress") return "A Microsoft sign-in window is already open. Finish or close it first.";
  if (code === "timed_out" || code === "monitor_window_timeout") return "Microsoft's sign-in took too long. Try again.";
  return err?.message || String(err);
}

async function getPass(client, account) {
  const { InteractionRequiredAuthError } = await import("@azure/msal-browser");
  try {
    return (await client.acquireTokenSilent({ scopes: SCOPES, account })).accessToken;
  } catch (err) {
    // The pass ran out and Microsoft wants to see the person again (a
    // changed password, 90 days unused).
    if (err instanceof InteractionRequiredAuthError) {
      return (await client.acquireTokenPopup({ scopes: SCOPES, account })).accessToken;
    }
    throw err;
  }
}

// Sends one message (the shape graphMessage in emailRules.js makes).
// Resolves when Microsoft has accepted it; throws with its reason if not.
export async function sendOutlookMail(appUserId, payload) {
  const client = await getClient();
  const account = client.getAllAccounts()[0];
  if (!account || readOwner() !== String(appUserId || "")) {
    throw new Error("Outlook is not connected. Press Connect Outlook first.");
  }
  const pass = await getPass(client, account);
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${pass}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 202) return;
  let reason = `Microsoft answered ${res.status}`;
  try {
    const data = await res.json();
    if (data?.error?.message) reason = data.error.message;
  } catch {
    // No readable answer: the number is all there is.
  }
  throw new Error(reason);
}

// A page sign-in on its way back is finished as the app loads, not when
// somebody next opens a send window. Nothing is loaded otherwise. Kept at
// the very end: everything it touches is declared above it.
if (typeof window !== "undefined" && emailIsSetUp() && readPending()) {
  getClient().catch(() => {});
}
