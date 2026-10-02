// Initialize Supabase client independently
const SUPABASE_URL = "https://onybcepeccuevhgqmrpl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ueWJjZXBlY2N1ZXZoZ3FtcnBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NDc3NDgsImV4cCI6MjEwNjUyMzc0OH0.RqUKjKzn3UqgUWAphWADM8k1CQLStChzV6JrbetcBHA";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===================================================
// 1. CLEAN EXPLICIT LOGOUT ENGINE
// ===================================================
window.globalSecureLogout = async function() {
    // Mark offline BEFORE we sign out — once signed out we lose the
    // permission (RLS) needed to update our own profile row.
    await setOnlineStatus(false);
    stopPresenceHeartbeat();

    // Only clear credentials here when intentionally called by the user clicking Logout
    document.cookie = "cet_session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    localStorage.clear();
    sessionStorage.clear();
    await supabaseClient.auth.signOut();
    window.location.replace('/');
};

// ===================================================
// 2. STANDARD AUTHENTICATION & COOKIE SYNC
// ===================================================
supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (session) {
        // Respect the cookie-consent choice: only persist the session
        // cookie across browser restarts if the visitor accepted cookies.
        // If declined (or no choice yet), it's a session-only cookie that
        // vanishes once the browser closes.
        let cookieConsent = null;
        try {
            const m = document.cookie.match(/(?:^|; )cookie_consent=([^;]*)/);
            cookieConsent = m ? decodeURIComponent(m[1]) : null;
        } catch (e) {}

        const isSecureEnv = window.location.protocol === 'https:';
        let cookieString = `cet_session_token=${session.access_token}; path=/; SameSite=Lax`;
        if (cookieConsent === 'accepted') {
            cookieString += `; max-age=${60 * 60 * 24 * 7}`;
        }
        if (isSecureEnv) cookieString += '; Secure';
        document.cookie = cookieString;
        
        // Clean the URL bar immediately after a successful login
        if (event === 'SIGNED_IN') {
            cleanUrlHashStrings(); 
        }

        // Student is authenticated and this tab is open — mark them online
        // and start the heartbeat. Runs on SIGNED_IN, INITIAL_SESSION,
        // TOKEN_REFRESHED — basically any time we have a live session.
        if (document.visibilityState === 'visible') {
            setOnlineStatus(true);
        }
        startPresenceHeartbeat();
    } else {
        // No session (e.g. signed out elsewhere) — just stop the heartbeat.
        // Not treated as a forced logout, so no reload/redirect glitches.
        stopPresenceHeartbeat();
    }
    // Notice: No automatic 'else' logout blocks here! This prevents any reload glitches.
});

// ===================================================
// 3. GOOGLE OAUTH AUTHORIZATION TRIGGER
// ===================================================
document.addEventListener("DOMContentLoaded", () => {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            // Preserve ?redirect=<path> (set by BuyBox/CouponBox when they
            // bounce an unauthenticated student here) through the OAuth
            // round trip -- Supabase sends the browser back to redirectTo
            // once Google auth completes, so we point it back at /login
            // with the same redirect param still attached. The inline
            // onAuthStateChange listener below then reads it and sends the
            // student to their original page instead of always '/'.
            // Go straight to /cources after Google auth completes -- no
            // longer bouncing back through /login first. This sidesteps
            // Supabase's Redirect URLs allowlist rejecting a redirectTo it
            // doesn't recognize and silently falling back to the Site URL
            // (homepage) instead. /cources already loads this same
            // auth.js, so the cookie-sync logic above still runs there
            // exactly as it did on the login page -- nothing about that
            // is lost, it just happens one page later than before.
            const redirectTo = window.location.origin + '/cources';
            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo }
            });
            if (error) console.error("OAuth Authentication Core Error:", error.message);
        });
    }
    cleanUrlHashStrings();
});

// Helper function to safely wash away all messy URL strings without page reloads
function cleanUrlHashStrings() {
    if (window.location.hash.includes('access_token=') || window.location.hash === '#' || window.location.href.endsWith('#')) {
        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }
}

// ===================================================
// 4. LIVE "ON WEBSITE" PRESENCE TRACKING
//    Marks profiles.is_online true/false depending on whether this
//    student actually has the tab open and in the foreground right now.
//    Requires: profiles.id === auth user id (standard Supabase pattern),
//    and an RLS UPDATE policy letting a user update their own profile row
//    (e.g. `using (auth.uid() = id)`).
// ===================================================

let presenceHeartbeatId = null;

async function setOnlineStatus(isOnline) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const { error } = await supabaseClient
        .from('profiles')
        .update({
            is_online: isOnline,
            last_seen_at: new Date().toISOString()
        })
        .eq('id', session.user.id);

    if (error) console.error("Presence update failed:", error.message);
}

function startPresenceHeartbeat() {
    stopPresenceHeartbeat();

    // Every 30s while the tab is open and in the foreground, refresh
    // last_seen_at so a stale/crashed session can later be detected
    // and auto-expired server-side instead of staying "online" forever.
    presenceHeartbeatId = setInterval(() => {
        if (document.visibilityState === 'visible') {
            setOnlineStatus(true);
        }
    }, 30000);
}

function stopPresenceHeartbeat() {
    if (presenceHeartbeatId) {
        clearInterval(presenceHeartbeatId);
        presenceHeartbeatId = null;
    }
}

// Tab switched away / minimized / phone locked -> offline.
// Tab switched back into view -> online again.
document.addEventListener('visibilitychange', () => {
    setOnlineStatus(document.visibilityState === 'visible');
});

// Tab/browser closed or navigating away entirely. A normal fetch() can get
// cancelled mid-flight during unload, so we use keepalive so the request
// is still allowed to complete in the background after the page is gone.
window.addEventListener('pagehide', () => {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (!session) return;

        fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}`, {
            method: 'PATCH',
            keepalive: true,
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${session.access_token}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                is_online: false,
                last_seen_at: new Date().toISOString()
            })
        });
    });
});
