// =============================================================================
// check-reminders — Supabase Edge Function
// =============================================================================
// Runs every minute on pg_cron (see deploy notes at the bottom of this file).
// Finds every reminder whose due_at is now or earlier and that hasn't fired
// yet, inserts one `reminder_due` notification per row, then flips the
// `notified` flag so it doesn't double-fire.
//
// Uses the service-role key — this function runs server-side without a user
// JWT, so it needs to bypass RLS to write into other users' notification
// rows.
//
// Deploy:
//   supabase functions deploy check-reminders --no-verify-jwt
//
// Schedule (paste once in the SQL editor):
//   select cron.schedule(
//     'check-reminders-minute',
//     '* * * * *',  -- every minute
//     $$ select net.http_post(
//          url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/check-reminders',
//          headers := jsonb_build_object('Authorization', 'Bearer <ANON_KEY>')
//        ); $$
//   );
// =============================================================================

// Use npm: specifier — Supabase Edge Runtime (Deno) supports it natively
// and it sidesteps esm.sh outages / version-pinning weirdness.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface DueReminder {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  deal_id: string | null;
}

Deno.serve(async (_req) => {
  // CORS — only really matters if you ever invoke this from a browser,
  // which you shouldn't (cron is the only caller). Cheap to include.
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(
      JSON.stringify({ error: "Service-role credentials missing" }),
      { status: 500, headers },
    );
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Pull every due, unfired reminder. Cap at 500 per minute so a backlog
  // (e.g. cron paused for a while) can't slam the API in a single tick.
  const { data, error } = await sb
    .from("reminders")
    .select("id, user_id, title, body, link, deal_id")
    .lte("due_at", new Date().toISOString())
    .eq("notified", false)
    .limit(500);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers,
    });
  }

  const due = (data || []) as DueReminder[];
  if (due.length === 0) {
    return new Response(JSON.stringify({ fired: 0 }), { status: 200, headers });
  }

  // Build notification rows. Skip any reminder that's somehow missing a
  // user_id — defensive, shouldn't happen because the column is NOT NULL.
  const notifs = due
    .filter((r) => !!r.user_id)
    .map((r) => ({
      user_id: r.user_id,
      type: "reminder_due",
      title: r.title,
      body: r.body,
      reminder_id: r.id,
      deal_id: r.deal_id,
      link: r.link || (r.deal_id ? `/deals?open=${r.deal_id}` : "/"),
    }));

  if (notifs.length > 0) {
    const { error: insertErr } = await sb.from("notifications").insert(notifs);
    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers,
      });
    }
  }

  // Flip notified=true on every row we just fired. One bulk update by id
  // list — keeps it to a single round-trip.
  const ids = due.map((r) => r.id);
  const { error: updateErr } = await sb
    .from("reminders")
    .update({ notified: true })
    .in("id", ids);

  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), {
      status: 500,
      headers,
    });
  }

  return new Response(
    JSON.stringify({ fired: notifs.length, scanned: due.length }),
    { status: 200, headers },
  );
});
