import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Top-level await is allowed because PDF.js 4.10.38 uses it
// (src/PdfViewer.jsx, src/lib/pdfSupport.js). Browsers have had it since
// Chrome 89 and Safari 15; everything else in the build keeps Vite's normal
// targets. Without this the build stops with "Top-level await is not
// available in the configured target environment".
const TOP_LEVEL_AWAIT = { "top-level-await": true };

// Two pages are built: the app, and the small page Microsoft's sign-in
// pop-up comes back to when somebody connects Outlook (src/email/outlook.js).
// Without the second entry the build leaves that page out and the sign-in
// window hangs on live while working on the dev server. The app's entry
// keeps the name "index": CHECK-what-is-live.cjs and CHECK-live-table.cjs
// find the live code by looking for assets/index-….js in the page.
const PAGES = { index: "index.html", outlookSignin: "outlook-signin.html" };

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: PAGES } },
  esbuild: { supported: TOP_LEVEL_AWAIT },
  optimizeDeps: { esbuildOptions: { supported: TOP_LEVEL_AWAIT } },
});
