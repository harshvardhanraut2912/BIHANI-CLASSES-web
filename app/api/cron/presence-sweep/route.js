import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// app/api/cron/presence-sweep/route.js
//
// The server-side "crash control" safety net for profiles.is_online and
// profiles.is_exam_active.
//
// Client-side code (public/auth.js, lib/presence.js, public/exam-engine.js)
// already flips both flags false on a normal tab-hide / page-close / exam
// submit. None of that fires if the student's device or connection dies
// outright (power loss, browser crash, network drop, phone yanked off
// charger mid-exam, etc.) -- there's no event for "the internet just
// vanished". The only way to catch that is a server-side process that
// independently expires anyone who's gone quiet.
//
// Every client heartbeat (the 30s interval in both auth.js and
// lib/presence.js) refreshes profiles.last_seen_at while the tab is open
// and visible. So: anyone whose last_seen_at is more than 60 seconds old
// but is still marked is_online or is_exam_active is provably stale --
// flip both false.
//
// HOW TO RUN THIS EVERY MINUTE (pick one):
//   1. Vercel Cron -- see vercel.json in the project root. Note: per-minute
//      cron schedules require a Vercel Pro plan; the Hobby plan only
//      allows daily crons, which is too infrequent for this.
//   2. Supabase pg_cron (works on every Supabase plan, including Free) --
//      run once in the Supabase SQL editor:
//
//        select cron.schedule(
//          'presence-sweep-every-minute',
//          '* * * * *',
//          $$
//          select net.http_post(
//            url := 'https://<your-domain>/api/cron/presence-sweep',
//            headers := jsonb_build_object(
//              'Authorization', 'Bearer <CRON_SECRET value>'
//            )
//          );
//          $$
//        );
//
//      (requires the pg_cron and pg_net extensions, both enabled from
//      Database -> Extensions in the Supabase dashboard)
//
// Either way, set a CRON_SECRET env var and this route will require it as
// `Authorization: Bearer <CRON_SECRET>` -- without one set, the route
// still works but is left open, so set it before going live.

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STALE_AFTER_MS = 60 * 1000; // 1 minute of silence = stale

async function runSweep() {
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .update({ is_online: false, is_exam_active: false })
        .lt('last_seen_at', staleBefore)
        .or('is_online.eq.true,is_exam_active.eq.true')
        .select('id');

    if (error) throw error;
    return data?.length || 0;
}

function isAuthorized(request) {
    if (!process.env.CRON_SECRET) return true; // no secret configured yet -- open
    const header = request.headers.get('authorization') || '';
    return header === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const expiredCount = await runSweep();
        return NextResponse.json({ ok: true, expiredCount });
    } catch (err) {
        console.error('Presence sweep failed:', err);
        return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
    }
}

// Some cron providers (and manual testing) prefer POST -- support both.
export async function POST(request) {
    return GET(request);
}
