// 📂 SAVE THIS FILE AT: app/api/admin/upload-media/route.js

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// 🟢 NEW: Receives the files picked via the "Upload XML Media Folder" button on page.js
// (sent as multipart FormData with each file's webkitRelativePath as its filename,
// e.g. "vertopal_686563b17f3f4fc189c4aa2d4700a505/media/IMHP3Q75Q0.png") and writes them
// to disk under a stable folder id so latex_renderer.py can read the real images later
// via --media_dir.

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files");

    if (!files || files.length === 0) {
      return NextResponse.json({ success: false, error: "No files received" }, { status: 400 });
    }

    // Try to reuse the vertopal folder's own hash name as the id (first path segment
    // of the first file), falling back to a random id if that's not present/parsable.
    const firstRelPath = files[0].name || ""; // FormData "name" carries the relative path we set client-side
    const topLevelFolder = firstRelPath.split("/")[0] || "";
    const folderId = topLevelFolder.replace(/[^a-zA-Z0-9_\-]/g, "") || crypto.randomUUID();

    const rootDir = process.cwd();
    const mediaBaseDir = path.join(rootDir, "public", "temp-media", folderId);

    // Overwrite-if-exists: simplest policy for now, matches "re-upload replaces old" behavior.
    if (fs.existsSync(mediaBaseDir)) {
      fs.rmSync(mediaBaseDir, { recursive: true, force: true });
    }
    fs.mkdirSync(mediaBaseDir, { recursive: true });

    let savedCount = 0;

    for (const file of files) {
      const relPath = file.name || ""; // e.g. "vertopal_xxx/media/IMHP3Q75Q0.png"
      if (!relPath) continue;

      // Strip the top-level folder name so files land directly under mediaBaseDir/media/...
      const segments = relPath.split("/");
      const strippedRelPath = segments.length > 1 ? segments.slice(1).join("/") : segments[0];

      // Guard against path traversal from a malicious/odd filename
      const safeRelPath = path.normalize(strippedRelPath).replace(/^(\.\.[/\\])+/, "");
      const destPath = path.join(mediaBaseDir, safeRelPath);

      // Only bother saving actual media files -- skip the xml itself, docx remnants, etc.
      // (renderer only ever needs images from /media)
      const ext = path.extname(destPath).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".emf"].includes(ext)) continue;

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const arrayBuffer = await file.arrayBuffer();
      fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
      savedCount++;
    }

    if (savedCount === 0) {
      return NextResponse.json(
        { success: false, error: "No image files (.png/.jpg/.jpeg/.emf) found in the uploaded folder" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      mediaFolderId: folderId,
      savedCount,
      mediaDir: `public/temp-media/${folderId}/media`
    });

  } catch (err) {
    console.error("upload-media route error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 🟢 NEW: Deletes a previously uploaded media folder from disk. Called by the 🗑️ button
// in page.js (handleDeleteMediaFolder), which hits DELETE /api/admin/upload-media?mediaFolderId=<id>.
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaFolderId = searchParams.get("mediaFolderId");

    if (!mediaFolderId) {
      return NextResponse.json({ success: false, error: "mediaFolderId query param is required" }, { status: 400 });
    }

    // Same sanitization rule used when the folder id was first created in POST, so we can
    // never be pointed at an arbitrary path outside temp-media/ (e.g. via "../../etc").
    const safeFolderId = mediaFolderId.replace(/[^a-zA-Z0-9_\-]/g, "");
    if (!safeFolderId || safeFolderId !== mediaFolderId) {
      return NextResponse.json({ success: false, error: "Invalid mediaFolderId" }, { status: 400 });
    }

    const rootDir = process.cwd();
    const mediaBaseDir = path.join(rootDir, "public", "temp-media", safeFolderId);

    if (!fs.existsSync(mediaBaseDir)) {
      // Already gone -- treat as success so the frontend can still clear its state cleanly.
      return NextResponse.json({ success: true, deleted: false, note: "Folder was already absent on disk" });
    }

    fs.rmSync(mediaBaseDir, { recursive: true, force: true });

    return NextResponse.json({ success: true, deleted: true, mediaFolderId: safeFolderId });

  } catch (err) {
    console.error("upload-media DELETE route error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}