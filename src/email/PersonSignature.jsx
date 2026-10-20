// One person's email signature on their User Management card: as it goes
// out, with Change signature (Heinrich, 20 Oct 2026: "yes add to user
// manager"). The same box as under every send window (useSignature.jsx),
// for somebody else's row: the database lets an admin read and change any
// person's (setup-email-signatures.sql). Their one row is read when the
// card is opened, never the whole table and never on a timer.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { SignatureBox, useSignature } from "./useSignature.jsx";

export default function PersonSignature({ person }) {
  // Who is saving, for the row's updated_by: the admin, not the person.
  const [by, setBy] = useState(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => alive && setBy(data?.user?.email || null));
    return () => {
      alive = false;
    };
  }, []);
  const sig = useSignature({ id: person.id, name: person.name }, person.email, { by });
  return (
    <div style={{ marginTop: 8 }}>
      <SignatureBox sig={sig} forOther />
    </div>
  );
}
