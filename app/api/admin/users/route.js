import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==========================================
// Merge in Supabase Auth data (Authentication → Users tab) for any
// profile missing its own full_name / email / avatar_url. Most students
// signed in with Google, so `profiles` itself is often left with those
// columns blank while the real display name, email, and Google profile
// photo only exist on the auth.users record (in user_metadata /
// identity data) — this is exactly what the Authentication tab in the
// Supabase dashboard shows per user. `profiles.id` IS the auth user's
// id, so this is a straight id-keyed merge, profile fields winning
// whenever they're actually set.
// ==========================================
async function fetchAuthUsersById() {
  const byId = {};
  let page = 1;
  const perPage = 1000;

  // Paginate defensively — most projects will only ever hit page 1, but
  // this won't silently drop users once the school grows past 1000 auth
  // accounts.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("auth.admin.listUsers failed:", error);
      break;
    }

    for (const user of data.users || []) {
      const meta = user.user_metadata || {};
      byId[user.id] = {
        full_name: meta.full_name || meta.name || null,
        avatar_url: meta.avatar_url || meta.picture || null,
        email: user.email || null,
      };
    }

    if (!data.users || data.users.length < perPage) break;
    page += 1;
  }

  return byId;
}

function mergeProfileWithAuth(profile, authUsersById) {
  const auth = authUsersById[profile.id];
  if (!auth) return profile;

  return {
    ...profile,
    full_name: profile.full_name || auth.full_name || profile.full_name,
    avatar_url: profile.avatar_url || auth.avatar_url || profile.avatar_url,
    email: profile.email || auth.email || profile.email,
  };
}

export async function GET() {
  try {
    // Fetch all profiles
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select(`
        id,
        updated_at,
        username,
        full_name,
        avatar_url,
        mobile_number,
        current_class,
        target_exams,
        current_session_id,
        is_exam_active,
        is_online,
        last_seen_at,
        email
      `)
      .order("updated_at", { ascending: false });

    if (profileError) throw profileError;

    // Fill in full_name / email / avatar_url from Supabase Auth
    // (Authentication → Users) wherever the profiles row itself is blank
    // — e.g. Google sign-ins where the student never filled these into
    // their own profile row.
    const authUsersById = await fetchAuthUsersById();
    const mergedProfiles = (profiles || []).map((p) =>
      mergeProfileWithAuth(p, authUsersById)
    );

    // Fetch all enrollments — the real course reference lives in
    // `course_id` (product_id is legacy/unused and typically blank).
    const { data: enrollments, error: enrollError } = await supabase
      .from("user_enrollments")
      .select(`
        id,
        created_at,
        student_id,
        product_id,
        course_id
      `);

    if (enrollError) throw enrollError;

    // Resolve each enrollment's course name from sidebar_main_sections
    // (the same table that drives the site's course sidebar) — id match
    // on course_id, falling back to product_id for any legacy rows that
    // still only have that column set.
    const { data: sections, error: sectionsError } = await supabase
      .from("sidebar_main_sections")
      .select("id, name");

    if (sectionsError) throw sectionsError;

    const sectionNameById = {};
    for (const section of sections || []) {
      sectionNameById[section.id] = section.name;
    }

    // Group enrollments by student email, attaching the resolved course
    // name so the admin panel never has to show a raw course id.
    const enrollmentMap = {};

    for (const item of enrollments || []) {
      const courseId = item.course_id || item.product_id;

      if (!enrollmentMap[item.student_id]) {
        enrollmentMap[item.student_id] = [];
      }

      enrollmentMap[item.student_id].push({
        ...item,
        course_id: courseId,
        course_name: sectionNameById[courseId] || null,
      });
    }

    // Fetch all purchase / transaction history
    const { data: purchases, error: purchaseError } = await supabase
      .from("user_purchases")
      .select(`
        id,
        student_id,
        item_type,
        item_id,
        amount_paid,
        currency,
        payment_method,
        transaction_status,
        razorpay_payment_id,
        razorpay_order_id,
        receipt_slip_url,
        unlocked_at
      `)
      .order("unlocked_at", { ascending: false });

    if (purchaseError) throw purchaseError;

    // Group purchases by student_id (stored as the student's email)
    const purchaseMap = {};

    for (const item of purchases || []) {
      if (!purchaseMap[item.student_id]) {
        purchaseMap[item.student_id] = [];
      }

      purchaseMap[item.student_id].push(item);
    }

    return NextResponse.json({
      profiles: mergedProfiles,
      enrollmentMap,
      purchaseMap,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        error: err.message,
      },
      {
        status: 500,
      }
    );
  }
}

// ==========================================
// UPDATE PROFILE (admin "Edit Profile" panel on the student modal)
// Updates editable fields on a single profiles row by id. Uses the
// same service-role client as GET/POST above, and relies on proxy.ts
// to have already gated this path to admins only — no extra auth
// check here, matching the existing convention in this file.
// ==========================================
export async function PATCH(request) {
  try {
    const {
      id,
      full_name,
      username,
      email,
      mobile_number,
      current_class,
      current_session_id,
      target_exams,
    } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Only touch fields that were actually sent, so a partial payload
    // never accidentally wipes out other columns.
    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (username !== undefined) updates.username = username;
    if (email !== undefined) updates.email = email;
    if (mobile_number !== undefined) updates.mobile_number = mobile_number;
    if (current_class !== undefined) updates.current_class = current_class;
    if (current_session_id !== undefined) updates.current_session_id = current_session_id;
    if (target_exams !== undefined) updates.target_exams = target_exams;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      if (updateErr.code === "23505") {
        return NextResponse.json(
          { error: "That username or email is already taken by another student." },
          { status: 409 }
        );
      }
      throw updateErr;
    }

    return NextResponse.json({ profile: updated });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        error: err.message,
      },
      {
        status: 500,
      }
    );
  }
}
// Inserts a row into user_enrollments on behalf of a student. Uses the
// same service-role client as GET above, and relies on proxy.ts to have
// already gated this path to admins only — no extra auth check here,
// matching the existing convention in this file.
// ==========================================
export async function POST(request) {
  try {
    const { studentEmail, courseId, productId } = await request.json();
    // Accept courseId (current schema) but fall back to the old
    // productId name in case any older client still sends that key.
    const resolvedCourseId = courseId || productId;

    if (!studentEmail || !resolvedCourseId) {
      return NextResponse.json(
        { error: "studentEmail and courseId are required" },
        { status: 400 }
      );
    }

    // Insert the enrollment against course_id — this is the column that
    // actually drives access (product_id is legacy/unused, see GET above).
    // If the student is already enrolled, the unique constraint fires
    // error code 23505 — treat that as a friendly conflict, not a crash,
    // same tolerance shop.html's own enrollment flow already has.
    const { data: inserted, error: insertErr } = await supabase
      .from("user_enrollments")
      .insert({ student_id: studentEmail, course_id: resolvedCourseId })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        return NextResponse.json(
          { error: "Student is already enrolled in this course." },
          { status: 409 }
        );
      }
      throw insertErr;
    }

    // Resolve the course name right away so the admin panel can show it
    // immediately, without waiting for the next full dashboard reload.
    const { data: section } = await supabase
      .from("sidebar_main_sections")
      .select("name")
      .eq("id", resolvedCourseId)
      .maybeSingle();

    return NextResponse.json({
      enrollment: {
        ...inserted,
        course_id: resolvedCourseId,
        course_name: section?.name || null,
      },
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        error: err.message,
      },
      {
        status: 500,
      }
    );
  }
}
