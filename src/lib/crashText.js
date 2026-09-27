// What the crash screen (src/ErrorBoundary.jsx) says about an error.
// Rules only, no drawing, so they can be tested.

// A tablet left open across a push asks for a file of the old build, which
// the site no longer has. Each browser words that failure its own way.
// "Try again" cannot help there (the failed download is remembered), only
// a reload can.
export function isNewVersionError(error) {
  const text = `${error?.name || ""} ${error?.message || error || ""}`;
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Unable to preload CSS/i.test(text);
}

// The grey block under the message: enough for a photo of the screen to
// say what broke. The error's own words, then the first few pieces of the
// screen it happened in, innermost first.
export function crashDetails(error, componentStack, lines = 6) {
  const head = error?.message ? `${error.name || "Error"}: ${error.message}` : String(error ?? "Unknown error");
  const where = String(componentStack || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, lines);
  return [head, ...where].join("\n");
}
