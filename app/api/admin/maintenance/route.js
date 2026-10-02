// SAVE THIS FILE AT: app/api/admin/maintenance/route.js  (REPLACE existing file)
//
// GET  -> current maintenance status for BOTH website and app, for the
//         admin panel toggle page.
// POST -> flips one of the two independently. Body: either
//         { enabled: boolean, password: string }      -- website
//         { appEnabled: boolean, password: string }    -- app
//
// `password` must match process.env.MAINTANANCE_PASS (server-side env
// var) -- the browser collects it via window.prompt() on the admin page
// itself, never a form field on the page, and it's checked here before
// anything is written. Wrong/missing password -> 403, no change made.
//
// This path is under /api/admin/, so proxy.js's existing admin gate
// already requires a valid signed admin cookie before either handler
// below ever runs -- same protection as every other /api/admin/* route.
// The password check below is IN ADDITION to that admin-cookie gate,
// not a replacement for it.
//
// Still the same single-row `maintenance_settings` table (id = true),
// just with two extra columns added for the app flag: `app_enabled`,
// `app_updated_at`, `app_updated_by`. See
// sql/002_app_maintenance_mode.sql for the migration.
//
// proxy.js only ever reads the `enabled` column (website), so it is
// completely unaffected by this -- the website's maintenance behavior
// is unchanged.
//
// Auth pattern copied from app/api/admin/notifications/route.js.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/adminAuth';

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

export async function GET(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data, error } = await supabaseAdmin
      .from('maintenance_settings')
      .select('enabled, updated_at, updated_by, app_enabled, app_updated_at, app_updated_by')
      .eq('id', true)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      enabled: data?.enabled === true,
      updatedAt: data?.updated_at || null,
      updatedBy: data?.updated_by || null,
      appEnabled: data?.app_enabled === true,
      appUpdatedAt: data?.app_updated_at || null,
      appUpdatedBy: data?.app_updated_by || null,
    });
  } catch (err) {
    console.error('admin maintenance GET failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { enabled, appEnabled, password } = body;

    const expectedPassword = process.env.MAINTANANCE_PASS;
    if (!expectedPassword) {
      console.error('admin maintenance POST: MAINTANANCE_PASS is not set in env');
      return NextResponse.json({ error: 'Server is not configured for this action.' }, { status: 500 });
    }
    if (typeof password !== 'string' || password !== expectedPassword) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 403 });
    }

    if (typeof enabled !== 'boolean' && typeof appEnabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Provide "enabled" (website) and/or "appEnabled" (app) as a boolean.' },
        { status: 400 }
      );
    }

    const row = { id: true };
    if (typeof enabled === 'boolean') {
      row.enabled = enabled;
      row.updated_by = admin.email || null;
    }
    if (typeof appEnabled === 'boolean') {
      row.app_enabled = appEnabled;
      row.app_updated_by = admin.email || null;
    }

    const { error } = await supabaseAdmin.from('maintenance_settings').upsert(row);

    if (error) throw error;

    return NextResponse.json({ success: true, enabled, appEnabled });
  } catch (err) {
    console.error('admin maintenance POST failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
