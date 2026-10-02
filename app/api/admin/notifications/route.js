// SAVE THIS FILE AT: app/api/admin/notifications/route.js  (overwrite existing file)
//
// POST -> admin creates a notification. Two modes:
//           - immediate (default): resolves recipients + sends right away,
//             exactly as before.
//           - scheduled (isScheduled: true, scheduledAt: ISO string): just
//             stores the notification with is_scheduled=true and a null
//             sent_at. Recipients are NOT resolved yet -- that happens at
//             send time (see app/api/cron/send-scheduled-notifications),
//             so "who's enrolled" is always fresh as of the actual send,
//             not as of when the admin scheduled it.
//
// GET   -> feeds the admin page: the course dropdown + a history list of
//          previously sent/scheduled notifications with a rough delivery
//          count.
//
// DELETE -> removes a notification. For a scheduled-but-not-yet-sent one,
//           this doubles as "cancel the schedule" -- the cron route only
//           ever acts on rows that still exist.
//
// Auth pattern copied from app/api/admin/enrollments/route.js -- same
// cet_session_token cookie + profiles.role === 'admin' check.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendExpoPush } from '@/lib/pushSender';
import { verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/adminAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// FIX: profiles.email is not reliably populated (the mobile app's onboarding
// flow never writes it), so filtering profiles by email silently found
// nothing for "Students in a course" / "Specific emails" -- only "All
// students" worked, since that path never filters by email at all.
// Resolve through Supabase Auth itself instead, which is always accurate.
async function resolveUserIdsByEmails(emails) {
  const results = await Promise.all(
    emails.map(async (email) => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
          {
            headers: {
              apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
          }
        );
        if (!res.ok) return null;
        const json = await res.json();
        const user = json?.users?.[0] ?? json?.[0];
        return user?.id ?? null;
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

async function requireAdmin(request) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyAdminToken(token, process.env.ADMIN_SESSION_SECRET);
  if (!payload) return null;

  return { email: payload.email, role: payload.role };
}

// ---- Shared resolve-recipients-and-push logic -----------------------------
// Used by the immediate POST path below AND by
// app/api/admin/notifications/resend/route.js, so both go through the exact
// same pipeline. Given an already-resolved targetType/courseId/userEmails,
// this resolves recipient ids, writes notification_recipients, and fires
// Expo push. Does NOT insert the `notifications` row itself -- callers pass
// in the row they already have (freshly inserted, or an existing one being
// resent).
export async function resolveAndPushToRecipients({ targetType, courseId, userEmails, notif }) {
  let recipientIds = [];

  if (targetType === 'all') {
    const { data, error } = await supabaseAdmin.from('profiles').select('id');
    if (error) throw error;
    recipientIds = (data || []).map((p) => p.id);
  }

  if (targetType === 'course') {
    const { data: enrollments, error: enrollErr } = await supabaseAdmin
      .from('user_enrollments')
      .select('student_id')
      .eq('course_id', String(courseId));
    if (enrollErr) throw enrollErr;

    const emails = [...new Set((enrollments || []).map((e) => e.student_id))];
    if (emails.length > 0) {
      recipientIds = await resolveUserIdsByEmails(emails);
    }
  }

  if (targetType === 'users') {
    const normalized = (userEmails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
    recipientIds = await resolveUserIdsByEmails(normalized);
  }

  recipientIds = [...new Set(recipientIds)];
  if (recipientIds.length === 0) {
    const err = new Error('No matching students found for that target.');
    err.status = 404;
    throw err;
  }

  const recipientRows = recipientIds.map((user_id) => ({
    notification_id: notif.id,
    user_id,
  }));
  const { error: recipErr } = await supabaseAdmin
    .from('notification_recipients')
    .insert(recipientRows);
  if (recipErr) throw recipErr;

  const { data: tokenRows, error: tokenErr } = await supabaseAdmin
    .from('push_tokens')
    .select('expo_token')
    .in('user_id', recipientIds);
  if (tokenErr) throw tokenErr;

  const { sent } = await sendExpoPush(
    (tokenRows || []).map((t) => t.expo_token),
    notif.title,
    notif.body,
    { notificationId: notif.id, imageUrl: notif.image_url || undefined }
  );

  await supabaseAdmin
    .from('notifications')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', notif.id);

  return { recipientCount: recipientIds.length, pushSentCount: sent };
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { title, body, targetType, courseId, userEmails, imageUrl, isScheduled, scheduledAt } =
      await request.json();

    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'Title and body are required.' }, { status: 400 });
    }
    if (!['all', 'course', 'users'].includes(targetType)) {
      return NextResponse.json({ error: 'Invalid targetType.' }, { status: 400 });
    }
    if (targetType === 'course' && !courseId) {
      return NextResponse.json({ error: 'courseId is required for targetType "course".' }, { status: 400 });
    }
    if (targetType === 'users' && (!Array.isArray(userEmails) || userEmails.length === 0)) {
      return NextResponse.json({ error: 'userEmails is required for targetType "users".' }, { status: 400 });
    }

    // ---- Scheduled path: just store it, no recipients/push yet ----
    if (isScheduled) {
      const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
      if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) {
        return NextResponse.json({ error: 'A valid scheduledAt date/time is required.' }, { status: 400 });
      }
      if (scheduledDate.getTime() <= Date.now()) {
        return NextResponse.json({ error: 'scheduledAt must be in the future.' }, { status: 400 });
      }

      const { data: notif, error: notifErr } = await supabaseAdmin
        .from('notifications')
        .insert({
          title: title.trim(),
          body: body.trim(),
          target_type: targetType,
          target_course_id: targetType === 'course' ? String(courseId) : null,
          target_user_emails:
            targetType === 'users' ? userEmails.map((e) => String(e).trim().toLowerCase()) : null,
          created_by: admin.email || null,
          image_url: imageUrl ? String(imageUrl).trim() : null,
          is_scheduled: true,
          scheduled_at: scheduledDate.toISOString(),
          sent_at: null,
        })
        .select()
        .single();
      if (notifErr) throw notifErr;

      return NextResponse.json({
        success: true,
        notificationId: notif.id,
        scheduled: true,
        scheduledAt: notif.scheduled_at,
        recipientCount: 0,
        pushSentCount: 0,
      });
    }

    // ---- Immediate path (unchanged behaviour) ----
    const { data: notif, error: notifErr } = await supabaseAdmin
      .from('notifications')
      .insert({
        title: title.trim(),
        body: body.trim(),
        target_type: targetType,
        target_course_id: targetType === 'course' ? String(courseId) : null,
        target_user_emails: targetType === 'users' ? userEmails.map((e) => String(e).trim().toLowerCase()) : null,
        created_by: admin.email || null,
        image_url: imageUrl ? String(imageUrl).trim() : null,
        is_scheduled: false,
        scheduled_at: null,
      })
      .select()
      .single();
    if (notifErr) throw notifErr;

    const { recipientCount, pushSentCount } = await resolveAndPushToRecipients({
      targetType,
      courseId,
      userEmails,
      notif,
    });

    return NextResponse.json({
      success: true,
      notificationId: notif.id,
      recipientCount,
      pushSentCount,
    });
  } catch (err) {
    console.error('admin notifications POST failed:', err);
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

// DELETE /api/admin/notifications?id=<uuid> — remove a notification and its
// recipient rows (so it also disappears from the in-app bell icon list),
// e.g. one sent by mistake, or a scheduled one the admin wants to cancel
// before it goes out. Follows the same admin cookie auth as above.
export async function DELETE(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required.' }, { status: 400 });
    }

    const { error: recipErr } = await supabaseAdmin
      .from('notification_recipients')
      .delete()
      .eq('notification_id', id);
    if (recipErr) throw recipErr;

    const { error: notifErr } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('id', id);
    if (notifErr) throw notifErr;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('admin notifications DELETE failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);

    if (searchParams.get('courses') === '1') {
      const { data, error } = await supabaseAdmin
        .from('sidebar_main_sections')
        .select('id, name')
        .eq('is_course', true)
        .order('name');
      if (error) throw error;
      return NextResponse.json({ courses: data || [] });
    }

    // History: latest notifications + how many recipients each had.
    const { data: notifs, error } = await supabaseAdmin
      .from('notifications')
      .select(
        'id, title, body, target_type, target_course_id, target_user_emails, created_by, created_at, image_url, is_scheduled, scheduled_at, sent_at'
      )
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;

    const ids = (notifs || []).map((n) => n.id);
    let counts = {};
    if (ids.length > 0) {
      const { data: recips, error: recipErr } = await supabaseAdmin
        .from('notification_recipients')
        .select('notification_id')
        .in('notification_id', ids);
      if (recipErr) throw recipErr;
      counts = (recips || []).reduce((acc, r) => {
        acc[r.notification_id] = (acc[r.notification_id] || 0) + 1;
        return acc;
      }, {});
    }

    const history = (notifs || []).map((n) => ({ ...n, recipientCount: counts[n.id] || 0 }));
    return NextResponse.json({ history });
  } catch (err) {
    console.error('admin notifications GET failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
