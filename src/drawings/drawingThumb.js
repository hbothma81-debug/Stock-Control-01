// A small picture of a drawing's first page, for the job's Items sheet
// (Heinrich, 21 Oct 2026: "a preview box of the drawing, scales to double
// the current row height").
//
// Made once and kept: the picture is saved in the drawings bucket next to
// the PDF, under thumbs/, so a sheet with thirty lines costs thirty tiny
// images, never thirty PDFs (the egress lesson of September). The first
// time anyone views a drawing that has no picture yet, their browser
// downloads that one PDF, draws page one, saves the picture, and shows it.
// Every signed-in user may write to the bucket (setup-drawings.sql), and
// if a save is refused the picture still shows for this visit.
//
// THUMB_HEIGHT is the picture's height on screen; it is drawn at twice
// that so a tablet's sharp screen gets a crisp line.

import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

export const THUMB_HEIGHT = 60;
const DRAW_HEIGHT = THUMB_HEIGHT * 2;
const BUCKET = "drawings";

export const thumbPath = (storagePath) => `thumbs/${String(storagePath || "").replace(/^\/+/, "")}.png`;

let pdfjs = null;
async function getPdfjs() {
  if (!pdfjs) {
    const lib = await import("pdfjs-dist/legacy/build/pdf.min.mjs");
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
    pdfjs = lib;
  }
  return pdfjs;
}

// Page one of a PDF as a PNG blob, DRAW_HEIGHT tall.
export async function renderFirstPage(bytes) {
  const lib = await getPdfjs();
  const task = lib.getDocument({ data: bytes, isEvalSupported: false });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: DRAW_HEIGHT / base.height });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No picture came out"))), "image/png"));
  } finally {
    doc.destroy();
  }
}

// One promise per drawing per visit, so two rows showing the same part
// share the work. The value is a URL for an <img>.
const inFlight = new Map();

export function thumbUrlFor(supabase, storagePath) {
  if (!supabase || !storagePath) return Promise.resolve(null);
  if (!inFlight.has(storagePath)) {
    inFlight.set(
      storagePath,
      loadOrMake(supabase, storagePath).catch((err) => {
        console.error("No preview for", storagePath, err);
        inFlight.delete(storagePath);
        return null;
      })
    );
  }
  return inFlight.get(storagePath);
}

async function loadOrMake(supabase, storagePath) {
  const bucket = supabase.storage.from(BUCKET);
  // Kept already?
  const kept = await bucket.createSignedUrl(thumbPath(storagePath), 3600);
  if (!kept.error && kept.data?.signedUrl) return kept.data.signedUrl;
  // Make it from the PDF, once.
  const src = await bucket.createSignedUrl(storagePath, 600);
  if (src.error) throw src.error;
  const res = await fetch(src.data.signedUrl);
  if (!res.ok) throw new Error(`PDF download answered ${res.status}`);
  const blob = await renderFirstPage(new Uint8Array(await res.arrayBuffer()));
  const saved = await bucket.upload(thumbPath(storagePath), blob, { upsert: true, contentType: "image/png" });
  if (saved.error) console.warn("Preview made but not kept:", saved.error.message || saved.error);
  return URL.createObjectURL(blob);
}

// When a drawing is replaced by a new revision its storage path changes,
// so the old picture simply stops being asked for. Nothing to clear.
