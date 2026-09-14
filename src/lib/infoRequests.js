// Info Request: the floor saying a job is standing until the office
// answers -- a drawing, a dimension, a material. One row per request in
// job_info_requests (setup-info-requests.sql): open, then answered (the
// office replied) or cleared (the operator sorted it). Rows are never
// deleted, so the printed Job History can list every one.
//
// It is a warning only. A standing stage can still be ticked; nothing here
// feeds blockingStages. (Decided 14 Sep 2026.)
//
// The database calls take the client as their first argument, so the
// rules below can be tested with no database: npm test.

export const INFO_REQUEST_KINDS = ["Drawing", "Dimension", "Material", "Quantity", "Customer answer", "Other"];

export const isOpen = (req) => req?.status === "open";

// How long the job has been standing, in words for a card: minutes, then
// hours and minutes, then days. No colour change with age, by decision --
// the time itself is the warning.
export function standingFor(req, now = Date.now()) {
  const t = Date.parse(req?.created_at || "");
  if (!t) return "";
  const mins = Math.max(0, Math.floor((now - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(mins / 1440);
  return d === 1 ? "1 day" : `${d} days`;
}

// Open requests by the stage they were raised on. A request whose stage
// was later taken off the job keeps no process_id, so it shows on the job
// rather than on any Production card.
export function openRequestsByProcess(list) {
  const map = {};
  for (const r of list || []) {
    if (!isOpen(r) || !r.process_id) continue;
    (map[r.process_id] ||= []).push(r);
  }
  return map;
}

// Folds a refresh into what is held. A request answered or cleared on
// another screen arrives as a changed row and drops out; oldest first,
// because the one standing longest is the one to answer first.
export function mergeInfoRequests(held, arrived) {
  const byId = new Map((held || []).map((r) => [r.id, r]));
  for (const r of arrived || []) byId.set(r.id, r);
  return [...byId.values()].filter(isOpen).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

// Who is told. The job's sales rep, matched to a person who signs in by
// the name the app shows for them (their name, or their email when they
// have none -- the same as roleLabel). When the job has no rep, or the
// rep does not use the app, every admin. (Decided 14 Sep 2026.)
export function infoRequestRecipients(salesRep, profiles) {
  const rep = (salesRep || "").trim().toLowerCase();
  const label = (p) => (p.name || p.email || "").trim().toLowerCase();
  const reps = rep ? (profiles || []).filter((p) => label(p) === rep) : [];
  if (reps.length) return reps.map((p) => p.id);
  return (profiles || []).filter((p) => p.is_admin).map((p) => p.id);
}

// ---- Database ----

// First load: the open ones. After that only what changed since the
// newest row held, answered and cleared included, so they can drop out.
// Never the whole table on a timer (Supabase egress, CLAUDE.md).
export async function loadInfoRequests(db, since) {
  let q = db.from("job_info_requests").select("*");
  q = since ? q.gte("updated_at", since) : q.eq("status", "open");
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function raiseInfoRequest(db, { job, process, kind, note, photoPath, photoName, by, byId }) {
  const { data, error } = await db
    .from("job_info_requests")
    .insert({
      job_id: job.id,
      process_id: process.id,
      job_number: job.job_number || "",
      stage_name: process.process_name || "",
      kind,
      note,
      photo_path: photoPath || "",
      photo_name: photoName || "",
      raised_by: by,
      raised_by_id: byId || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Returns the changed row, or null when nothing changed: somebody else
// answered or cleared it first. Only an open one is touched, so a clear
// can never overwrite an answer.
export async function clearInfoRequest(db, req, { by, byId }) {
  const { data, error } = await db
    .from("job_info_requests")
    .update({ status: "cleared", closed_by: by, closed_by_id: byId || null, closed_at: new Date().toISOString() })
    .eq("id", req.id)
    .eq("status", "open")
    .select();
  if (error) throw error;
  return data?.[0] || null;
}

// Fetched when a request is raised rather than read from the app's people
// list, which a floor operator's screen may never have loaded.
export async function loadRecipientProfiles(db) {
  const { data, error } = await db.from("profiles").select("id, name, email, is_admin");
  if (error) throw error;
  return data || [];
}

// Beside the job's files in the job-documents bucket, like a shortage
// photo, and likewise not listed among the job's paperwork.
export async function uploadInfoRequestPhoto(db, jobId, file) {
  const safeName = (file.name || "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${jobId}/info-requests/${Date.now()}-${safeName}`;
  const { error } = await db.storage.from("job-documents").upload(path, file);
  if (error) throw error;
  return path;
}
