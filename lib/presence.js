// lib/presence.js
//
// "On website" presence tracking (profiles.is_online / last_seen_at) for
// every Next.js app-router page (dashboard, profile, cources/*, admin).
//
// public/auth.js already does this for the plain HTML pages (index, login,
// cources.html, contact, exam.html, etc.) via window.supabaseClient. This
// file is the same logic, ported to use the app-router's own `supabase`
// client (lib/supabase.js) instead, since those pages never load
// public/auth.js as a <script> tag. See components/common/PresenceTracker.js
// for where this gets mounted.
//
// Rule: is_online is true ONLY while the tab is open AND in the foreground
// (document.visibilityState === 'visible'). Switching tabs / minimizing /
// locking the phone flips it false immediately; switching back flips it
// true again. A heartbeat every 30s refreshes last_seen_at while visible so
// a genuinely crashed/disconnected session (no visibilitychange/pagehide
// ever fires -- e.g. power loss, network death) can still be detected and
// auto-expired server-side. See app/api/cron/presence-sweep/route.js for
// that server-side safety net.

import { supabase } from './supabase';

let heartbeatId = null;

export async function setOnlineStatus(isOnline) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { error } = await supabase
            .from('profiles')
            .update({
                is_online: isOnline,
                last_seen_at: new Date().toISOString(),
            })
            .eq('id', session.user.id);

        if (error) console.error('Presence update failed:', error.message);
    } catch (err) {
        console.error('Presence update exception:', err);
    }
}

export function startPresenceHeartbeat() {
    stopPresenceHeartbeat();
    heartbeatId = setInterval(() => {
        if (document.visibilityState === 'visible') {
            setOnlineStatus(true);
        }
    }, 30000);
}

export function stopPresenceHeartbeat() {
    if (heartbeatId) {
        clearInterval(heartbeatId);
        heartbeatId = null;
    }
}

// Best-effort "went offline" beacon for tab/browser close or hard
// navigation away. Uses fetch(..., { keepalive: true }) directly against
// PostgREST (same approach as public/auth.js) so the request can survive
// past 'pagehide', instead of a normal supabase-js call that unload can cut
// off mid-flight.
export function sendOfflineBeacon() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return;
        fetch(`${url}/rest/v1/profiles?id=eq.${session.user.id}`, {
            method: 'PATCH',
            keepalive: true,
            headers: {
                'Content-Type': 'application/json',
                apikey: key,
                Authorization: `Bearer ${session.access_token}`,
                Prefer: 'return=minimal',
            },
            body: JSON.stringify({
                is_online: false,
                last_seen_at: new Date().toISOString(),
            }),
        }).catch(() => {});
    });
}
