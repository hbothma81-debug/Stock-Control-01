// The delivery note's paper, drawn with the real PDF builder and read back
// from what it was told to print: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { drawDeliveryNote, fitsOneSheet, NOTE_PAGE, TOP_HALF_ENDS, COPIES } from "./deliveryNotePdf.js";

const NOTE = {
  delivery_note_number: "DN-0009",
  direction: "to_customer",
  recipient_name: "Tilvis Engineering",
  recipient_address: "",
  created_at: "2026-09-28T08:32:31Z",
};
const COMPANY = { name: "East Rand Supplies" };

const lines = (n, describe = (i) => `V3-PLT-FDR REV-A P-${String(i + 1).padStart(3, "0")} LH`) =>
  Array.from({ length: n }, (_, i) => ({ code: i % 2 ? `C-${i}` : "", description: describe(i), qty: i + 1 }));

// Draws a note and keeps every piece of text with its page and height.
function draw(lineItems, note = NOTE, company = COMPANY) {
  const doc = new jsPDF();
  const drawn = [];
  const real = doc.text.bind(doc);
  doc.text = (text, x, y, ...rest) => {
    const words = Array.isArray(text) ? text.join(" ") : String(text);
    drawn.push({ text: words, y, page: doc.internal.getCurrentPageInfo().pageNumber });
    return real(text, x, y, ...rest);
  };
  const report = drawDeliveryNote({ doc, autoTable, note, lineItems, company });
  return { doc, drawn, report };
}

const where = (drawn, text) => drawn.filter((d) => d.text === text);

test("the spy sees what the table prints, or every test below proves nothing", () => {
  const { drawn } = draw(lines(3));
  assert.equal(where(drawn, "V3-PLT-FDR REV-A P-002 LH").length, 2);
  assert.equal(where(drawn, "Description").length, 2);
});

test("the rule: the top half is full below 147 mm, or once the copy has left page 1", () => {
  assert.equal(fitsOneSheet({ signaturesAt: 146, lastPage: 1 }), true);
  assert.equal(fitsOneSheet({ signaturesAt: TOP_HALF_ENDS, lastPage: 1 }), true);
  assert.equal(fitsOneSheet({ signaturesAt: 153, lastPage: 1 }), false);
  assert.equal(fitsOneSheet({ signaturesAt: 40, lastPage: 2 }), false);
});

test("a note of up to nine lines is one sheet, as it always was", () => {
  for (const n of [1, 2, 4, 6, 9]) {
    const { drawn, report } = draw(lines(n));
    assert.equal(report.layout, "one sheet", `${n} lines`);
    assert.equal(report.pages, 1, `${n} lines`);
    assert.deepEqual(report.copies.map((c) => c.top), [NOTE_PAGE.top, NOTE_PAGE.secondCopyTop]);
    // The two copies keep to their own half of the page.
    const ours = drawn.findIndex((d) => d.text === COPIES[1]);
    assert.ok(ours > 0);
    for (const d of drawn.slice(0, ours)) assert.ok(d.y < NOTE_PAGE.cutLine, `${n} lines: "${d.text}" of the customer's copy at ${d.y}`);
    for (const d of drawn.slice(ours)) assert.ok(d.y > NOTE_PAGE.cutLine && d.y <= 287,`${n} lines: "${d.text}" of our copy at ${d.y}`);
    // No page count on a single sheet.
    assert.equal(drawn.filter((d) => /page \d+ of \d+/.test(d.text)).length, 0);
  }
});

test("the three notes made on live on 28 Sep 2026 are drawn where they were", () => {
  // Read from the stored PDFs: the signature line of the customer's copy.
  for (const [n, at] of [[6, 123], [4, 108], [2, 93]]) {
    const { report } = draw(lines(n));
    assert.equal(Math.round(report.copies[0].signaturesAt), at, `${n} lines`);
    assert.equal(Math.round(report.copies[1].signaturesAt), at + 140, `${n} lines`);
  }
});

test("from ten lines each copy has its own pages", () => {
  for (const n of [10, 11, 12, 25, 40, 90]) {
    const { drawn, report } = draw(lines(n));
    assert.equal(report.layout, "a copy each", `${n} lines`);
    const [customers, ours] = report.copies;
    assert.equal(customers.firstPage, 1);
    assert.equal(ours.firstPage, customers.lastPage + 1, `${n} lines: ours starts on a fresh page`);
    assert.equal(ours.lastPage, report.pages);
    assert.equal(ours.top, NOTE_PAGE.top, "ours starts at the top of its page");
    // Every line is printed twice, once in each copy's own pages.
    for (const li of lines(n)) {
      const at = where(drawn, li.description);
      assert.equal(at.length, 2, `${n} lines: ${li.description}`);
      assert.ok(at[0].page >= customers.firstPage && at[0].page <= customers.lastPage);
      assert.ok(at[1].page >= ours.firstPage && at[1].page <= ours.lastPage);
    }
    // Each copy has its heading and its signatures once.
    assert.equal(where(drawn, "DELIVERY NOTE").length, 2);
    assert.equal(drawn.filter((d) => d.text.startsWith("Sent by:")).length, 2);
    assert.equal(drawn.filter((d) => d.text.startsWith("Received by:")).length, 2);
  }
});

test("the 25 lines of JOB-0132: a page for the customer, a page for us", () => {
  const { drawn, report } = draw(lines(25));
  assert.equal(report.pages, 2);
  assert.deepEqual(report.copies.map((c) => [c.firstPage, c.lastPage]), [[1, 1], [2, 2]]);
  assert.deepEqual(
    drawn.filter((d) => /page \d+ of \d+/.test(d.text)).map((d) => [d.page, d.text]),
    [
      [1, "DN-0009 — Recipient Copy — page 1 of 1"],
      [2, "DN-0009 — Our Copy — page 1 of 1"],
    ]
  );
});

