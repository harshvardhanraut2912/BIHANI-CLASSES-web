// lib/pdfgen/convert.js  (new file, server only)
//
// .docx  ->  .pdf, server side. Two interchangeable back-ends:
//
//   1. REMOTE (set PDF_CONVERTER_URL): a Gotenberg service (LibreOffice in a Docker
//      container). Use this when the site runs on Vercel / any serverless host, because
//      LibreOffice cannot be installed there.
//        PDF_CONVERTER_URL=https://your-gotenberg-host            (or the full
//                          .../forms/libreoffice/convert URL)
//        PDF_CONVERTER_TOKEN=...      optional, sent as "Authorization: Bearer ..."
//
//   2. LOCAL (default): runs LibreOffice headless on the same machine. Needs LibreOffice
//      installed (Windows / Linux / macOS). Set SOFFICE_PATH if it is not on PATH.
//
// Errors carry .code = "CONVERTER_MISSING" | "CONVERTER_FAILED" so the API can tell the admin
// exactly what is wrong (and offer the Word file instead).

import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";

const TIMEOUT_MS = 120_000;

const fail = (code, message) => Object.assign(new Error(message), { code });

/* ------------------------------------------------------------- remote */
async function viaGotenberg(docx, name) {
  const base = String(process.env.PDF_CONVERTER_URL).replace(/\/+$/, "");
  const url = /\/forms\/libreoffice\/convert$/.test(base) ? base : `${base}/forms/libreoffice/convert`;
  const form = new FormData();
  form.append("files", new Blob([docx], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), name);

  const headers = {};
  if (process.env.PDF_CONVERTER_TOKEN) headers.Authorization = `Bearer ${process.env.PDF_CONVERTER_TOKEN}`;

  let res;
  try {
    res = await fetch(url, { method: "POST", body: form, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw fail("CONVERTER_FAILED", `Could not reach the PDF converter service (${e.message}).`);
  }
  if (!res.ok) throw fail("CONVERTER_FAILED", `The PDF converter service answered ${res.status}.`);
  return Buffer.from(await res.arrayBuffer());
}

/* -------------------------------------------------------------- local */
async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function findSoffice() {
  if (process.env.SOFFICE_PATH) return process.env.SOFFICE_PATH;
  const candidates = [];
  if (process.platform === "win32") {
    for (const root of [process.env["ProgramFiles"], process.env["ProgramFiles(x86)"], "C:\\Program Files", "C:\\Program Files (x86)"]) {
      if (root) candidates.push(path.join(root, "LibreOffice", "program", "soffice.exe"));
    }
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/LibreOffice.app/Contents/MacOS/soffice");
  } else {
    candidates.push("/usr/bin/soffice", "/usr/bin/libreoffice", "/usr/local/bin/soffice", "/opt/libreoffice/program/soffice");
  }
  for (const c of candidates) if (await exists(c)) return c;
  return process.platform === "win32" ? "soffice.exe" : "soffice"; // last resort: PATH
}

function run(bin, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => { err += d; });
    child.stdout.on("data", () => {});
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(fail("CONVERTER_FAILED", "PDF conversion timed out.")); }, TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e.code === "ENOENT"
        ? fail("CONVERTER_MISSING", "LibreOffice was not found on the server. Install it, or set SOFFICE_PATH / PDF_CONVERTER_URL.")
        : fail("CONVERTER_FAILED", `Could not start LibreOffice (${e.message}).`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(fail("CONVERTER_FAILED", `LibreOffice exited with code ${code}. ${err.trim().slice(0, 300)}`));
    });
  });
}

async function viaLocal(docx) {
  const dir = path.join(os.tmpdir(), `exampdf-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  try {
    const input = path.join(dir, "sheet.docx");
    await fs.writeFile(input, docx);
    // own profile folder per run: two admins converting at once must not share one
    // LibreOffice profile (it would lock / crash).
    const profile = pathToFileURL(path.join(dir, "profile")).href;
    const bin = await findSoffice();
    await run(bin, [`-env:UserInstallation=${profile}`, "--headless", "--norestore", "--nologo", "--nolockcheck", "--convert-to", "pdf", "--outdir", dir, input], dir);
    const pdf = path.join(dir, "sheet.pdf");
    if (!(await exists(pdf))) throw fail("CONVERTER_FAILED", "LibreOffice finished but produced no PDF.");
    return await fs.readFile(pdf);
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function docxToPdf(docx, name = "sheet.docx") {
  return process.env.PDF_CONVERTER_URL ? viaGotenberg(docx, name) : viaLocal(docx);
}
