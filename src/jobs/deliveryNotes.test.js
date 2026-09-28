import { test } from "node:test";
import assert from "node:assert/strict";
import {
  numberOfNote, nextNoteNumber, noteRows, withoutNewColumns, isMissingNewColumn, isNumberRefused, allocatorMissing,
  notePdfLines, notesByRequest, notesOnJob, canMakeNoteFor, linkReady, linesOfRequest, noteNotMadeWords, noteToRebuild, canRebuildNote,
} from "./deliveryNotes.js";

test("a note's number: DN-0005 is 5, anything else is none", () => {
  assert.equal(numberOfNote("DN-0005"), 5);
  assert.equal(numberOfNote(" DN-12345 "), 12345);
  assert.equal(numberOfNote("DN-"), null);
  assert.equal(numberOfNote("PO-0005"), null);
  assert.equal(numberOfNote("DN-0005a"), null);
  assert.equal(numberOfNote(null), null);
});

test("the next number: live on 28 Sep, the counter said 5 and DN-0005 existed", () => {
  assert.equal(nextNoteNumber(["DN-0001", "DN-0002", "DN-0003", "DN-0004", "DN-0005"], 5), 6);
});

test("the next number: never one a note carries, never below the counter", () => {
  assert.equal(nextNoteNumber([], 1), 1);
  assert.equal(nextNoteNumber([], null), 1);
  assert.equal(nextNoteNumber(null, undefined), 1);
  assert.equal(nextNoteNumber(["DN-0003"], 9), 9);
  assert.equal(nextNoteNumber(["DN-0009", "DN-0003"], 2), 10);
  assert.equal(nextNoteNumber(["rubbish", "DN-0002"], 0), 3);
  // rows of one note share its number
  assert.equal(nextNoteNumber(["DN-0006", "DN-0006", "DN-0006"], 6), 7);
});

const job = { id: "job-1", job_number: "JOB-0068", customer: "HPE" };
const lines = [
  { item: { id: "a", description: "Bracket", sort_order: 1 }, qty: 4 },
  { item: { id: "b", description: "Gusset", sort_order: 2 }, qty: 2.5 },
];

test("rows: one per line, sharing the number, every row with every key", () => {
  const rows = noteRows({ noteNumber: "DN-0006", job, itemsWithQty: lines, direction: "to_customer", recipientName: " HPE ", createdBy: "Test", requestId: "req-1" });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    delivery_note_number: "DN-0006", job_id: "job-1", quote_item_id: "a", recipient_type: "customer", recipient_name: "HPE",
    recipient_address: "", direction: "to_customer", notes: "", created_by: "Test", qty: 4, invoice_request_id: "req-1",
  });
  assert.equal(rows[1].quote_item_id, "b");
  assert.equal(rows[1].qty, 2.5);
  assert.deepEqual(Object.keys(rows[0]), Object.keys(rows[1]));
});

test("rows: a note made by hand names no request; a supplier's is a supplier's", () => {
  const rows = noteRows({ noteNumber: "DN-0007", job, itemsWithQty: lines.slice(0, 1), direction: "to_supplier", recipientName: "Test Steel", recipientAddress: "1 Road", notes: " for plating ", createdBy: "Test" });
  assert.equal(rows[0].invoice_request_id, null);
  assert.equal(rows[0].recipient_type, "supplier");
  assert.equal(rows[0].direction, "to_supplier");
  assert.equal(rows[0].recipient_address, "1 Road");
  assert.equal(rows[0].notes, "for plating");
  assert.deepEqual(noteRows({ noteNumber: "DN-0008", job, itemsWithQty: [] }), []);
});

test("a database without the new columns gets the rows without them", () => {
  const rows = noteRows({ noteNumber: "DN-0006", job, itemsWithQty: lines, direction: "to_customer", recipientName: "HPE", requestId: "req-1" });
  const old = withoutNewColumns(rows);
  assert.equal("qty" in old[0], false);
  assert.equal("invoice_request_id" in old[0], false);
  assert.equal(old[0].delivery_note_number, "DN-0006");
  assert.equal("qty" in rows[0], true, "the rows handed in are left as they were");
});

test("what the database's refusals mean", () => {
  assert.equal(isMissingNewColumn({ code: "PGRST204", message: "Could not find the 'qty' column of 'delivery_notes' in the schema cache" }), true);
  assert.equal(isMissingNewColumn({ code: "PGRST204", message: "Could not find the 'invoice_request_id' column of 'delivery_notes' in the schema cache" }), true);
  assert.equal(isMissingNewColumn({ code: "PGRST204", message: "Could not find the 'colour' column of 'delivery_notes' in the schema cache" }), false);
  assert.equal(isMissingNewColumn({ code: "23505", message: "duplicate key value" }), false);
  assert.equal(isMissingNewColumn(null), false);

  assert.equal(isNumberRefused({ code: "23505", message: 'duplicate key value violates unique constraint "delivery_notes_delivery_note_number_key"' }), true);
  assert.equal(isNumberRefused({ code: "23505", message: 'duplicate key value violates unique constraint "jobs_pkey"' }), false);
  assert.equal(isNumberRefused({ code: "42501", message: "refused" }), false);

  assert.equal(allocatorMissing({ code: "PGRST202", message: "Could not find the function public.take_delivery_note_number" }), true);
  assert.equal(allocatorMissing({ code: "500", message: "down" }), false);
  assert.equal(allocatorMissing(null), false);
});

