import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Top-level await is allowed because PDF.js 4.10.38 uses it
// (src/PdfViewer.jsx, src/lib/pdfSupport.js). Browsers have had it since
// Chrome 89 and Safari 15; everything else in the build keeps Vite's normal
// targets. Without this the build stops with "Top-level await is not
// available in the configured target environment".
const TOP_LEVEL_AWAIT = { "top-level-await": true };

export default defineConfig({
  plugins: [react()],
  esbuild: { supported: TOP_LEVEL_AWAIT },
  optimizeDeps: { esbuildOptions: { supported: TOP_LEVEL_AWAIT } },
});
