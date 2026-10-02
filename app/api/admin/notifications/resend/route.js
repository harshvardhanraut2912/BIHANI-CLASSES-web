// SAVE THIS FILE AT: app/api/admin/notifications/resend/route.js  (new file, new folder)
//
// POST { id } -> re-sends a previously sent notification through the exact
// same resolve-recipients-and-push pipeline as a brand new send. This
// creates a NEW notification row (its own history entry, its own
// notification_recipients rows, its own push batch) with the same title,
// body, image and target as the original -- it does not touch or re-use the
// original row. Recipients are re-resolved fresh (e.g. a "course" target
// picks up anyone who enrolled since the original send).
//
// Only makes sense for a notification that has actually gone out
// (sent_at is set). A still-pending scheduled notification has nothing to
// resend yet -- just wait for it to fire, or delete it to cancel.
//
// Auth pattern copied from app/api/admin/notifications/route.js.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/adminAuth';
import { resolveAndPushToRecipients } from '../route';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function requireAdmin(request) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyAdminToken(token, process.env.ADMIN_SESSION_SECRET);
  if (!payload) return null;

  return { email: payload.email, role: payload.role };
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required.' }, { status: 400 });
    }

    const { data: original, error: origErr } = await supabaseAdmin
      .from('notifications')
      .select('title, body, target_type, target_course_id, target_user_emails, image_url, sent_at')
      .eq('id', id)
      .single();
    if (origErr) throw origErr;
    if (!original) {
      return NextResponse.json({ error: 'Notification not found.' }, { status: 404 });
    }
    if (!original.sent_at) {
      return NextResponse.json(
        { error: 'This notification has not been sent yet, so there is nothing to resend.' },
        { status: 400 }
      );
    }

    const { data: notif, error: notifErr } = await supabaseAdmin
      .from('notifications')
      .insert({
        title: original.title,
        body: original.body,
        target_type: original.target_type,
        target_course_id: original.target_course_id,
        target_user_emails: original.target_user_emails,
        created_by: admin.email || null,
        image_url: original.image_url,
        is_scheduled: false,
        scheduled_at: null,
      })
      .select()
      .single();
    if (notifErr) throw notifErr;

    const { recipientCount, pushSentCount } = await resolveAndPushToRecipients({
      targetType: original.target_type,
      courseId: original.target_course_id,
      userEmails: original.target_user_emails,
      notif,
    });

    return NextResponse.json({
      success: true,
      notificationId: notif.id,
      recipientCount,
      pushSentCount,
    });
  } catch (err) {
    console.error('admin notifications resend POST failed:', err);
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