test("the PDF's lines: code, description, quantity, in the order given", () => {
  const got = notePdfLines(lines, (it) => `C-${it.id}`, (it) => it.description.toUpperCase());
  assert.deepEqual(got, [
    { code: "C-a", description: "BRACKET", qty: 4 },
    { code: "C-b", description: "GUSSET", qty: 2.5 },
  ]);
});

test("which note belongs to which request", () => {
  const held = [
    { delivery_note_number: "DN-0006", invoice_request_id: "req-1", created_at: "2026-09-28T08:00:00Z", quote_item_id: "a" },
    { delivery_note_number: "DN-0006", invoice_request_id: "req-1", created_at: "2026-09-28T08:00:00Z", quote_item_id: "b" },
    { delivery_note_number: "DN-0007", invoice_request_id: "req-2", created_at: "2026-09-28T09:00:00Z", quote_item_id: "c" },
    { delivery_note_number: "DN-0005", invoice_request_id: null, created_at: "2026-08-31T09:00:00Z", quote_item_id: "z" },
    { delivery_note_number: "DN-0004", created_at: "2026-08-31T08:00:00Z" },
  ];
  const map = notesByRequest(held);
  assert.equal(map.size, 2);
  assert.equal(map.get("req-1").number, "DN-0006");
  assert.equal(map.get("req-1").rows.length, 2);
  assert.equal(map.get("req-2").number, "DN-0007");
  assert.equal(map.get("req-3"), undefined);
  assert.equal(notesByRequest(null).size, 0);
});

test("two notes naming one request: the earlier is the one shown", () => {
  const map = notesByRequest([
    { delivery_note_number: "DN-0009", invoice_request_id: "req-1", created_at: "2026-09-28T10:00:00Z" },
    { delivery_note_number: "DN-0006", invoice_request_id: "req-1", created_at: "2026-09-28T08:00:00Z" },
  ]);
  assert.equal(map.get("req-1").number, "DN-0006");
  assert.equal(map.get("req-1").rows.length, 1);
});

test("the notes on a job: each number once, in number order, this job's only", () => {
  const held = [
    { job_id: "j1", delivery_note_number: "DN-0010" },
    { job_id: "j1", delivery_note_number: "DN-0003" },
    { job_id: "j1", delivery_note_number: "DN-0003" },
    { job_id: "j2", delivery_note_number: "DN-0004" },
    { job_id: "j1", delivery_note_number: "" },
    { job_id: "j1", delivery_note_number: "DN-0002" },
  ];
  assert.deepEqual(notesOnJob(held, "j1"), ["DN-0002", "DN-0003", "DN-0010"]);
  assert.deepEqual(notesOnJob(held, "j3"), []);
  assert.deepEqual(notesOnJob(null, "j1"), []);
});

test("Make delivery note is offered only to a request that kept its lines", () => {
  assert.equal(canMakeNoteFor({ submitted_at: "2026-09-26T21:59:59Z" }), false, "26 Sep 23:59 in South Africa");
  assert.equal(canMakeNoteFor({ submitted_at: "2026-09-26T22:00:00Z" }), true, "27 Sep 00:00 in South Africa");
  assert.equal(canMakeNoteFor({ submitted_at: "2026-09-28T08:47:00+00:00" }), true);
  assert.equal(canMakeNoteFor({ submitted_at: "2026-09-19T04:50:00+00:00" }), false);
  assert.equal(canMakeNoteFor({ submitted_at: null }), false);
  assert.equal(canMakeNoteFor(null), false);
});

test("whether the database has the link: read off a row, or cannot tell", () => {
  assert.equal(linkReady([{ delivery_note_number: "DN-0001", invoice_request_id: null }]), true);
  assert.equal(linkReady([{ delivery_note_number: "DN-0001" }]), false);
  assert.equal(linkReady([]), null);
  assert.equal(linkReady(null), null);
});

test("a note for a request already sent: its lines from the request's own log, in quote order", () => {
  const quoteItems = [
    { id: "b", description: "Gusset", sort_order: 2 },
    { id: "a", description: "Bracket", sort_order: 1 },
  ];
  const log = [
    { quote_item_id: "b", qty_added: 2 },
    { quote_item_id: "a", qty_added: "4" },
    { quote_item_id: "gone", qty_added: 1 },
    { quote_item_id: "a", qty_added: 0 },
  ];
  const got = linesOfRequest(log, quoteItems);
  assert.deepEqual(got.itemsWithQty.map((l) => [l.item.id, l.qty]), [["a", 4], ["b", 2]]);
  assert.equal(got.gone, 1);
  assert.deepEqual(linesOfRequest([], quoteItems), { itemsWithQty: [], gone: 0 });
  assert.deepEqual(linesOfRequest(null, null), { itemsWithQty: [], gone: 0 });
});

