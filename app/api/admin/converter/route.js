import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process";

export async function POST(request) {
  try {
    const { index, qBase64, sBase64 } = await request.json();

    const rootDir = process.cwd();
    const publicTempDir = path.join(rootDir, "public", "temp");

    if (!fs.existsSync(publicTempDir)) fs.mkdirSync(publicTempDir, { recursive: true });

    const finalPublicQPath = path.join(publicTempDir, `preview_q_${index}.png`);
    const finalPublicSPath = path.join(publicTempDir, `preview_s_${index}.png`);

    // Clean stale artifacts
    try { fs.unlinkSync(finalPublicQPath); } catch (e) {}
    try { fs.unlinkSync(finalPublicSPath); } catch (e) {}

    // Write the Base64 data directly to disk as PNGs
    if (qBase64) {
      const qBuffer = Buffer.from(qBase64.split(",")[1], "base64");
      fs.writeFileSync(finalPublicQPath, qBuffer);
    }
    
    if (sBase64) {
      const sBuffer = Buffer.from(sBase64.split(",")[1], "base64");
      fs.writeFileSync(finalPublicSPath, sBuffer);
    }

    // Run your existing optimization pipeline over the written files
    if (fs.existsSync(finalPublicQPath)) {
      const pipelineCommand = `python webp_pipeline.py "${finalPublicQPath}" "${finalPublicSPath}"`;
      await new Promise((resolve) => {
        exec(pipelineCommand, { cwd: rootDir }, () => resolve());
      });
    }

    return NextResponse.json({
      success: true,
      questionImgPath: fs.existsSync(finalPublicQPath) ? `/temp/preview_q_${index}.png` : null,
      solutionImgPath: fs.existsSync(finalPublicSPath) ? `/temp/preview_s_${index}.png` : null
    });

  } catch (err) {
    console.error("Conversion API Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}