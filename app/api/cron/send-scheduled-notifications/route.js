import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveAndPushToRecipients } from '@/app/api/admin/notifications/route';

// app/api/cron/send-scheduled-notifications/route.js  (new file, new folder)
//
// Server-side worker for the "Schedule for later" toggle on the notify
// compose form. A scheduled notification is written to `notifications`
// with is_scheduled=true, a future scheduled_at, and sent_at left null --
// see the POST handler in app/api/admin/notifications/route.js. Nothing
// pushes it out on its own; this route is what actually does that.
//
// Every run: find every notification that's is_scheduled, still has a
// null sent_at, and whose scheduled_at has arrived, then resolve its
// recipients and fire the push for each one (same pipeline immediate sends
// and resends use). Recipients are resolved NOW, not at schedule time, so
// a "course" target reflects whoever is actually enrolled by the time it
// fires.
//
// HOW TO RUN THIS ON A SCHEDULE (pick one -- same options as
// app/api/cron/presence-sweep, see that file for the full write-up):
//   1. Vercel Cron -- add an entry to vercel.json. Per-minute schedules
//      need a Vercel Pro plan; Hobby only allows daily crons, which is too
//      infrequent for a notification someone scheduled for a specific
//      time.
//   2. Supabase pg_cron (works on every plan, including Free) -- run once
//      in the Supabase SQL editor:
//
//        select cron.schedule(
//          'send-scheduled-notifications-every-minute',
//          '* * * * *',
//          $$
//          select net.http_post(
//            url := 'https://<your-domain>/api/cron/send-scheduled-notifications',
//            headers := jsonb_build_object(
//              'Authorization', 'Bearer <CRON_SECRET value>'
//            )
//          );
//          $$
//        );
//
// Uses the same CRON_SECRET env var as presence-sweep -- if it's already
// set for that route, this one is protected too.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function isAuthorized(request) {
  if (!process.env.CRON_SECRET) return true; // no secret configured yet -- open
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${process.env.CRON_SECRET}`;
}

async function runDueNotifications() {
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabaseAdmin
    .from('notifications')
    .select('id, title, body, target_type, target_course_id, target_user_emails, image_url')
    .eq('is_scheduled', true)
    .is('sent_at', null)
    .lte('scheduled_at', nowIso);
  if (error) throw error;

  const results = [];
  for (const notif of due || []) {
    try {
      const { recipientCount, pushSentCount } = await resolveAndPushToRecipients({
        targetType: notif.target_type,
        courseId: notif.target_course_id,
        userEmails: notif.target_user_emails,
        notif,
      });
      results.push({ id: notif.id, ok: true, recipientCount, pushSentCount });
    } catch (err) {
      // Don't let one bad row (e.g. "course" target with zero enrolled
      // students right now) block the rest of the batch. It stays
      // is_scheduled/sent_at-null and will simply be retried on the next
      // run -- an admin can also just delete it if that's not wanted.
      console.error(`[send-scheduled-notifications] failed for ${notif.id}:`, err.message);
      results.push({ id: notif.id, ok: false, error: err.message });
    }
  }

  return results;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const results = await runDueNotifications();
    return NextResponse.json({
      ok: true,
      processed: results.length,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    console.error('send-scheduled-notifications failed:', err);
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }
}

// Some cron providers (and manual testing) prefer POST -- support both.
export async function POST(request) {
  return GET(request);
}
