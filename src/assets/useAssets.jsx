// Assets: maintenance history, the repair list, Service now, service status
// and removing an asset.
//
// Moved word for word out of App.jsx on 2026-10-07; see docs/SPLIT-DRAWINGS-ASSETS-PLAN.md.
// useAssetsState() holds the pop-ups' state and runs where that state was
// declared. useAssets() holds the functions and runs below App's
// permissions block, because it reads isAdmin; it takes everything it
// borrows from the rest of the app in one deps object. The asset rows in
// the stock list and the manufacturer and asset views stay in App.jsx and
// move with Stock.

import { useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

export function useAssetsState() {
  const [assetRemoveModal, setAssetRemoveModal] = useState(null); // { item, reason, date }
  const [assetHistoryItem, setAssetHistoryItem] = useState(null);
  const [assetHistoryEntries, setAssetHistoryEntries] = useState(null);
  const [assetHistoryNote, setAssetHistoryNote] = useState("");
  const [assetHistoryFile, setAssetHistoryFile] = useState(null);
  const [assetHistoryReading, setAssetHistoryReading] = useState("");
  const [assetHistoryBusy, setAssetHistoryBusy] = useState(false);
  const [serviceNowItem, setServiceNowItem] = useState(null);
  const [serviceNowConsumableSearch, setServiceNowConsumableSearch] = useState("");
  const [serviceNowCustomName, setServiceNowCustomName] = useState("");
  const [serviceNowCustomQty, setServiceNowCustomQty] = useState("");
  const [serviceNowReading, setServiceNowReading] = useState("");
  const [serviceNowFile, setServiceNowFile] = useState(null);
  const [serviceNowNote, setServiceNowNote] = useState("");
  const [serviceNowBusy, setServiceNowBusy] = useState(false);
  const [repairListItem, setRepairListItem] = useState(null);
  const [repairListEntries, setRepairListEntries] = useState(null);
  const [repairListFailed, setRepairListFailed] = useState(false);
  const [repairListDescription, setRepairListDescription] = useState("");
  const [repairListBusy, setRepairListBusy] = useState(false);
  const [repairListResolvedOpen, setRepairListResolvedOpen] = useState(false);
  return { assetRemoveModal, setAssetRemoveModal, assetHistoryItem, setAssetHistoryItem, assetHistoryEntries,
    setAssetHistoryEntries, assetHistoryNote, setAssetHistoryNote, assetHistoryFile, setAssetHistoryFile,
    assetHistoryReading, setAssetHistoryReading, assetHistoryBusy, setAssetHistoryBusy, serviceNowItem,
    setServiceNowItem, serviceNowConsumableSearch, setServiceNowConsumableSearch, serviceNowCustomName,
    setServiceNowCustomName, serviceNowCustomQty, setServiceNowCustomQty, serviceNowReading,
    setServiceNowReading, serviceNowFile, setServiceNowFile, serviceNowNote, setServiceNowNote,
    serviceNowBusy, setServiceNowBusy, repairListItem, setRepairListItem, repairListEntries,
    setRepairListEntries, repairListFailed, setRepairListFailed, repairListDescription,
    setRepairListDescription, repairListBusy, setRepairListBusy, repairListResolvedOpen,
    setRepairListResolvedOpen };
}

export function useAssets(deps) {
  const { assetHistoryFile, assetHistoryItem, assetHistoryNote, assetHistoryReading, assetRemoveModal,
    emptyForm, repairListDescription, repairListItem, roleLabel, serviceNowConsumables, serviceNowCustomName,
    serviceNowCustomQty, serviceNowFile, serviceNowItem, serviceNowNote, serviceNowReading,
    setAddingServiceConsumableQty, setAllowDuplicate, setAssetHistoryBusy, setAssetHistoryEntries,
    setAssetHistoryFile, setAssetHistoryItem, setAssetHistoryNote, setAssetHistoryReading,
    setAssetRemoveModal, setEditingId, setForm, setItems, setPreviewData, setPreviewItem, setPreviewLoading,
    setRepairListBusy, setRepairListDescription, setRepairListEntries, setRepairListFailed, setRepairListItem,
    setRepairListResolvedOpen, setServiceNowBusy, setServiceNowConsumableSearch, setServiceNowConsumables,
    setServiceNowCustomName, setServiceNowCustomQty, setServiceNowFile, setServiceNowItem, setServiceNowNote,
    setServiceNowReading, setShowAdd, setUsageLog, uid } = deps;

  // ---- Asset maintenance history ----

  async function fetchAssetHistory(itemId) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("asset_history")
      .select("*")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function uploadAssetAttachment(file, itemId) {
    if (!supabase) return null;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${itemId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("asset-attachments").upload(path, file);
    if (error) throw error;
    return path;
  }

  async function getAssetAttachmentUrl(path) {
    if (!supabase) return null;
    const { data, error } = await supabase.storage.from("asset-attachments").createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  }

  async function addAssetHistoryEntry({ itemId, entryType, note, reading, attachmentFile, serviceMode, consumables }) {
    if (!supabase) return;
    let attachmentPath = null;
    let attachmentName = null;
    if (attachmentFile) {
      attachmentPath = await uploadAssetAttachment(attachmentFile, itemId);
      attachmentName = attachmentFile.name;
    }
    const row = {
      item_id: itemId,
      entry_type: entryType,
      note: note || null,
      hours_reading: entryType === "meter_reading" && serviceMode === "hours" ? reading : null,
      km_reading: entryType === "meter_reading" && serviceMode === "km" ? reading : null,
      attachment_path: attachmentPath,
      attachment_name: attachmentName,
      logged_by: roleLabel,
      consumables: consumables && consumables.length ? consumables : null,
    };
    const { error } = await supabase.from("asset_history").insert(row);
    if (error) throw error;
    // A logged reading is also the asset's new "current" reading, used for
    // the service-due calculation.
    if (entryType === "meter_reading") {
      setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, currentReading: reading } : it)));
    }
  }

  async function deleteAssetHistoryEntry(entry) {
    if (!supabase) return;
    const ok = window.confirm("Delete this history entry permanently? This can't be undone.");
    if (!ok) return;
    try {
      if (entry.attachment_path) await supabase.storage.from("asset-attachments").remove([entry.attachment_path]);
      const { error } = await supabase.from("asset_history").delete().eq("id", entry.id);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error("Failed to delete history entry:", err);
      alert("Couldn't delete that entry — check your connection and try again.");
      return false;
    }
  }

  // ---- Asset repair list — per-asset, open/resolved, separate from the
  // permanent History log above ----

  async function fetchAssetRepairs(itemId) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("asset_repairs")
      .select("*")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function openRepairList(item) {
    setRepairListItem(item);
    setRepairListEntries(null);
    setRepairListDescription("");
    setRepairListResolvedOpen(false);
    setRepairListFailed(false);
    try {
      setRepairListEntries(await fetchAssetRepairs(item.id));
    } catch (err) {
      console.error("Failed to load repair list:", err);
      setRepairListEntries([]);
      setRepairListFailed(true);
    }
  }

  function closeRepairList() {
    setRepairListItem(null);
    setRepairListEntries(null);
    setRepairListDescription("");
  }

  async function refreshRepairList() {
    if (!repairListItem) return;
    try {
      setRepairListEntries(await fetchAssetRepairs(repairListItem.id));
    } catch (err) {
      console.error("Failed to refresh repair list:", err);
    }
  }

  async function submitRepairEntry(e) {
    e.preventDefault();
    if (!repairListDescription.trim()) return;
    setRepairListBusy(true);
    try {
      const { error } = await supabase.from("asset_repairs").insert({
        item_id: repairListItem.id,
        description: repairListDescription.trim(),
        status: "open",
        logged_by: roleLabel,
      });
      if (error) throw error;
      setRepairListDescription("");
      await refreshRepairList();
    } catch (err) {
      console.error("Failed to add repair entry:", err);
      alert("Couldn't save that — check your connection and try again.");
    }
    setRepairListBusy(false);
  }

  async function resolveRepairEntry(entry) {
    try {
      const { error } = await supabase
        .from("asset_repairs")
        .update({ status: "resolved", resolved_by: roleLabel, resolved_at: new Date().toISOString() })
        .eq("id", entry.id);
      if (error) throw error;
      await refreshRepairList();
    } catch (err) {
      console.error("Failed to resolve repair entry:", err);
      alert("Couldn't save that — check your connection and try again.");
    }
  }

  async function deleteRepairEntry(entry) {
    const ok = window.confirm("Delete this repair note permanently? This can't be undone.");
    if (!ok) return;
    try {
      const { error } = await supabase.from("asset_repairs").delete().eq("id", entry.id);
      if (error) throw error;
      await refreshRepairList();
    } catch (err) {
      console.error("Failed to delete repair entry:", err);
      alert("Couldn't delete that — check your connection and try again.");
    }
  }

  // ---- "Service now" — records a completed service, deducts any Stores
  // consumables used from real stock, and advances the service interval ----

  function openServiceNow(item) {
    setServiceNowItem(item);
    setServiceNowConsumables([]);
    setServiceNowConsumableSearch("");
    setServiceNowCustomName("");
    setServiceNowCustomQty("");
    setServiceNowReading(String(item.currentReading || ""));
    setServiceNowFile(null);
    setServiceNowNote("");
  }

  function closeServiceNow() {
    setServiceNowItem(null);
    setServiceNowConsumables([]);
    setServiceNowConsumableSearch("");
    setServiceNowCustomName("");
    setServiceNowCustomQty("");
    setServiceNowReading("");
    setServiceNowFile(null);
    setServiceNowNote("");
    setAddingServiceConsumableQty(null);
  }

  function addServiceConsumableFromStores(it) {
    setServiceNowConsumables((prev) => [
      ...prev,
      { source: "stores", itemId: it.id, name: it.name, qty: "1", unit: it.unit || "" },
    ]);
    setServiceNowConsumableSearch("");
  }

  function addServiceConsumableCustom() {
    const name = serviceNowCustomName.trim();
    if (!name) return;
    // Opens the real Add Item form, pre-filled for Stores — not the
    // current tab, since servicing an asset happens from the Assets tab.
    // On successful save, this new item gets linked into the consumables
    // list as a real, stock-deducting entry rather than a throwaway note.
    setAddingServiceConsumableQty(serviceNowCustomQty.trim() || "1");
    setForm({ ...emptyForm, id: uid(), mainCat: "stores", name });
    setEditingId(null);
    setAllowDuplicate(false);
    setShowAdd(true);
    setServiceNowCustomName("");
    setServiceNowCustomQty("");
  }

  function updateServiceConsumableQty(idx, qty) {
    setServiceNowConsumables((prev) => prev.map((c, i) => (i === idx ? { ...c, qty } : c)));
  }

  function removeServiceConsumable(idx) {
    setServiceNowConsumables((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submitServiceNow(e) {
    e.preventDefault();
    if (!serviceNowItem) return;
    setServiceNowBusy(true);
    try {
      const item = serviceNowItem;
      const nowIso = new Date().toISOString();

      // Deduct real stock for every Stores consumable used — same effect
      // as a normal "Use" action, logged the same way, for the same
      // reason: this is genuine stock leaving the shelf, not just a note.
      const storesUsed = serviceNowConsumables.filter((c) => c.source === "stores");
      if (storesUsed.length > 0) {
        setItems((prev) =>
          prev.map((it) => {
            const used = storesUsed.find((c) => c.itemId === it.id);
            return used ? { ...it, qty: Math.max(0, Number(it.qty) - (Number(used.qty) || 0)) } : it;
          })
        );
        setUsageLog((prev) => [
          ...prev,
          ...storesUsed.map((c) => ({
            id: uid(),
            itemId: c.itemId,
            itemName: c.name,
            mainCat: "stores",
            qty: Number(c.qty) || 0,
            direction: "use",
            by: roleLabel,
            jobNumber: "",
            customer: "",
            note: `Used servicing ${item.name} (${item.partNumber || "no part number"})`,
            lineCost: 0,
            timestamp: nowIso,
          })),
        ]);
      }

      // Log the service itself as a history entry, carrying the full
      // consumables list (Stores and custom together) and any document.
      await addAssetHistoryEntry({
        itemId: item.id,
        entryType: "service",
        note: serviceNowNote.trim(),
        attachmentFile: serviceNowFile,
        consumables: serviceNowConsumables,
      });

      // Advance the service interval — by-date resets the last-serviced
      // date to now; by-hours/km takes the reading entered here as the new
      // baseline the next interval counts from.
      const reading = parseFloat(serviceNowReading);
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== item.id) return it;
          if (it.serviceMode === "months") return { ...it, lastServiceDate: nowIso.slice(0, 10) };
          if ((it.serviceMode === "hours" || it.serviceMode === "km") && !isNaN(reading)) {
            return { ...it, lastServiceReading: reading, currentReading: reading };
          }
          return it;
        })
      );

      closeServiceNow();
    } catch (err) {
      console.error("Failed to record service:", err);
      alert("Couldn't save that — check your connection and try again.");
    }
    setServiceNowBusy(false);
  }

  // Whether an asset is overdue or approaching its next service, based on
  // whichever tracking mode it uses. Returns null if service tracking isn't
  // set up for this asset at all.
  function getServiceStatus(item) {
    if (!item.serviceMode || item.serviceMode === "none") return null;
    if (item.serviceMode === "months") {
      if (!item.lastServiceDate || !item.serviceIntervalMonths) return null;
      const due = new Date(item.lastServiceDate);
      due.setMonth(due.getMonth() + Number(item.serviceIntervalMonths));
      const daysUntil = (due - new Date()) / (1000 * 60 * 60 * 24);
      if (daysUntil <= 0) return { level: "overdue", detail: `Overdue since ${due.toLocaleDateString()}` };
      if (daysUntil <= 14) return { level: "soon", detail: `Due ${due.toLocaleDateString()}` };
      return { level: "ok", detail: `Next due ${due.toLocaleDateString()}` };
    }
    const interval = item.serviceMode === "hours" ? item.serviceIntervalHours : item.serviceIntervalKm;
    if (!interval) return null;
    const unit = item.serviceMode === "hours" ? "hrs" : "km";
    const used = Number(item.currentReading || 0) - Number(item.lastServiceReading || 0);
    const remaining = interval - used;
    if (remaining <= 0) return { level: "overdue", detail: `${Math.abs(remaining)}${unit} over interval` };
    if (remaining <= interval * 0.1) return { level: "soon", detail: `${remaining}${unit} remaining` };
    return { level: "ok", detail: `${remaining}${unit} remaining` };
  }

  async function openAssetHistory(item) {
    setAssetHistoryItem(item);
    setAssetHistoryEntries(null);
    setAssetHistoryNote("");
    setAssetHistoryFile(null);
    setAssetHistoryReading(String(item.currentReading || ""));
    try {
      const entries = await fetchAssetHistory(item.id);
      setAssetHistoryEntries(entries);
    } catch (err) {
      console.error("Failed to load asset history:", err);
      setAssetHistoryEntries([]);
    }
  }

  function closeAssetHistory() {
    setAssetHistoryItem(null);
    setAssetHistoryEntries(null);
    setAssetHistoryNote("");
    setAssetHistoryFile(null);
    setAssetHistoryReading("");
  }

  async function refreshAssetHistoryEntries() {
    if (!assetHistoryItem) return;
    try {
      const entries = await fetchAssetHistory(assetHistoryItem.id);
      setAssetHistoryEntries(entries);
    } catch (err) {
      console.error("Failed to refresh asset history:", err);
    }
  }

  async function submitAssetNote(e) {
    e.preventDefault();
    if (!assetHistoryNote.trim() && !assetHistoryFile) return;
    setAssetHistoryBusy(true);
    try {
      await addAssetHistoryEntry({
        itemId: assetHistoryItem.id,
        entryType: "note",
        note: assetHistoryNote.trim(),
        attachmentFile: assetHistoryFile,
      });
      setAssetHistoryNote("");
      setAssetHistoryFile(null);
      await refreshAssetHistoryEntries();
    } catch (err) {
      console.error("Failed to add note:", err);
      alert("Couldn't save that note — check your connection and try again.");
    }
    setAssetHistoryBusy(false);
  }

  async function submitAssetReading(e) {
    e.preventDefault();
    const reading = parseFloat(assetHistoryReading);
    if (isNaN(reading) || reading < 0) return;
    setAssetHistoryBusy(true);
    try {
      await addAssetHistoryEntry({
        itemId: assetHistoryItem.id,
        entryType: "meter_reading",
        reading,
        serviceMode: assetHistoryItem.serviceMode,
      });
      setAssetHistoryItem((prev) => ({ ...prev, currentReading: reading }));
      await refreshAssetHistoryEntries();
    } catch (err) {
      console.error("Failed to log reading:", err);
      alert("Couldn't save that reading — check your connection and try again.");
    }
    setAssetHistoryBusy(false);
  }

  async function viewAssetAttachment(entry) {
    try {
      const url = await getAssetAttachmentUrl(entry.attachment_path);
      setPreviewItem({ id: entry.id, attachmentType: entry.attachment_name.toLowerCase().endsWith(".pdf") ? "pdf" : "image", attachmentName: entry.attachment_name });
      setPreviewData(url);
      setPreviewLoading(false);
    } catch (err) {
      console.error("Couldn't open attachment:", err);
    }
  }

  async function handleDeleteAssetHistoryEntry(entry) {
    const ok = await deleteAssetHistoryEntry(entry);
    if (ok) refreshAssetHistoryEntries();
  }

  function openAssetRemoveModal(item) {
    setAssetRemoveModal({ item, reason: "", date: new Date().toISOString().slice(0, 10) });
  }

  function closeAssetRemoveModal() {
    setAssetRemoveModal(null);
  }

  function submitAssetRemoveModal(e) {
    e.preventDefault();
    if (!assetRemoveModal.reason.trim()) return;
    const itemId = assetRemoveModal.item.id;
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? {
              ...it,
              status: "removed",
              removedReason: assetRemoveModal.reason.trim(),
              removedDate: assetRemoveModal.date,
              removedBy: roleLabel,
            }
          : it
      )
    );
    closeAssetRemoveModal();
  }

  return { addServiceConsumableCustom, addServiceConsumableFromStores, closeAssetHistory,
    closeAssetRemoveModal, closeRepairList, closeServiceNow, deleteRepairEntry, getServiceStatus,
    handleDeleteAssetHistoryEntry, openAssetHistory, openAssetRemoveModal, openRepairList, openServiceNow,
    removeServiceConsumable, resolveRepairEntry, submitAssetNote, submitAssetReading, submitAssetRemoveModal,
    submitRepairEntry, submitServiceNow, updateServiceConsumableQty, viewAssetAttachment };
}
