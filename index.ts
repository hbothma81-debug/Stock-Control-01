// Deploy with the Supabase CLI: supabase functions deploy delete-user
//
// This is the only safe place this can run. Deleting someone's actual
// login account requires Supabase's admin API, which needs the service
// role key — a credential that can never live in the app itself (this app
// has no backend of its own; it talks to Supabase directly from the
// browser). Embedding that key client-side would let anyone extract it
// from the app bundle and gain full admin access to the whole project,
// bypassing every permission check that exists. This function holds that
// key server-side, where it's actually safe, and the app calls this
// function remotely instead of ever touching the key itself.
//
// Deleting the auth.users row cascades to remove their profiles row too
// (profiles.id references auth.users(id) on delete cascade) — no separate
// delete needed for that part.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is required" }), { status: 400 });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const callerToken = authHeader.replace("Bearer ", "");
    if (!callerToken) {
      return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
    }

    // A client scoped to whoever is actually calling this — used only to
    // find out who they are and whether they're an admin. This never uses
    // the service role key, so it can't do anything the caller couldn't
    // already do themselves.
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(callerToken);
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
    }

    if (caller.id === userId) {
      return new Response(JSON.stringify({ error: "You can't delete your own account this way." }), { status: 400 });
    }

    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("is_admin")
      .eq("id", caller.id)
      .single();
    if (profileError || !callerProfile?.is_admin) {
      return new Response(JSON.stringify({ error: "Only an admin can permanently delete a user." }), { status: 403 });
    }

    // Only now, after confirming the caller is a genuine admin, does the
    // service-role client — the one actually capable of this — get used.
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), { status: 500 });
  }
});
