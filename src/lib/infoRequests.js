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

// An answered or cleared request stays on the operator's card this long,
// so the answer is there to read when they next open it.
export const RECENT_DAYS = 3;
const DAY_MS = 86400000;

// Every read brings the job's sales rep and customer along, so the banner
// can tell whose request it is without the Jobs list having been loaded.
const SELECT = "*, job:jobs(sales_rep, customer)";

export const isOpen = (req) => req?.status === "open";
const isRecentlyClosed = (req, now) => !isOpen(req) && Date.parse(req?.closed_at || "") >= now - RECENT_DAYS * DAY_MS;
const sameName = (a, b) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();

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

// Answered or cleared in the last RECENT_DAYS, by stage, newest first:
// what the operator reads on the card once the red has gone.
export function recentAnswersByProcess(list, now = Date.now()) {
  const map = {};
  for (const r of list || []) {
    if (!r.process_id || !isRecentlyClosed(r, now)) continue;
    (map[r.process_id] ||= []).push(r);
  }
  for (const k of Object.keys(map)) map[k].sort((a, b) => Date.parse(b.closed_at) - Date.parse(a.closed_at));
  return map;
}

// The banner: open requests on the jobs this person sells, and every open
// request for an admin -- which also covers a job with no rep, or a rep
// who does not use the app. (Decided 14 Sep 2026.) Oldest first, as held.
export function requestsForOffice(list, { isAdmin, me }) {
  return (list || []).filter((r) => isOpen(r) && (isAdmin || (r.job?.sales_rep && sameName(r.job.sales_rep, me))));
}

// Folds a refresh into what is held. Open ones stay; answered and cleared
// ones stay for RECENT_DAYS so the card can show the answer, then drop.
// Oldest first, because the one standing longest is the one to answer.
export function mergeInfoRequests(held, arrived, now = Date.now()) {
  const byId = new Map((held || []).map((r) => [r.id, r]));
  for (const r of arrived || []) byId.set(r.id, r);
  return [...byId.values()]
    .filter((r) => isOpen(r) || isRecentlyClosed(r, now))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

// Who is told when a request is raised. The job's sales rep, matched to a
// person who signs in by the name the app shows for them (their name, or
// their email when they have none -- the same as roleLabel). When the job
// has no rep, or the rep does not use the app, every admin.
export function infoRequestRecipients(salesRep, profiles) {
  const rep = (salesRep || "").trim();
  const reps = rep ? (profiles || []).filter((p) => sameName(p.name || p.email, rep)) : [];
  if (reps.length) return reps.map((p) => p.id);
  return (profiles || []).filter((p) => p.is_admin).map((p) => p.id);
}

// ---- Database ----

// First load: the open ones and those closed in the last RECENT_DAYS.
// After that only what changed since the newest row held. Never the whole
// table on a timer (Supabase egress, CLAUDE.md).
export async function loadInfoRequests(db, since, now = Date.now()) {
  const base = () => db.from("job_info_requests").select(SELECT);
  if (since) {
    const { data, error } = await base().gte("updated_at", since);
    if (error) throw error;
    return data || [];
  }
  const recent = new Date(now - RECENT_DAYS * DAY_MS).toISOString();
  const [open, closed] = await Promise.all([base().eq("status", "open"), base().gte("closed_at", recent)]);
  if (open.error) throw open.error;
  if (closed.error) throw closed.error;
  return [...(open.data || []), ...(closed.data || [])];
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
    .select(SELECT)
    .single();
  if (error) throw error;
  return data;
}

// Both close an open request and return the changed row, or null when
// nothing changed: somebody else answered or cleared it first. Only an
// open one is touched, so neither can overwrite the other.
async function closeInfoRequest(db, req, fields) {
  const { data, error } = await db
    .from("job_info_requests")
    .update({ ...fields, closed_at: new Date().toISOString() })
    .eq("id", req.id)
    .eq("status", "open")
    .select(SELECT);
  if (error) throw error;
  return data?.[0] || null;
}

export function clearInfoRequest(db, req, { by, byId }) {
  return closeInfoRequest(db, req, { status: "cleared", closed_by: by, closed_by_id: byId || null });
}

export function answerInfoRequest(db, req, { answer, by, byId }) {
  return closeInfoRequest(db, req, { status: "answered", answer, closed_by: by, closed_by_id: byId || null });
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
