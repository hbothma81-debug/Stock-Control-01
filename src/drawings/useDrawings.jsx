// Drawings: the drawing lookup, signed links, revisions, upload, delete and preview.
//
// Moved word for word out of App.jsx on 2026-10-07; see docs/SPLIT-DRAWINGS-ASSETS-PLAN.md.
// useDrawingsState() holds the screens' state and runs where that state was
// declared. useDrawings() holds the functions and runs below App's
// permissions block, because it reads isAdmin; it takes everything it
// borrows from the rest of the app in one deps object.

import { useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

export function useDrawingsState() {
  const [drawingSearchQuery, setDrawingSearchQuery] = useState("");
  const [drawingSearchResults, setDrawingSearchResults] = useState(null);
  const [drawingCustomerFilter, setDrawingCustomerFilter] = useState("");
  const [drawingSearchLoading, setDrawingSearchLoading] = useState(false);
  const [drawingSearchFailed, setDrawingSearchFailed] = useState(false);
  const [expandedDrawingHistory, setExpandedDrawingHistory] = useState({});
  const [showDrawingUpload, setShowDrawingUpload] = useState(false);
  const [drawingUploadCustomer, setDrawingUploadCustomer] = useState("");
  const [drawingUploadFiles, setDrawingUploadFiles] = useState([]); // [{file, partNumber, skip}]
  const [drawingUploadBusy, setDrawingUploadBusy] = useState(false);
  const [drawingUploadResult, setDrawingUploadResult] = useState(null);
  return { drawingSearchQuery, setDrawingSearchQuery, drawingSearchResults, setDrawingSearchResults,
    drawingCustomerFilter, setDrawingCustomerFilter, drawingSearchLoading, setDrawingSearchLoading,
    drawingSearchFailed, setDrawingSearchFailed, expandedDrawingHistory, setExpandedDrawingHistory,
    showDrawingUpload, setShowDrawingUpload, drawingUploadCustomer, setDrawingUploadCustomer,
    drawingUploadFiles, setDrawingUploadFiles, drawingUploadBusy, setDrawingUploadBusy, drawingUploadResult,
    setDrawingUploadResult };
}

export function useDrawings(deps) {
  const { drawingCustomerFilter, drawingSearchQuery, drawingUploadCustomer, drawingUploadFiles, fetchAllRows,
    items, roleLabel, setDrawingLookup, setDrawingSearchFailed, setDrawingSearchLoading,
    setDrawingSearchResults, setDrawingUploadBusy, setDrawingUploadCustomer, setDrawingUploadFiles,
    setDrawingUploadResult, setPreviewData, setPreviewItem, setPreviewLoading, setShowDrawingUpload } = deps;

  // ---- Drawing Management foundation ----
  // A real Postgres table + Storage bucket, not the JSON-blob pattern the
  // rest of the app uses — see setup-drawings.sql for why. Everything here
  // is plumbing for the upload flows and viewer built in later phases;
  // nothing calls these yet.

  async function uploadDrawingFile(file, partNumber, revisionNumber) {
    if (!supabase) return null;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${partNumber}/rev${revisionNumber}-${safeName}`;
    const { error } = await supabase.storage.from("drawings").upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  }

  async function getDrawingSignedUrl(storagePath) {
    if (!supabase) return null;
    // Valid for an hour — plenty for viewing one drawing, short enough that
    // a link doesn't stay usable indefinitely if it ever leaked.
    const { data, error } = await supabase.storage.from("drawings").createSignedUrl(storagePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  }

  async function getNextInternalRevision(partNumber) {
    if (!supabase) return 1;
    const { data, error } = await supabase
      .from("drawings")
      .select("internal_revision")
      .eq("part_number", partNumber)
      .order("internal_revision", { ascending: false })
      .limit(1);
    if (error) throw error;
    return data && data.length ? data[0].internal_revision + 1 : 1;
  }

  async function supersedeOldRevisions(partNumber) {
    if (!supabase) return;
    const { error } = await supabase
      .from("drawings")
      .update({ status: "superseded" })
      .eq("part_number", partNumber)
      .eq("status", "current");
    if (error) throw error;
  }

  // The one function later phases actually call to record a new drawing —
  // handles superseding the old "current" revision and working out the next
  // internal revision number automatically, so callers don't have to.
  async function insertDrawingRecord({ partNumber, customer, customerRevision, storagePath, fileName, linkedItemId, description, price }) {
    if (!supabase) return null;
    const nextRevision = await getNextInternalRevision(partNumber);
    await supersedeOldRevisions(partNumber);
    const { data, error } = await supabase
      .from("drawings")
      .insert({
        part_number: partNumber,
        customer: customer || null,
        internal_revision: nextRevision,
        customer_revision: customerRevision || null,
        storage_path: storagePath,
        file_name: fileName,
        status: "current",
        linked_item_id: linkedItemId || null,
        description: description || null,
        price: price != null ? price : null,
        uploaded_by: roleLabel,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ---- Drawings tab: search, view, and bulk upload ----

  async function refreshDrawings(query, customer) {
    if (!supabase) {
      setDrawingSearchResults([]);
      return;
    }
    // Nothing is listed until a customer is picked or something is typed
    // (Heinrich, 18 Sep 2026): the whole table, every revision of every
    // part, was the load that grows without end.
    const term = (query || "").trim().replace(/[%,]/g, "");
    if (!term && !customer) {
      setDrawingSearchResults([]);
      setDrawingSearchFailed(false);
      return;
    }
    setDrawingSearchLoading(true);
    try {
      // In pages, by id: one customer can pass the 1000 rows a single
      // request stops at. The order for the screen is put back below.
      const data = await fetchAllRows("drawings", {
        filter: (q) => {
          if (term) q = q.or(`part_number.ilike.%${term}%,description.ilike.%${term}%`);
          if (customer === "__internal__") q = q.is("customer", null);
          else if (customer) q = q.eq("customer", customer);
          return q;
        },
      });
      data.sort(
        (a, b) =>
          String(a.part_number).localeCompare(String(b.part_number), undefined, { numeric: true, sensitivity: "base" }) ||
          b.internal_revision - a.internal_revision
      );
      // Group by part number so each part shows its current revision plus
      // any older ones tucked away in a collapsible history.
      const grouped = {};
      (data || []).forEach((d) => {
        if (!grouped[d.part_number]) grouped[d.part_number] = [];
        grouped[d.part_number].push(d);
      });
      setDrawingSearchResults(Object.entries(grouped));
      setDrawingSearchFailed(false);
    } catch (err) {
      console.error("Loading drawings failed:", err);
      setDrawingSearchResults([]);
      setDrawingSearchFailed(true);
    }
    setDrawingSearchLoading(false);
  }

  // A lightweight lookup of every current drawing's part number → description,
  // loaded once so any item row anywhere can instantly check "does this part
  // have a drawing on file" without a query per row.
  async function loadDrawingLookup() {
    if (!supabase) return;
    try {
      // In pages: past 1000 current drawings a single request would leave
      // parts off, and their rows would lose the drawing button.
      const data = await fetchAllRows("drawings", {
        select: "id, part_number, description, internal_revision, customer_revision",
        filter: (q) => q.eq("status", "current"),
      });
      const map = {};
      (data || []).forEach((d) => {
        map[d.part_number.trim()] = {
          id: d.id,
          description: d.description,
          internalRevision: d.internal_revision,
          customerRevision: d.customer_revision,
        };
      });
      setDrawingLookup(map);
    } catch (err) {
      console.error("Failed to load drawing lookup:", err);
    }
  }

  async function openDrawingPreviewByPartNumber(partNumber) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("drawings")
        .select("*")
        .eq("part_number", partNumber.trim())
        .eq("status", "current")
        .maybeSingle();
      if (error) throw error;
      // No row is a real answer -- there is no drawing for this part --
      // and saying so beats a button that appears to do nothing.
      if (data) openDrawingPreview(data);
      else alert(`No drawing on file for ${partNumber.trim()}.`);
    } catch (err) {
      console.error("Couldn't open drawing:", err);
      alert("Couldn't open that drawing — check your signal and try again.");
    }
  }

  async function deleteDrawing(drawing) {
    if (!supabase) return;
    const ok = window.confirm(
      `Delete this drawing permanently?\n\n${drawing.part_number} — ${
        drawing.customer_revision ? `Rev ${drawing.customer_revision}` : `Rev ${drawing.internal_revision}`
      }\n\nThis removes the actual file too — it can't be undone.`
    );
    if (!ok) return;
    try {
      await supabase.storage.from("drawings").remove([drawing.storage_path]);
      const { error } = await supabase.from("drawings").delete().eq("id", drawing.id);
      if (error) throw error;
      // The current revision gone, the newest one left becomes current, as
      // it was before that upload (7 Oct 2026: it used to stay superseded,
      // leaving the part with no current drawing).
      if (drawing.status === "current") {
        const { data: left, error: leftError } = await supabase
          .from("drawings")
          .select("id")
          .eq("part_number", drawing.part_number)
          .order("internal_revision", { ascending: false })
          .limit(1);
        if (leftError) throw leftError;
        if (left && left.length) {
          const { data: made, error: makeError } = await supabase
            .from("drawings")
            .update({ status: "current" })
            .eq("id", left[0].id)
            .select("id");
          if (makeError) throw makeError;
          if (!made || !made.length) console.warn("The older revision could not be made current:", left[0].id);
        }
      }
      refreshDrawings(drawingSearchQuery, drawingCustomerFilter);
    } catch (err) {
      console.error("Failed to delete drawing:", err);
      alert("Couldn't delete that drawing — check your connection and try again.");
    }
  }

  // A targeted way to clear out one customer's drawings (and every revision
  // of each) before a fresh re-upload — scoped to whichever customer is
  // currently filtered to, never a blanket wipe of everyone's drawings.
  async function batchDeleteDrawingsForCustomer(customer) {
    if (!supabase) return;
    try {
      // Listed in pages, so the count in the question below is the real one.
      const data = await fetchAllRows("drawings", {
        select: "id, storage_path",
        filter: (q) => (customer === "__internal__" ? q.is("customer", null) : q.eq("customer", customer)),
      });
      if (!data || data.length === 0) {
        alert(`No drawings found for ${customer === "__internal__" ? "internal drawings" : customer}.`);
        return;
      }
      const ok = window.confirm(
        `Delete all ${data.length} drawing${data.length === 1 ? "" : "s"} for ${
          customer === "__internal__" ? "internal drawings" : customer
        }? This permanently removes the files too — can't be undone.`
      );
      if (!ok) return;
      // Files and their rows go together, 200 at a time, and only the rows
      // that were listed: deleting "everything for this customer" in one
      // sweep took rows whose files had never been listed, and left those
      // files behind in storage with nothing pointing at them.
      for (let i = 0; i < data.length; i += 200) {
        const batch = data.slice(i, i + 200);
        const paths = batch.map((d) => d.storage_path).filter(Boolean);
        if (paths.length) {
          const { error: fileError } = await supabase.storage.from("drawings").remove(paths);
          if (fileError) throw fileError;
        }
        const { error: delError } = await supabase.from("drawings").delete().in("id", batch.map((d) => d.id));
        if (delError) throw delError;
      }
      refreshDrawings(drawingSearchQuery, drawingCustomerFilter);
    } catch (err) {
      console.error("Failed to batch delete drawings:", err);
      alert("Couldn't delete all of those drawings — check your connection and try again. The list shows what is left.");
      refreshDrawings(drawingSearchQuery, drawingCustomerFilter);
    }
  }

  async function openDrawingPreview(drawing) {
    setPreviewItem({ id: drawing.id, attachmentType: "pdf", attachmentName: drawing.file_name, restrictDownload: true });
    setPreviewData(null);
    setPreviewLoading(true);
    try {
      const url = await getDrawingSignedUrl(drawing.storage_path);
      setPreviewData(url);
    } catch (err) {
      console.error("Couldn't open drawing:", err);
      setPreviewData(null);
    }
    setPreviewLoading(false);
  }

  function handleDrawingFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    const entries = files
      .filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
      .map((f) => {
        const partNumber = f.name.replace(/\.pdf$/i, "").trim();
        const matchedItem = (items || []).find(
          (it) =>
            it.mainCat === "custom" &&
            (it.partNumber || "").toLowerCase() === partNumber.toLowerCase() &&
            (it.customer || "") === (drawingUploadCustomer || "")
        );
        // The "must already exist in Customer Stock" rule only applies when
        // a customer is selected — an internal drawing (no customer chosen)
        // isn't expected to already have a matching item, so it's never
        // auto-skipped just for not matching one.
        const requiresMatch = !!drawingUploadCustomer;
        return {
          file: f,
          partNumber,
          skip: requiresMatch && !matchedItem,
          matchedStockCode: matchedItem ? { description: matchedItem.name } : null,
        };
      });
    setDrawingUploadFiles(entries);
    setDrawingUploadResult(null);
    e.target.value = "";
  }

  function removeDrawingUploadFile(idx) {
    setDrawingUploadFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submitDrawingUpload() {
    const validFiles = drawingUploadFiles.filter((f) => f.partNumber && !f.skip);
    if (validFiles.length === 0) return;
    setDrawingUploadBusy(true);
    let succeeded = 0;
    let failed = 0;
    for (const entry of validFiles) {
      try {
        const nextRevision = await getNextInternalRevision(entry.partNumber);
        const path = await uploadDrawingFile(entry.file, entry.partNumber, nextRevision);
        await insertDrawingRecord({
          partNumber: entry.partNumber,
          customer: entry.matchedStockCode?.customer || drawingUploadCustomer || null,
          customerRevision: null,
          storagePath: path,
          fileName: entry.file.name,
          // If this part number already exists in Stock Codes, link to it
          // and carry its description/price through — never creates or
          // changes anything in Stock Codes itself, only reads from it.
          linkedItemId: entry.matchedStockCode?.id || null,
          description: entry.matchedStockCode?.description || null,
          price: entry.matchedStockCode?.price ?? null,
        });
        succeeded++;
      } catch (err) {
        console.error(`Failed to upload drawing for ${entry.partNumber}:`, err);
        failed++;
      }
    }
    setDrawingUploadBusy(false);
    setDrawingUploadResult({ succeeded, failed });
    setDrawingUploadFiles([]);
  }

  function closeDrawingUpload() {
    setShowDrawingUpload(false);
    setDrawingUploadFiles([]);
    setDrawingUploadResult(null);
    setDrawingUploadCustomer("");
  }

  return { batchDeleteDrawingsForCustomer, closeDrawingUpload, deleteDrawing, handleDrawingFilesSelected,
    loadDrawingLookup, openDrawingPreview, openDrawingPreviewByPartNumber, refreshDrawings,
    removeDrawingUploadFile, submitDrawingUpload };
}
