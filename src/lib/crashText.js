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

// The heading of the crash message. `what` is the piece that failed, in
// the words the screen uses for it ("the count box", "Laser Status");
// `where` is the job and stage it was drawing, so a photo of the screen
// says whose data to look at ("JOB-0068, Bending"). Neither: the whole app.
export function crashTitle(what, where) {
  const piece = String(what || "").trim();
  const place = String(where || "").trim();
  if (!piece) return "Something went wrong on this screen";
  if (place) return `${place}: ${piece} could not be shown`;
  return `${piece[0].toUpperCase()}${piece.slice(1)} could not be shown`;
}

// "JOB-0068, Bending" from the job and stage a piece was handed. Either
// may be missing (a re-cut row carries no stage).
export function crashPlace(job, process) {
  return [job?.job_number, process?.process_name].map((t) => String(t || "").trim()).filter(Boolean).join(", ");
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
