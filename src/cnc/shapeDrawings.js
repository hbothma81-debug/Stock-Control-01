// The big dimensioned drawing a shape opens with (Heinrich, 11 Oct 2026:
// "a bigger version opens with dimension boxes where I can add the
// sizes"), one per engine 'picture' key (GET ?shapes=1). Pure data, drawn
// by ShapeDrawing.jsx.
//
// Side view, axis left to right, on a 400-wide grid of height h. A bore is
// hidden (dashed); a thread's minor diameter is a thin line (ISO 6410).
// Each dimension is keyed by the engine's size key and placed only when
// the shape has that size, so the bush drawing serves the spacer too:
//   ext     extension lines (thin, no arrows)
//   line    the dimension line, arrows at both ends
//   lead    a plain line from the box to its dimension
//   pointer a leader with an arrow at its end
//   box     where the size box sits, its centre
//   prefix  "Ø" on a diameter, "M" on a thread, "P" on a pitch
//   ph      what an empty box says
//   wide    a wider box, for a long word
// A box is 64 wide on this grid (73 on a phone, where it is also about 34
// high), so boxes keep that clear of each other and of the outline.
// Chamfer sizes are not drawn: they sit under More settings (Heinrich,
// 11 Oct 2026). A size with no place here shows as a box under the drawing.

