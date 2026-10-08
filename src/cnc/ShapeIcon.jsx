// A small side view of each shape, by the engine's 'picture' key (GET
// ?shapes=1). The axis runs left to right; a bore is drawn dashed. A key
// with no drawing gets a plain bar, so a shape the engine adds later still
// shows.

const DRAW = {
  pin: <rect x="6" y="12" width="52" height="16" rx="2" />,
  bush: (
    <>
      <rect x="10" y="6" width="44" height="28" rx="2" />
      <rect x="10" y="13" width="44" height="14" strokeDasharray="3 2" />
    </>
  ),
  washer: (
    <>
      <rect x="26" y="4" width="12" height="32" rx="1.5" />
      <rect x="26" y="14" width="12" height="12" strokeDasharray="3 2" />
    </>
  ),
  flanged_bush: (
    <>
      <path d="M8 4 H20 V10 H56 V30 H20 V36 H8 Z" />
      <rect x="8" y="15" width="48" height="10" strokeDasharray="3 2" />
    </>
  ),
  stepped_shaft: <path d="M4 12 H22 V8 H42 V14 H60 V26 H42 V32 H22 V28 H4 Z" />,
  stepped_bore: (
    <>
      <rect x="8" y="6" width="48" height="28" rx="2" />
      <path d="M8 11 H24 V15 H56 M8 29 H24 V25 H56" strokeDasharray="3 2" />
    </>
  ),
  thread_stud: (
    <>
      <rect x="6" y="12" width="52" height="16" rx="2" />
      <path d="M8 12 l3 16 M14 12 l3 16 M20 12 l3 16 M26 12 l3 16 M44 12 l3 16 M50 12 l3 16" />
    </>
  ),
};

export default function ShapeIcon({ picture, size = 56 }) {
  return (
    <svg viewBox="0 0 64 40" width={size} height={(size * 40) / 64} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <line x1="2" y1="20" x2="62" y2="20" strokeWidth="0.6" strokeDasharray="6 2 1 2" opacity="0.6" />
      {DRAW[picture] || <rect x="6" y="12" width="52" height="16" rx="2" />}
    </svg>
  );
}
