// SAVE TO: lib/examAuth.js  (new file)
//
// supabaseAdmin.auth.getUser(token) is a real network round-trip to
// Supabase's Auth server (GoTrue), not a local JWT check — and it has
// no built-in timeout. Every exam route that authenticates a student
// was copy-pasting this same unguarded call, so when Supabase Auth had
// any latency, EVERY one of those routes could hang indefinitely with
// no clean error for the client to react to (that's what happened to
// /api/exam/start, and independently to /api/exam/review +
// /api/exam/leaderboard, since review.tsx calls both at once).
//
// One shared, timeout-guarded helper so this can't silently drift back
// to "hangs forever" route-by-route again.

const AUTH_CHECK_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Verifies the cet_session_token cookie against Supabase Auth with a
 * hard timeout. Returns { user } on success, or { errorResponseInit }
 * (a { body, status } pair, ready to hand to NextResponse.json) on any
 * failure — missing cookie, invalid session, or a timed-out auth check.
 *
 * Usage in a route:
 *   const { user, errorResponseInit } = await getAuthenticatedUser(request, supabaseAdmin);
 *   if (!user) return NextResponse.json(errorResponseInit.body, { status: errorResponseInit.status });
 */
export async function getAuthenticatedUser(request, supabaseAdmin) {
  const sessionToken = request.cookies.get('cet_session_token')?.value;
  if (!sessionToken) {
    return { user: null, errorResponseInit: { body: { error: 'Unauthorized' }, status: 401 } };
  }

  try {
    const { data, error: authErr } = await withTimeout(
      supabaseAdmin.auth.getUser(sessionToken),
      AUTH_CHECK_TIMEOUT_MS,
      'auth.getUser'
    );
    if (authErr || !data?.user) {
      return { user: null, errorResponseInit: { body: { error: 'Invalid Session' }, status: 401 } };
    }
    return { user: data.user, errorResponseInit: null };
  } catch (timeoutErr) {
    console.error('Auth check timed out:', timeoutErr.message);
    return {
      user: null,
      errorResponseInit: { body: { error: 'Authentication check timed out. Please try again.' }, status: 504 },
    };
  }
}