test("nothing is printed off the bottom of a page, whatever the number of lines", () => {
  let overThePage = 0;
  for (let n = 1; n <= 120; n++) {
    const { drawn, report } = draw(lines(n));
    for (const d of drawn) {
      const isPageCount = /page \d+ of \d+/.test(d.text);
      assert.ok(d.y <= (isPageCount ? NOTE_PAGE.footer : 287), `${n} lines: "${d.text}" at ${d.y} on page ${d.page}`);
      assert.ok(d.y > 0);
    }
    if (report.layout === "a copy each") {
      // With a page count under them, the signatures keep clear of it.
      for (const c of report.copies) assert.ok(c.signaturesAt <= NOTE_PAGE.lastLine, `${n} lines: signatures at ${c.signaturesAt}`);
      if (report.copies[0].signaturesAt === NOTE_PAGE.top) overThePage++;
    } else {
      assert.equal(report.pages, 1, `${n} lines on one sheet`);
    }
  }
  // Some number of lines fills a page to the last row: the signatures
  // must then have gone over the page, and this loop must have met it.
  assert.ok(overThePage > 0, "no note in 1 to 120 lines put its signatures over the page");
});

test("signatures that go over the page land on a page that says whose it is", () => {
  for (let n = 10; n <= 120; n++) {
    const { drawn, report } = draw(lines(n));
    const [customers] = report.copies;
    if (customers.signaturesAt !== NOTE_PAGE.top || customers.lastPage === customers.firstPage) continue;
    const onLast = drawn.filter((d) => d.page === customers.lastPage);
    assert.ok(onLast.some((d) => d.text === "DN-0009 — Recipient Copy, continued"), `${n} lines`);
    assert.ok(onLast.some((d) => d.text.startsWith("Sent by:")), `${n} lines`);
    return;
  }
  assert.fail("no such note found");
});

test("a page the table runs on to says whose copy it is, and which page", () => {
  const { drawn, report } = draw(lines(90));
  const [customers, ours] = report.copies;
  assert.ok(customers.lastPage - customers.firstPage >= 2, "90 lines take three pages or more a copy");
  for (const copy of [customers, ours]) {
    const of = copy.lastPage - copy.firstPage + 1;
    for (let p = copy.firstPage; p <= copy.lastPage; p++) {
      const onPage = drawn.filter((d) => d.page === p).map((d) => d.text);
      assert.ok(onPage.includes(`DN-0009 — ${copy.label} — page ${p - copy.firstPage + 1} of ${of}`), `page ${p}`);
      assert.equal(onPage.includes(`DN-0009 — ${copy.label}, continued`), p > copy.firstPage, `page ${p}`);
      // The table's heading is on every page that has rows.
      if (onPage.some((t) => /^V3-PLT-FDR/.test(t))) assert.ok(onPage.includes("Description"), `page ${p}`);
    }
  }
});

test("it is measured, not counted: descriptions that wrap fill the half sooner", () => {
  const long = (i) => `Bracket ${i + 1}, laser cut and bent, 3 mm mild steel, galvanised after welding, to drawing FSS_FOU-CV R REV-B sheet ${i + 1}, left and right hand as a pair, packed per pallet`;
  const short = draw(lines(7));
  const wrapped = draw(lines(7, long));
  assert.equal(short.report.layout, "one sheet");
  assert.equal(wrapped.report.layout, "a copy each");
  assert.ok(wrapped.report.copies[0].signaturesAt > TOP_HALF_ENDS);
});

test("an address takes the room of its lines, and the table starts below it", () => {
  const note = { ...NOTE, direction: "to_supplier", recipient_name: "Test Steel Supplies", recipient_address: "12 Industry Road\nWadeville\nGermiston\n1422" };
  const { drawn, report } = draw(lines(3), note);
  assert.equal(report.layout, "one sheet");
  const address = drawn.find((d) => d.text.startsWith("12 Industry Road"));
  const head = drawn.find((d) => d.text === "Description");
  assert.ok(address, "the address is printed");
  // Four lines of 4.5 mm from where the address starts.
  assert.ok(head.y > address.y + 4 * 4.5, `the table's heading at ${head.y}, the address from ${address.y}`);
  assert.ok(drawn.some((d) => d.text === "To (Supplier):"));
});

test("a note with nothing odd about it needs no logo, no address and no company name", () => {
  const { report } = draw(lines(2), { ...NOTE, recipient_address: null }, {});
  assert.equal(report.layout, "one sheet");
  const viaNothing = () => {
    const doc = new jsPDF();
    return drawDeliveryNote({ doc, autoTable, note: NOTE, lineItems: lines(2) });
  };
  assert.equal(viaNothing().layout, "one sheet");
});

test("the app's logo is asked for once a copy, at the copy's own height", () => {
  const asked = [];
  const doc = new jsPDF();
  drawDeliveryNote({
    doc,
    autoTable,
    note: NOTE,
    lineItems: lines(25),
    company: COMPANY,
    drawLogo: (d, company, x, y, maxW, maxH) => {
      asked.push({ page: d.internal.getCurrentPageInfo().pageNumber, x, y, maxW, maxH, name: company.name });
      return { width: 26, height: 10 };
    },
  });
  assert.deepEqual(asked, [
    { page: 1, x: 14, y: 18, maxW: 26, maxH: 14, name: "East Rand Supplies" },
    { page: 2, x: 14, y: 18, maxW: 26, maxH: 14, name: "East Rand Supplies" },
  ]);
});
