import { supabase } from "./supabaseClient.js";

// "shared" data (the stock list, master data, requisitions) is the same for
// everyone using the app — it goes to Supabase so every device sees the same
// thing in real time-ish. "Personal" data (which role this browser last
// logged in as) is inherently per-device, so it just stays in localStorage
// regardless of whether Supabase is configured.
function localGet(prefix, key) {
  const v = localStorage.getItem(prefix + key);
  return v ? { key, value: v } : null;
}
function localSet(prefix, key, value) {
  localStorage.setItem(prefix + key, value);
  return { key, value };
}
function localDelete(prefix, key) {
  localStorage.removeItem(prefix + key);
  return { key, deleted: true };
}

export function installStorage() {
  if (typeof window === "undefined") return;

  window.storage = {
    async get(key, shared = true) {
      if (!shared) return localGet("local:", key);
      if (!supabase) return localGet("mock:", key);
      const { data, error } = await supabase.from("app_storage").select("value").eq("key", key).maybeSingle();
      if (error) throw error;
      return data ? { key, value: data.value, shared } : null;
    },

    async set(key, value, shared = true) {
      if (!shared) return localSet("local:", key, value);
      if (!supabase) return localSet("mock:", key, value);
      const { error } = await supabase.from("app_storage").upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) throw error;
      return { key, value, shared };
    },

    async delete(key, shared = true) {
      if (!shared) return localDelete("local:", key);
      if (!supabase) return localDelete("mock:", key);
      const { error } = await supabase.from("app_storage").delete().eq("key", key);
      if (error) throw error;
      return { key, deleted: true, shared };
    },

    async list(prefix, shared = true) {
      if (!shared || !supabase) return { keys: [], prefix, shared };
      let query = supabase.from("app_storage").select("key");
      if (prefix) query = query.like("key", `${prefix}%`);
      const { data, error } = await query;
      if (error) throw error;
      return { keys: (data || []).map((r) => r.key), prefix, shared };
    },
  };
}