test("the words when the request went and its note did not", () => {
  const plain = noteNotMadeWords("JOB-0068", new Error("network"));
  assert.match(plain, /JOB-0068 WAS sent/);
  assert.match(plain, /Check your connection/);
  assert.match(plain, /Make delivery note/);
  const setup = noteNotMadeWords("JOB-0068", Object.assign(new Error("x"), { needsSetup: true }));
  assert.match(setup, /setup-delivery-notes-per-request\.sql/);
  assert.match(setup, /WAS sent/);
});

const noteRow = (over) => ({
  id: "r", delivery_note_number: "DN-0009", job_id: "job-1", quote_item_id: "a", qty: 1, direction: "to_customer",
  recipient_name: "Tilvis Engineering", recipient_address: "", created_at: "2026-09-28T08:32:31Z", ...over,
});

test("rebuilding a note's PDF: its lines and quantities from its own rows, in quote order", () => {
  const quoteItems = [
    { id: "b", description: "Gusset", sort_order: 2 },
    { id: "a", description: "Bracket", sort_order: 1 },
    { id: "c", description: "Not on the note", sort_order: 3 },
  ];
  const rows = [
    noteRow({ id: "2", quote_item_id: "b", qty: "2.5", created_at: "2026-09-28T08:32:32Z" }),
    noteRow({ id: "1", quote_item_id: "a", qty: 4 }),
  ];
  const got = noteToRebuild(rows, quoteItems);
  assert.equal(got.ok, true);
  assert.deepEqual(got.itemsWithQty.map((l) => [l.item.description, l.qty]), [["Bracket", 4], ["Gusset", 2.5]]);
  // The number, the date and who it went to are the note's own.
  assert.deepEqual(got.note, {
    delivery_note_number: "DN-0009",
    direction: "to_customer",
    recipient_name: "Tilvis Engineering",
    recipient_address: "",
    created_at: "2026-09-28T08:32:31Z",
  });
});

test("rebuilding: a supplier's note keeps its supplier and address", () => {
  const got = noteToRebuild(
    [noteRow({ direction: "to_supplier", recipient_name: "Test Steel Supplies", recipient_address: "12 Industry Road\nWadeville" })],
    [{ id: "a", description: "Bracket", sort_order: 1 }]
  );
  assert.equal(got.note.direction, "to_supplier");
  assert.equal(got.note.recipient_address, "12 Industry Road\nWadeville");
});

test("rebuilding is refused for a note from before quantities were kept: DN-0001 to DN-0005 on live", () => {
  const got = noteToRebuild([noteRow({ delivery_note_number: "DN-0005", qty: null })], [{ id: "a", description: "Bracket" }]);
  assert.equal(got.ok, false);
  assert.match(got.why, /DN-0005 was made before delivery notes kept their quantities/);
  assert.match(got.why, /left as it is/);
  // One row without a quantity is enough: the paper would be half a guess.
  assert.equal(noteToRebuild([noteRow({ qty: 3 }), noteRow({ id: "2", quote_item_id: "b", qty: 0 })], [{ id: "a" }, { id: "b" }]).ok, false);
});

test("rebuilding is refused where a line has left the job: the paper would come out short", () => {
  const rows = [noteRow({}), noteRow({ id: "2", quote_item_id: "gone" }), noteRow({ id: "3", quote_item_id: "gone too" })];
  const got = noteToRebuild(rows, [{ id: "a", description: "Bracket" }]);
  assert.equal(got.ok, false);
  assert.match(got.why, /2 of the 3 lines on DN-0009 are no longer on the job/);
  assert.match(noteToRebuild(rows.slice(0, 2), [{ id: "a" }]).why, /1 of the 2 lines on DN-0009 is no longer on the job/);
});

test("rebuilding is refused for no rows, and for rows of two notes or two jobs", () => {
  assert.equal(noteToRebuild([], []).ok, false);
  assert.equal(noteToRebuild(null, null).ok, false);
  assert.match(noteToRebuild([], []).why, /no lines in the database/);
  const items = [{ id: "a" }];
  assert.equal(noteToRebuild([noteRow({}), noteRow({ id: "2", delivery_note_number: "DN-0010" })], items).ok, false);
  assert.equal(noteToRebuild([noteRow({}), noteRow({ id: "2", job_id: "job-2" })], items).ok, false);
});

test("the Rebuild PDF button: only on a note whose every line kept its quantity", () => {
  assert.equal(canRebuildNote([noteRow({ qty: 4 }), noteRow({ id: "2", qty: "2.5" })]), true);
  // DN-0001 to DN-0005 on live: made before quantities were kept.
  assert.equal(canRebuildNote([noteRow({ qty: null })]), false);
  assert.equal(canRebuildNote([noteRow({ qty: 4 }), noteRow({ id: "2", qty: undefined })]), false);
  assert.equal(canRebuildNote([noteRow({ qty: 0 })]), false);
  assert.equal(canRebuildNote([]), false);
  assert.equal(canRebuildNote(null), false);
});
