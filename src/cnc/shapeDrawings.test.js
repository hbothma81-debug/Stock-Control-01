import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAWINGS, isChamfer, sizesOffDrawing } from "./shapeDrawings.js";

// The engine's shapes as its ?shapes=1 sends them on 11 Oct 2026 (turnpath
// data/shapes.json), keys and pictures only.
const SHAPES = {
  pin: ["pin", "od length chamfer"],
  bush: ["bush", "od id length chamfer_od chamfer_id"],
  spacer: ["bush", "od id length chamfer"],
  washer: ["washer", "od id thickness chamfer"],
  flanged_bush: ["flanged_bush", "flange_od flange_length body_od body_length id chamfer_od chamfer_id"],
  stepped_shaft: ["stepped_shaft", "od1 length1 od2 length2 od3 length3 od4 length4 chamfer"],
  stepped_bore: ["stepped_bore", "od length counterbore counterbore_depth id chamfer_od chamfer_id"],
  thread_stud: ["thread_stud", "thread pitch length thread_length_1 thread_length_2 chamfer"],
};
const shape = (key) => ({ key, picture: SHAPES[key][0], fields: SHAPES[key][1].split(" ").map((k) => ({ key: k, label: k })) });

test("every shape the engine offers has a drawing with each size on it, chamfers aside", () => {
  for (const key of Object.keys(SHAPES)) {
    assert.ok(DRAWINGS[shape(key).picture], `${key} has a drawing`);
    assert.deepEqual(sizesOffDrawing(shape(key)), [], `${key}: every size is on the drawing`);
  }
});

test("chamfers go under More settings, not on the drawing", () => {
  assert.equal(isChamfer({ key: "chamfer_od" }), true);
  assert.equal(isChamfer({ key: "counterbore" }), false);
  for (const d of Object.values(DRAWINGS)) assert.equal(d.dims.some((x) => /chamfer/.test(x.key)), false);
});

test("a picture with no drawing yet still gets a box for every size but the chamfers", () => {
  const s = { picture: "cone", fields: [{ key: "od" }, { key: "angle" }, { key: "chamfer" }] };
  assert.deepEqual(sizesOffDrawing(s).map((f) => f.key), ["od", "angle"]);
});

test("no two boxes on a drawing overlap, on a phone (73 wide, 34 high) as on a PC", () => {
  for (const [name, d] of Object.entries(DRAWINGS)) {
    const boxes = d.dims.map((x) => x.box);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const apart = Math.abs(boxes[i][0] - boxes[j][0]) >= 73 || Math.abs(boxes[i][1] - boxes[j][1]) >= 34;
        assert.ok(apart, `${name}: ${d.dims[i].key} and ${d.dims[j].key} overlap`);
      }
  }
});
