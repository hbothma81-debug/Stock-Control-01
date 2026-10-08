// Getting programs out of the app: Download (to the browser's downloads)
// and Copy to USB (straight onto a stick, where the browser can write to a
// folder: Chrome and Edge on a computer). Heinrich, 8 Oct 2026: nothing
// special is needed for the machine, and a Download button besides.
//
// The folder picked for Copy to USB is remembered on the device (the
// browser keeps it in IndexedDB), so the next press writes to the same
// place with one "Allow" at most. Nothing here touches the database.

const DB = "stk-cnc";
const STORE = "handles";
const KEY = "usbFolder";

// Each file as a download. Several files in a row may make the browser
// ask once whether this page may download more than one file.
export function downloadFiles(files) {
  for (const f of files) {
    const url = URL.createObjectURL(new Blob([f.text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

// Whether this browser can write to a folder the person picks.
export function canWriteToFolder() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function remembered() {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function remember(handle) {
  try {
    const db = await openDb();
    db.transaction(STORE, "readwrite").objectStore(STORE).put(handle, KEY);
  } catch {
    // Not remembered: the next press asks for the folder again.
  }
}

async function writeAll(folder, files) {
  for (const f of files) {
    const handle = await folder.getFileHandle(f.name, { create: true });
    const w = await handle.createWritable();
    await w.write(f.text);
    await w.close();
  }
}

// Copy the files into the remembered folder, or a newly picked one when
// there is none, it was refused, or it has gone (the stick was taken out).
// pickNew forces the picker ("another folder"). Answers the folder's name,
// or null when the person closed the picker. Must start from a click.
export async function copyToFolder(files, { pickNew = false } = {}) {
  let folder = pickNew ? null : await remembered();
  if (folder) {
    try {
      let ok = (await folder.queryPermission({ mode: "readwrite" })) === "granted";
      if (!ok) ok = (await folder.requestPermission({ mode: "readwrite" })) === "granted";
      if (ok) {
        await writeAll(folder, files);
        return folder.name;
      }
    } catch {
      // Gone or refused: pick again below.
    }
  }
  try {
    folder = await window.showDirectoryPicker({ id: "cnc-usb", mode: "readwrite" });
  } catch (err) {
    if (err?.name === "AbortError") return null;
    throw err;
  }
  await writeAll(folder, files);
  await remember(folder);
  return folder.name;
}
