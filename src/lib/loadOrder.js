// Putting reloads on screen in the order they were asked for.
//
// A screen that reloads after every write can have two reloads running at
// once, and the network may answer the older one last. Put on screen as it
// lands, that older answer covers the newer one: the screen then shows a
// count from before the last save, and the next count logged against it is
// refused (a count is saved only if the line still reads what the screen
// showed; submitProcessItemProgress in App.jsx).
//
// Every write on a device starts its reload after the write is saved, so
// the reload that started last holds everything the earlier ones do. The
// rule, then: an answer goes on screen unless a reload that started later
// is already showing. Not "only the newest may show": a save waits for its
// own reload before giving the Log button back, and throwing that reload
// away because another had started would give Log back over the old number.
//
// No database and no React in here, so it can be tested on its own
// (loadOrder.test.js). Used by fetchProductionQueue in App.jsx.

export function makeLoadOrder() {
  let started = 0;
  let shown = 0;
  return {
    // When a reload starts. Keep the number it gives.
    start() {
      started += 1;
      return started;
    },
    // When that reload's answer, or its failure, arrives: true if it may go
    // on screen, and from then on it is the one showing.
    mayShow(loadNo) {
      if (loadNo < shown) return false;
      shown = loadNo;
      return true;
    },
    // True for the reload asked for last, so "Loading…" comes down when
    // that one lands and not when the first one back does.
    isNewest(loadNo) {
      return loadNo === started;
    },
  };
}
