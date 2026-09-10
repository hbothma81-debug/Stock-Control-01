// How a program is named on screen.
//
// A plate program is its SigmaNest number and nothing else: that is what
// the operator loads at the machine. A tube program has a number the app
// handed out (TL-0012) and the name the nester gave the nest (COFFEE
// TABLE), and the operator wants both -- the number is what the nest is
// saved under in the tube software, the name is what everyone calls it.
export function programTitle(p) {
  if (!p) return "";
  const name = (p.nesting_name || "").trim();
  return name ? `${p.program_number} · ${name}` : p.program_number || "";
}
