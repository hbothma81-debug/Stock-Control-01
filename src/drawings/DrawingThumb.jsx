// The small picture of a drawing on the job's Items sheet, between Code
// and Description, double the row's height; click opens the drawing.
// See drawingThumb.js for how the picture is made and kept.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { C } from "../theme.js";
import { THUMB_HEIGHT, thumbUrlFor } from "./drawingThumb.js";

// height: 60 px on a sheet row; the Production pop-up asks for 120, the
// size the picture is kept at, so it is twice as big and still sharp.
export default function DrawingThumb({ storagePath, title, onOpen, height = THUMB_HEIGHT }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stale = false;
    setUrl(null);
    setFailed(false);
    thumbUrlFor(supabase, storagePath).then((u) => {
      if (stale) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      stale = true;
    };
  }, [storagePath]);

  const frame = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height,
    minWidth: 48,
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    background: "#fff",
    cursor: "pointer",
    padding: 0,
    overflow: "hidden",
    verticalAlign: "middle",
  };
  return (
    <button type="button" className="stk-btn" style={frame} onClick={onOpen} title={title || "Open the drawing"}>
      {url ? (
        <img src={url} alt="" style={{ height, width: "auto", display: "block" }} />
      ) : (
        <span style={{ fontSize: 11, color: failed ? C.muted : C.border, padding: "0 10px" }}>{failed ? "PDF" : "…"}</span>
      )}
    </button>
  );
}