export const DRAWINGS = {
  pin: {
    h: 230,
    axis: 110,
    outline: "M145 80 H335 L340 85 V135 L335 140 H145 L140 135 V85 Z",
    dims: [
      { key: "od", ext: "M138 80 H52 M138 140 H52", line: "M60 80 V140", box: [60, 110], prefix: "Ø", ph: "OD" },
      { key: "length", ext: "M140 142 V198 M340 142 V198", line: "M140 190 H340", box: [240, 190], ph: "Length" },
    ],
  },
  bush: {
    h: 245,
    axis: 115,
    outline: "M145 60 H315 L320 65 V165 L315 170 H145 L140 165 V65 Z",
    hidden: "M140 90 H320 M140 140 H320",
    dims: [
      { key: "od", ext: "M138 60 H52 M138 170 H52", line: "M60 60 V170", box: [60, 115], prefix: "Ø", ph: "OD" },
      { key: "id", ext: "M322 90 H378 M322 140 H378", line: "M370 90 V140", box: [362, 115], prefix: "Ø", ph: "ID" },
      { key: "length", ext: "M140 172 V218 M320 172 V218", line: "M140 210 H320", box: [230, 210], ph: "Length" },
    ],
  },
  washer: {
    h: 265,
    axis: 120,
    outline: "M179 40 H221 L225 44 V196 L221 200 H179 L175 196 V44 Z",
    hidden: "M175 90 H225 M175 150 H225",
    dims: [
      { key: "od", ext: "M173 40 H92 M173 200 H92", line: "M100 40 V200", box: [100, 120], prefix: "Ø", ph: "OD" },
      { key: "id", ext: "M227 90 H308 M227 150 H308", line: "M300 90 V150", box: [300, 120], prefix: "Ø", ph: "ID" },
      { key: "thickness", ext: "M175 202 V238 M225 202 V238", line: "M175 230 H225", lead: "M225 230 H250", box: [300, 230], ph: "Thickness", wide: true },
    ],
  },
  flanged_bush: {
    h: 270,
    axis: 125,
    outline: "M115 35 H160 V80 H315 L320 85 V165 L315 170 H160 V215 H115 L110 210 V40 Z",
    hidden: "M110 105 H320 M110 145 H320",
    dims: [
      { key: "flange_od", ext: "M108 35 H42 M108 215 H42", line: "M50 35 V215", box: [50, 125], prefix: "Ø", ph: "Flange" },
      { key: "body_od", ext: "M322 80 H378 M322 170 H378", line: "M370 80 V170", box: [362, 125], prefix: "Ø", ph: "Body" },
      { key: "id", line: "M245 105 V145", box: [245, 125], prefix: "Ø", ph: "solid" },
      { key: "flange_length", ext: "M110 217 V253 M160 217 V253", line: "M110 245 H160", lead: "M110 245 H94", box: [62, 245], ph: "Flange" },
      { key: "body_length", ext: "M320 172 V253", line: "M160 245 H320", box: [240, 245], ph: "Body" },
    ],
  },
  stepped_shaft: {
    h: 290,
    axis: 150,
    outline: "M45 115 H120 V95 H200 V105 H280 V125 H355 L360 130 V170 L355 175 H280 V195 H200 V205 H120 V185 H45 L40 180 V120 Z",
    ext: "M40 182 V258 M120 207 V258 M200 207 V258 M280 197 V258 M360 172 V258",
    dims: [
      { key: "od1", lead: "M80 60 V115", line: "M80 115 V185", box: [80, 45], prefix: "Ø", ph: "Step 1" },
      { key: "od2", lead: "M160 60 V95", line: "M160 95 V205", box: [160, 45], prefix: "Ø", ph: "Step 2" },
      { key: "od3", lead: "M240 60 V105", line: "M240 105 V195", box: [240, 45], prefix: "Ø", ph: "none" },
      { key: "od4", lead: "M320 60 V125", line: "M320 125 V175", box: [320, 45], prefix: "Ø", ph: "none" },
      { key: "length1", line: "M40 250 H120", box: [80, 250], ph: "Length" },
      { key: "length2", line: "M120 250 H200", box: [160, 250], ph: "Length" },
      { key: "length3", line: "M200 250 H280", box: [240, 250], ph: "none" },
      { key: "length4", line: "M280 250 H360", box: [320, 250], ph: "none" },
    ],
  },
  stepped_bore: {
    h: 285,
    axis: 145,
    outline: "M165 85 H320 L325 90 V200 L320 205 H165 L160 200 V90 Z",
    hidden: "M160 115 H230 V130 H325 M160 175 H230 V160 H325",
    dims: [
      { key: "od", ext: "M158 85 H30 M158 205 H30", line: "M38 85 V205", box: [38, 145], prefix: "Ø", ph: "OD" },
      { key: "counterbore", ext: "M158 115 H104 M158 175 H104", line: "M112 115 V175", box: [112, 145], prefix: "Ø", ph: "C/bore" },
      { key: "id", ext: "M327 130 H378 M327 160 H378", line: "M370 130 V160", box: [362, 145], prefix: "Ø", ph: "Bore" },
      { key: "counterbore_depth", ext: "M160 83 V42 M230 113 V42", line: "M160 50 H230", lead: "M230 50 H262", box: [294, 50], ph: "Depth" },
      { key: "length", ext: "M160 207 V248 M325 207 V248", line: "M160 240 H325", box: [242, 240], ph: "Length" },
    ],
  },
  thread_stud: {
    h: 250,
    axis: 115,
    // The thick lines at x 175 and 265 are where each thread ends.
    outline: "M96 85 H344 L350 91 V139 L344 145 H96 L90 139 V91 Z M175 85 V145 M265 85 V145",
    thin: "M90 92 H175 M90 138 H175 M265 92 H350 M265 138 H350",
    dims: [
      { key: "thread", ext: "M88 85 H37 M88 145 H37", line: "M45 85 V145", box: [45, 115], prefix: "M", ph: "size" },
      { key: "pitch", pointer: "M132 62 V90", box: [132, 45], prefix: "P", ph: "coarse" },
      { key: "thread_length_1", ext: "M175 147 V188", line: "M90 180 H175", box: [132, 180], ph: "Thread" },
      { key: "thread_length_2", ext: "M265 147 V188", line: "M265 180 H350", box: [307, 180], ph: "none" },
      { key: "length", ext: "M90 147 V223 M350 147 V223", line: "M90 215 H350", box: [220, 215], ph: "Length" },
    ],
  },
  // A bar sharpened at one end or both, the point given in Z (its length)
  // and X (the tip diameter, 0 = sharp): Heinrich, 12 Oct 2026, for SS304
  // meat hooks. End 1 is the z=0 end, on the left.
  sharpened: {
    h: 240,
    axis: 120,
    outline: "M110 116 L170 90 H250 L310 116 V124 L250 150 H170 L110 124 Z",
    ext: "M110 126 V223 M310 126 V223 M170 152 V188 M250 152 V188",
    dims: [
      { key: "od", lead: "M210 57 V90", line: "M210 90 V150", box: [210, 40], prefix: "Ø", ph: "OD" },
      { key: "tip_dia_1", pointer: "M82 120 H108", box: [45, 120], prefix: "Ø", ph: "sharp" },
      { key: "point_length_1", line: "M110 180 H170", lead: "M110 180 H99", box: [62, 180], ph: "Point" },
      { key: "tip_dia_2", pointer: "M321 120 H312", box: [358, 120], prefix: "Ø", ph: "sharp" },
      { key: "point_length_2", line: "M250 180 H310", lead: "M310 180 H321", box: [358, 180], ph: "none" },
      { key: "length", line: "M110 215 H310", box: [210, 215], ph: "Length" },
    ],
  },
  // A radius on the end corner, one end or both; half the bar is a full
  // round end (Heinrich, 12 Oct 2026).
  radius_end: {
    h: 235,
    axis: 120,
    outline: "M130 80 H290 A20 20 0 0 1 310 100 V140 A20 20 0 0 1 290 160 H130 A20 20 0 0 1 110 140 V100 A20 20 0 0 1 130 80 Z",
    ext: "M110 142 V213 M310 142 V213",
    dims: [
      { key: "od", ext: "M128 80 H47 M128 160 H47", line: "M55 80 V160", box: [55, 120], prefix: "Ø", ph: "OD" },
      { key: "radius_1", pointer: "M100 58 L114 84", box: [75, 42], prefix: "R", ph: "end 1" },
      { key: "radius_2", pointer: "M320 58 L306 84", box: [345, 42], prefix: "R", ph: "none" },
      { key: "length", line: "M110 205 H310", box: [210, 205], ph: "Length" },
    ],
  },
};

// A chamfer size goes under More settings, not on the drawing.
export const isChamfer = (field) => /chamfer/i.test(field.key);

// The sizes that are neither on the shape's drawing nor chamfers: boxes
// under the drawing (all of them for a picture with no drawing yet).
export function sizesOffDrawing(shape) {
  const placed = new Set((DRAWINGS[shape?.picture]?.dims || []).map((d) => d.key));
  return (shape?.fields || []).filter((f) => !isChamfer(f) && !placed.has(f.key));
}
