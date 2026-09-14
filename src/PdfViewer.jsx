import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { F, C, S } from "./theme.js";
// Only the worker's address, not the worker: `?url` puts a file name in the
// bundle and the file itself is fetched when PDF.js starts.
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

// Shows a PDF by drawing its pages with PDF.js, instead of handing the file
// to the browser's own viewer in a frame.
//
// A PDF in a frame is shown by the device's own viewer, and most phones and
// tablets do not have one that works inside a page: Android showed a blank
// box or quietly saved the file to Downloads, an iPhone the first page only.
// Drawing the pages here looks the same on every screen and leaves no file
// on the device. It is not a lock -- whatever is shown has reached the
// device -- it only stops the easy and the accidental copies. Who may keep
// a copy is decided by the buttons under this, in App.jsx.
//
// PDF.js is about 1.8 MB (roughly 500 KB over the wire) and is fetched the
// first time somebody opens a PDF, never before -- the same rule as the
// Excel and PDF builders in App.jsx. If it cannot load, this falls back to
// the frame, so nobody is left looking at nothing.
//
// The "legacy" build on purpose: the standard one runs only on this year's
// browsers, and not every phone in the workshop is this year's.

let pdfjs = null;
async function getPdfjs() {
  if (!pdfjs) {
    const lib = await import("pdfjs-dist/legacy/build/pdf.min.mjs");
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
    pdfjs = lib;
  }
  return pdfjs;
}

// One whole download, like the frame did, rather than PDF.js asking for the
// file in pieces. A blob: or data: address (a document that was made but not
// filed, a stock item's attachment) is read here and handed over as bytes.
async function openDocument(lib, url) {
  const options = { isEvalSupported: false, disableRange: true, disableStream: true };
  if (/^(blob|data):/i.test(url)) {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    return lib.getDocument({ ...options, data: bytes });
  }
  return lib.getDocument({ ...options, url });
}

const ZOOMS = [1, 1.5, 2, 3];
// An iPhone draws a canvas bigger than this blank, with no error. A large
// drawing zoomed in stops getting sharper here rather than disappearing.
const MAX_CANVAS_PIXELS = 16_000_000;

export default function PdfViewer({ url, title }) {
  const boxRef = useRef(null);
  const pagesRef = useRef(null);
  const pdfRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | failed
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let task = null;
    setStatus("loading");
    setPageCount(0);
    setZoom(1);
    (async () => {
      try {
        const lib = await getPdfjs();
        if (cancelled) return;
        task = await openDocument(lib, url);
        if (cancelled) {
          task.destroy();
          return;
        }
        const pdf = await task.promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("PDF.js could not show this PDF; showing it in a frame instead:", err);
        setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
      pdfRef.current = null;
      if (task) task.destroy();
    };
  }, [url]);

  // Pages are drawn to the box's width, so they are redrawn when it changes
  // (a phone turned sideways) -- but not for a few pixels, such as a scroll
  // bar appearing, which would redraw every page for nothing.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setWidth((w) => (Math.abs(box.clientWidth - w) > 30 ? box.clientWidth : w));
    measure();
    if (typeof window.ResizeObserver === "undefined") return;
    let timer = null;
    const watcher = new window.ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, 200);
    });
    watcher.observe(box);
    return () => {
      watcher.disconnect();
      clearTimeout(timer);
    };
  }, [status]);

  // One page at a time, top to bottom, so the first page shows while the
  // rest are still being drawn and a phone never holds them all half-done.
  useEffect(() => {
    const pdf = pdfRef.current;
    const holder = pagesRef.current;
    if (status !== "ready" || !pdf || !holder || !width) return;
    let stopped = false;
    let drawing = null;
    holder.replaceChildren();
    // Read now rather than trusting `width`, which ignores small changes.
    const cssWidth = Math.floor((boxRef.current.clientWidth - 16) * zoom);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    (async () => {
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        if (stopped) return;
        const base = page.getViewport({ scale: 1 });
        const wanted = (cssWidth / base.width) * ratio;
        const ceiling = Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height));
        const viewport = page.getViewport({ scale: Math.min(wanted, ceiling) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.cssText =
          `display:block;width:${cssWidth}px;height:auto;margin:0 auto 8px;` +
          "background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.35)";
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${title || "PDF"}, page ${n} of ${pdf.numPages}`);
        holder.appendChild(canvas);
        drawing = page.render({ canvas, viewport });
        try {
          await drawing.promise;
        } catch (err) {
          if (err?.name !== "RenderingCancelledException") console.error(`Could not draw page ${n}:`, err);
          return;
        }
        if (stopped) return;
      }
    })().catch((err) => console.error("Could not draw this PDF:", err));
    return () => {
      stopped = true;
      if (drawing) drawing.cancel();
    };
  }, [status, width, zoom, title]);

  if (status === "failed") {
    return <iframe src={url} title={title || "PDF"} style={S.previewPdf} />;
  }

  const step = ZOOMS.indexOf(zoom);
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginTop: 8,
          fontFamily: F.mono,
          fontSize: 12.5,
          color: C.muted,
        }}
      >
        <span>{status === "ready" ? `${pageCount} ${pageCount === 1 ? "page" : "pages"}` : "Loading…"}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="stk-btn"
            style={{ ...S.iconBtn, opacity: step <= 0 ? 0.3 : 1 }}
            disabled={step <= 0}
            aria-label="Zoom out"
            onClick={() => setZoom(ZOOMS[step - 1])}
          >
            <ZoomOut size={18} />
          </button>
          <span style={{ minWidth: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="stk-btn"
            style={{ ...S.iconBtn, opacity: step >= ZOOMS.length - 1 ? 0.3 : 1 }}
            disabled={step >= ZOOMS.length - 1}
            aria-label="Zoom in"
            onClick={() => setZoom(ZOOMS[step + 1])}
          >
            <ZoomIn size={18} />
          </button>
        </span>
      </div>
      <div
        ref={boxRef}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          height: "65vh",
          minHeight: 300,
          overflow: "auto",
          // Room for the scroll bar from the start. Without it the bar
          // arrives with the first page, the page is then too wide for
          // what is left, and a sideways scroll bar appears at 100%.
          scrollbarGutter: "stable",
          marginTop: 6,
          padding: 8,
          boxSizing: "border-box",
          borderRadius: 8,
          border: `1px solid ${C.border}`,
          background: "rgba(127,127,127,0.12)",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {status === "loading" && <div style={S.empty}>Loading…</div>}
        <div ref={pagesRef} />
      </div>
    </>
  );
}
