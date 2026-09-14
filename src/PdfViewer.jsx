import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { F, C, S } from "./theme.js";
import { tooOldForPdfjs, browserVersion } from "./lib/pdfSupport.js";
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
// PDF.js is fetched the first time somebody opens a PDF, never before --
// the same rule as the Excel and PDF builders in App.jsx. It is PDF.js
// 4.10.38, pinned (package.json has no ^), for the Huawei tablet at
// Bending; a browser older than even that release supports gets the frame,
// as before. Which browsers, and why not the newest PDF.js, is in
// src/lib/pdfSupport.js. Do not upgrade PDF.js without trying that tablet.
//
// If a PDF still cannot be drawn, this says so and falls back to the frame,
// with the browser's version on screen, so a photo of the message says why.

let pdfjs = null;
async function getPdfjs() {
  if (!pdfjs) {
    const lib = await import("pdfjs-dist/legacy/build/pdf.min.mjs");
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
    pdfjs = lib;
  }
  return pdfjs;
}

// The whole file is downloaded here first, as the frame did, and only then
// handed to PDF.js. So the time limit below measures PDF.js, never a slow
// connection, and a blob: or data: address (a document made but not filed,
// a stock item's attachment) works the same as a stored file.
async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`the file did not download (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

const ZOOMS = [1, 1.5, 2, 3];
// An iPhone draws a canvas bigger than this blank, with no error. A large
// drawing zoomed in stops getting sharper here rather than disappearing.
const MAX_CANVAS_PIXELS = 16_000_000;
// A browser PDF.js cannot run on can leave it waiting for ever instead of
// failing, which looks exactly like a blank box. The file is already
// downloaded when this starts counting.
const GIVE_UP_SECONDS = 20;

// Counts only while the page is on screen. A page behind another app, or on
// a locked phone, stops drawing until it is looked at again, and that is not
// a failure: the clock starts again for as long as it stays hidden.
function whileVisible(seconds, onTimeUp) {
  let timer = null;
  const arm = () => {
    timer = setTimeout(() => (document.hidden ? arm() : onTimeUp()), seconds * 1000);
  };
  arm();
  return () => clearTimeout(timer);
}

const frameOnly = () => tooOldForPdfjs(navigator.userAgent);

export default function PdfViewer({ url, title }) {
  const boxRef = useRef(null);
  const pagesRef = useRef(null);
  const pdfRef = useRef(null);
  // loading | ready | failed (PDF.js gave up) | frame (browser too old for it)
  const [status, setStatus] = useState(() => (frameOnly() ? "frame" : "loading"));
  const [problem, setProblem] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);

  function fail(why) {
    setProblem(why);
    setStatus("failed");
  }

  useEffect(() => {
    if (frameOnly()) return;
    let cancelled = false;
    let task = null;
    let stopTimer = () => {};
    setStatus("loading");
    setProblem("");
    setPageCount(0);
    setZoom(1);
    (async () => {
      try {
        const [lib, bytes] = await Promise.all([getPdfjs(), fetchBytes(url)]);
        if (cancelled) return;
        stopTimer = whileVisible(GIVE_UP_SECONDS, () => {
          if (cancelled) return;
          cancelled = true;
          if (task) task.destroy();
          fail(`PDF.js did not open it within ${GIVE_UP_SECONDS} seconds`);
        });
        task = lib.getDocument({ data: bytes, isEvalSupported: false });
        const pdf = await task.promise;
        stopTimer();
        if (cancelled) return;
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        setStatus("ready");
      } catch (err) {
        stopTimer();
        if (cancelled) return;
        console.error("PDF.js could not open this PDF:", err);
        fail(err?.message || String(err));
      }
    })();
    return () => {
      cancelled = true;
      stopTimer();
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
    const box = boxRef.current;
    if (status !== "ready" || !pdf || !holder || !box || !width) return;
    let stopped = false;
    let drawing = null;
    let drawn = 0;
    holder.replaceChildren();
    // Read now rather than trusting `width`, which ignores small changes.
    const cssWidth = Math.floor((box.clientWidth - 16) * zoom);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    // Page 1 is where a browser PDF.js cannot run on fails, if it does.
    const stopTimer = whileVisible(GIVE_UP_SECONDS, () => {
      if (stopped || drawn > 0) return;
      stopped = true;
      if (drawing) drawing.cancel();
      fail(`page 1 was not drawn within ${GIVE_UP_SECONDS} seconds`);
    });
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
        // PDF.js 4 takes the canvas's context; 5 and later take the canvas.
        drawing = page.render({ canvasContext: canvas.getContext("2d"), viewport });
        try {
          await drawing.promise;
        } catch (err) {
          if (stopped || err?.name === "RenderingCancelledException") return;
          throw err;
        }
        drawn += 1;
        if (stopped) return;
      }
    })().catch((err) => {
      if (stopped) return;
      console.error("Could not draw this PDF:", err);
      // A later page failing leaves the pages already drawn where they are.
      if (drawn === 0) fail(err?.message || String(err));
    });
    return () => {
      stopped = true;
      stopTimer();
      if (drawing) drawing.cancel();
    };
  }, [status, width, zoom, title]);

  if (status === "frame") {
    return <iframe src={url} title={title || "PDF"} style={S.previewPdf} />;
  }

  if (status === "failed") {
    return (
      <>
        <div style={{ ...S.roleHint, marginTop: 8, color: C.danger }}>
          This PDF could not be drawn on this device, so it is shown the old way below. If that is blank too, take a
          photo of this message for the office.
        </div>
        <div style={{ ...S.roleHint, marginTop: 2, wordBreak: "break-word" }}>
          {problem} · {browserVersion(navigator.userAgent)}
        </div>
        <iframe src={url} title={title || "PDF"} style={S.previewPdf} />
      </>
    );
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
