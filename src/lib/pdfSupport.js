// Which browsers src/PdfViewer.jsx can draw a PDF on, kept apart from the
// viewer so it can be tested without a browser (pdfSupport.test.js).
//
// The app uses PDF.js 4.10.38, the last 4.x, pinned. Its "legacy" build
// supports Chrome 103 or later and Safari 16.4 or later. The newest PDF.js
// (6.x) needs Chrome 125, which the Huawei MatePad at Bending does not
// have: Huawei's own browser runs an older Chrome engine (its version 15 is
// Chrome 114), there is no Chrome to install, and PDF.js 6 drew blank pages
// there. 4.10.38 was checked on 14 Sep 2026 to draw on a current Chrome as
// well, so one release covers both.
//
// A browser older than 4.10.38 supports is sent straight to the frame, the
// way every device was shown PDFs before, rather than to a blank box.
//
// Testing in Claude's browser pane: a hidden pane stops drawing, so every
// PDF.js version looks blank there. Check document.visibilityState first.

export const MIN_CHROME = 103;
export const MIN_SAFARI = [16, 4];

// Every Chromium browser (Chrome, Edge, Samsung Internet, Huawei's) carries
// its engine as "Chrome/NNN". Safari carries "Version/NN.N" and no
// "Chrome". Firefox carries neither and is never judged too old: PDF.js
// supports its long-term release. Anything unrecognised gets PDF.js, with
// the viewer's own time limit behind it.
export function tooOldForPdfjs(ua) {
  const chrome = /Chrome\/(\d+)/.exec(ua);
  if (chrome) return Number(chrome[1]) < MIN_CHROME;
  if (/Firefox\//.test(ua)) return false;
  const safari = /Version\/(\d+)(?:\.(\d+))?[\d.]*(?: Mobile\/\S+)? Safari\//.exec(ua);
  if (safari) {
    const major = Number(safari[1]);
    const minor = Number(safari[2] || 0);
    return major < MIN_SAFARI[0] || (major === MIN_SAFARI[0] && minor < MIN_SAFARI[1]);
  }
  return false;
}

// The browser's name and version, for the message a device shows when a
// PDF cannot be drawn: a floor tablet has no console anybody can open.
export function browserVersion(ua) {
  const found = ua.match(/(HuaweiBrowser|SamsungBrowser|Firefox|Edg|Chrome|Version)\/[\d.]+/g);
  return found ? found.join(", ") : ua;
}
