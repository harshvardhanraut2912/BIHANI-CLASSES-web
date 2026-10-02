// 📂 SAVE THIS FILE AT: app/api/admin/push-images-v2/route.js
//
// Uploads already-converted images (from the CMS's "Convert Images" step) to
// Storage at their exact predicted paths — nothing else. No question data,
// no question_bundles_v2 write. This exists so images can be pushed live
// independently of (and before) deploying the actual question rows, via the
// "Deploy Images" button next to Deploy.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Same dedicated v2 bucket as app/api/admin/push-v2/route.js — must match.
const BUCKET = "question-images-v2";

let bucketReady = false;
async function ensureBucketExists() {
  if (bucketReady) return;
  const { data: existing } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (existing) {
    bucketReady = true;
    return;
  }
  const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
  });
  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(`Failed to create bucket "${BUCKET}": ${createError.message}`);
  }
  bucketReady = true;
}

export async function POST(request) {
  try {
    await ensureBucketExists();

    const { uploads } = await request.json();

    if (!Array.isArray(uploads) || uploads.length === 0) {
      return NextResponse.json({ success: false, error: "No images to upload." }, { status: 400 });
    }

    const uploaded = [];
    const failed = [];

    // Uploads within a batch don't depend on each other — run them
    // concurrently instead of one at a time, which was the main reason a
    // batch of images took tens of seconds.
    await Promise.all(
      uploads.map(async (item) => {
        if (!item.storagePath || !item.base64Data) {
          failed.push({ storagePath: item.storagePath || null, error: "Missing storagePath or base64Data." });
          return;
        }
        try {
          const buffer = Buffer.from(item.base64Data, "base64");
          const { error: uploadError } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(item.storagePath, buffer, { contentType: "image/png", upsert: true });

          if (uploadError) throw uploadError;

          const publicUrl = supabaseAdmin.storage
            .from(BUCKET)
            .getPublicUrl(item.storagePath).data.publicUrl;

          uploaded.push({ storagePath: item.storagePath, publicUrl });
        } catch (err) {
          failed.push({ storagePath: item.storagePath, error: err.message });
        }
      })
    );

    return NextResponse.json({
      success: failed.length === 0,
      uploadedCount: uploaded.length,
      failedCount: failed.length,
      uploaded,
      failed,
    });
  } catch (err) {
    console.error("push-images-v2 route error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}