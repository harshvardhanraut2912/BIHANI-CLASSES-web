// 📂 SAVE THIS FILE AT: delete-chapter-assets.js (project root, next to package.json)
//
// Run with: node delete-chapter-assets.js
//
// This uses the Storage API (not raw SQL) so files are actually removed from the
// bucket, not just their metadata rows -- avoids the orphaned-object problem
// Supabase's protect_delete() trigger is guarding against.

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

const result = dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// 🟢 TEMPORARY DEBUG -- remove once the real issue is found
if (result.error) {
  console.error("dotenv failed to load .env.local:", result.error.message);
} else {
  console.log("dotenv loaded OK. Keys found:", Object.keys(result.parsed || {}));
}
console.log("NEXT_PUBLIC_SUPABASE_URL present?", !!process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("SUPABASE_SERVICE_ROLE_KEY present?", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET_NAME = "question-images";
const FOLDER_PATH = "MHT-CET/Mathematics/Probability Distribution/Numerical";

async function deleteChapterAssets() {
  console.log(`Listing files under: ${FOLDER_PATH}`);

  // 1. List every file sitting in that folder (paginated, in case there are >1000)
  let allFiles = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data: files, error: listError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .list(FOLDER_PATH, { limit: pageSize, offset });

    if (listError) throw listError;
    if (!files || files.length === 0) break;

    allFiles = allFiles.concat(files);
    if (files.length < pageSize) break; // last page
    offset += pageSize;
  }

  if (allFiles.length === 0) {
    console.log("No files found at that path -- nothing to delete.");
    return;
  }

  console.log(`Found ${allFiles.length} files. Deleting...`);

  // 2. Build full paths and delete in batches of 100 (Storage API limit per call)
  const fullPaths = allFiles.map(f => `${FOLDER_PATH}/${f.name}`);
  let totalDeleted = 0;

  for (let i = 0; i < fullPaths.length; i += 100) {
    const batch = fullPaths.slice(i, i + 100);
    const { data: deleted, error: deleteError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .remove(batch);

    if (deleteError) throw deleteError;
    totalDeleted += deleted.length;
    console.log(`  -> Deleted batch: ${deleted.length} files (running total: ${totalDeleted})`);
  }

  console.log(`\nDone. Deleted ${totalDeleted} files from ${FOLDER_PATH}`);
}

deleteChapterAssets().catch((err) => {
  console.error("Deletion failed:", err.message);
  process.exit(1);
});