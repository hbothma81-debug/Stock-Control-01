// The whole of outlook-signin.html: pass Microsoft's answer from the
// sign-in pop-up to the app's window that opened it (outlook.js is waiting
// for it there), using Microsoft's own helper for exactly this.
import { broadcastResponseToMainFrame } from "@azure/msal-browser/redirect-bridge";

broadcastResponseToMainFrame().catch(() => {
  // Opened by hand, or an answer that cannot be read: nothing to pass on.
  const msg = document.getElementById("msg");
  if (msg) msg.textContent = "Nothing to do here. Close this window and go back to the app.";
});
