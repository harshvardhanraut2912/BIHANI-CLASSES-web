'use client';

// components/common/PresenceTracker.js
//
// Mounted once in app/layout.js so profiles.is_online actually gets set on
// EVERY Next.js app-router page (dashboard, profile, cources/*) — not just
// the plain HTML pages that already load public/auth.js. Renders nothing;
// it only wires up the same presence rules used everywhere else:
//   - visible + logged in  -> is_online = true
//   - hidden tab / minimized -> is_online = false
//   - tab/browser closed    -> best-effort offline beacon
//   - heartbeat every 30s while visible, so a crashed/disconnected session
//     can be caught by the server-side sweep (see
//     app/api/cron/presence-sweep/route.js) even if none of the above ever
//     fire (power loss, network death, etc.)
//
// Skips /admin entirely — admin staff sessions aren't "student presence".

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { setOnlineStatus, startPresenceHeartbeat, stopPresenceHeartbeat, sendOfflineBeacon } from '@/lib/presence';

export default function PresenceTracker() {
    const pathname = usePathname();
    const isAdmin = pathname?.startsWith('/admin');

    useEffect(() => {
        if (isAdmin) return undefined;

        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                if (document.visibilityState === 'visible') {
                    setOnlineStatus(true);
                }
                startPresenceHeartbeat();
            } else {
                stopPresenceHeartbeat();
            }
        });

        function handleVisibilityChange() {
            setOnlineStatus(document.visibilityState === 'visible');
        }
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', sendOfflineBeacon);

        // Cover the case where a session already exists when this mounts
        // (onAuthStateChange only fires on the INITIAL_SESSION event after
        // that, which some Supabase versions delay) -- kick it off directly too.
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                if (document.visibilityState === 'visible') setOnlineStatus(true);
                startPresenceHeartbeat();
            }
        });

        return () => {
            authListener?.subscription?.unsubscribe();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', sendOfflineBeacon);
            stopPresenceHeartbeat();
        };
    }, [isAdmin]);

    return null;
}
