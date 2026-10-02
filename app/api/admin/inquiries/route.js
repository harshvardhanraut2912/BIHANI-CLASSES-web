import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Check both common naming variants for the master service role key
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!serviceKey) {
  console.warn("⚠️ Warning: Supabase Service Role Key is missing from your environment variables!");
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceKey
);

export async function GET() {
  try {
    const { data: inquiries, error: inqError } = await supabaseAdmin
      .from("contact_inquiries")
      .select("*")
      .order("created_at", { ascending: false });

    if (inqError) throw inqError;

    const { data: profiles, error: profError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, username, current_class, current_session_id, is_online, is_exam_active");

    if (profError) throw profError;

    return NextResponse.json({ inquiries, profiles });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { id, status } = await request.json();

    // Force using the admin bypass client explicitly
    const { data, error } = await supabaseAdmin
      .from("contact_inquiries")
      .update({ status: status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, inquiry: data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}