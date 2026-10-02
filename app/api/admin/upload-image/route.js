// 📂 SAVE THIS FILE AT: app/api/admin/upload-image/route.js
//
// Generic drag-and-drop / file-picker image upload used by the whole
// admin Products/Courses/Sections/Chapters UI. Replaces manually typing a
// GitHub path into a text field. The client sends the raw file as
// base64 plus which bucket it belongs to; this route uploads it to
// Supabase Storage and hands back a public URL that gets saved straight
// into the relevant *_url column (thumbnail_url / icon_url).
//
// Only two buckets are allowed on purpose -- thumbnails and icons -- so a
// typo in the client can't silently create a stray bucket.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_BUCKETS = new Set(["thumbnails", "icons", "notification-images"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB — plenty for card thumbnails/icons

function safeFileName(originalName) {
  const cleaned = String(originalName || "upload")
    .toLowerCase()
    .replace(/[^a-z0-9.\-]+/g, "-")
    .replace(/-+/g, "-");
  return `${Date.now()}-${cleaned}`;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { bucket, fileName, base64Data, contentType } = body;

    if (!ALLOWED_BUCKETS.has(bucket)) {
      return NextResponse.json({ error: `Invalid bucket "${bucket}". Must be one of: thumbnails, icons, notification-images.` }, { status: 400 });
    }
    if (!base64Data) {
      return NextResponse.json({ error: "No file data received." }, { status: 400 });
    }

    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 5MB)." }, { status: 400 });
    }

    const storagePath = safeFileName(fileName);

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: contentType || "image/png",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);

    return NextResponse.json({
      publicUrl: publicUrlData.publicUrl,
      storagePath,
      bucket,
    });
  } catch (err) {
    console.error("Admin Upload Image Error:", err);
    return NextResponse.json({ error: err.message || "Upload failed." }, { status: 500 });
  }
}

// Delete an image from storage — used when the admin replaces an existing
// thumbnail/icon, so old files don't pile up unused in the bucket.
export async function DELETE(request) {
  try {
    const { bucket, storagePath } = await request.json();
    if (!ALLOWED_BUCKETS.has(bucket) || !storagePath) {
      return NextResponse.json({ error: "Missing bucket or storagePath." }, { status: 400 });
    }
    const { error } = await supabaseAdmin.storage.from(bucket).remove([storagePath]);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
