// SAVE THIS FILE AT: lib/notifyEnrollment.js  (replace existing)
//
// Called right after a `user_enrollments` row is inserted (from
// app/api/payment/verify/route.js and app/api/enroll/coupon/route.js).
// Best-effort: any failure here is logged and swallowed, never blocks the
// caller.
//
// FIX: previously resolved the mobile-app user via `profiles.email`, but
// the mobile app's onboarding flow never writes an `email` column to
// `profiles` at all -- only full_name/mobile_number/current_class/
// target_exams. So that lookup almost always found nothing and returned
// silently, with zero rows ever written to notifications/notification_
// recipients and no error anywhere. Now resolves the user via Supabase
// Auth itself (the source of truth for email -> user id), which doesn't
// depend on what the mobile app happens to have written to profiles.

import { createClient } from '@supabase/supabase-js';
import { sendExpoPush } from '@/lib/pushSender';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function resolveUserIdByEmail(email) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!res.ok) {
    console.error('[notifyEnrollment] auth admin lookup failed:', res.status, await res.text());
    return null;
  }
  const json = await res.json();
  const user = json?.users?.[0] ?? json?.[0];
  return user?.id ?? null;
}

/**
 * @param {string} studentEmail
 * @param {string} courseName
 * @param {string} courseId
 */
export async function notifyEnrollment(studentEmail, courseName, courseId) {
  try {
    const normalizedEmail = String(studentEmail || '').trim().toLowerCase();
    if (!normalizedEmail) {
      console.warn('[notifyEnrollment] no studentEmail passed, skipping.');
      return;
    }

    const userId = await resolveUserIdByEmail(normalizedEmail);
    if (!userId) {
      console.log('[notifyEnrollment] no auth user found for', normalizedEmail, '-- skipping (not a mobile-app account yet).');
      return;
    }

    const { data: notif, error: notifErr } = await supabaseAdmin
      .from('notifications')
      .insert({
        title: 'Course Enrolled 🎉',
        body: `You're now enrolled in "${courseName}". Head to your dashboard to get started.`,
        target_type: 'enrollment',
        target_course_id: String(courseId),
        created_by: 'system',
      })
      .select()
      .single();

    if (notifErr) {
      console.error('[notifyEnrollment] notifications insert failed:', notifErr);
      return;
    }
    console.log('[notifyEnrollment] notification row created:', notif.id);

    const { error: recipErr } = await supabaseAdmin
      .from('notification_recipients')
      .insert({ notification_id: notif.id, user_id: userId });

    if (recipErr) {
      console.error('[notifyEnrollment] notification_recipients insert failed:', recipErr);
      return;
    }
    console.log('[notifyEnrollment] recipient row created for user', userId);

    const { data: tokenRows, error: tokenErr } = await supabaseAdmin
      .from('push_tokens')
      .select('expo_token')
      .eq('user_id', userId);

    if (tokenErr) {
      console.error('[notifyEnrollment] push_tokens lookup failed:', tokenErr);
      return;
    }

    if (!tokenRows || tokenRows.length === 0) {
      console.log('[notifyEnrollment] user has no registered push tokens (app not opened/logged in on a device yet).');
      return;
    }

    await sendExpoPush(
      tokenRows.map((t) => t.expo_token),
      notif.title,
      notif.body,
      { notificationId: notif.id }
    );
    console.log('[notifyEnrollment] push sent to', tokenRows.length, 'device(s).');
  } catch (err) {
    console.error('[notifyEnrollment] failed (non-fatal):', err);
  }
}
