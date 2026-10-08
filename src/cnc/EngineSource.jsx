// The line on the Cutting data and Machines screens that says whether the
// program engine reads this list or still its own files, asked of the
// engine when the screen opens (engineSource in cncData.js). Replaces the
// fixed ENGINE_READS_TABLES setting.

import { useEffect, useState } from "react";
import { C } from "../theme.js";
import { engineSource } from "./cncData.js";
import { readsTables } from "./engineSourceRules.js";

export { NEEDS } from "./engineSourceRules.js";

export default function EngineSource({ what, needs = null }) {
  const [source, setSource] = useState(undefined);
  useEffect(() => {
    let gone = false;
    engineSource().then((s) => !gone && setSource(s));
    return () => {
      gone = true;
    };
  }, []);
  if (source === undefined) return null;
  if (readsTables(source, needs)) {
    return <div style={{ fontSize: 13, color: C.accentFinished }}>The program engine reads this list ({source}).</div>;
  }
  return (
    <div style={{ fontSize: 13, color: C.accentRaw }}>
      The program engine still reads its own {what}{source ? ` (${source})` : ""}: a change here does not reach programs yet.
    </div>
  );
}
