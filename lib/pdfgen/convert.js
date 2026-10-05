// lib/pdfgen/convert.js  (new file, server only)
//
// .docx  ->  .pdf, server side. Two interchangeable back-ends:
//
//   1. REMOTE (set PDF_CONVERTER_URL): a Gotenberg service (LibreOffice in a Docker
//      container). Use this when the site runs on Vercel / any serverless host, because
//      LibreOffice cannot be installed there.
//        PDF_CONVERTER_URL=https://your-gotenberg-host            (or the full
//                          .../forms/libreoffice/convert URL)
//        PDF_CONVERTER_USER / PDF_CONVERTER_PASS   optional, sent as HTTP Basic auth
//                          (matches Gotenberg's --api-enable-basic-auth; see /pdf-converter)
//        PDF_CONVERTER_TOKEN=...      optional, sent as "Authorization: Bearer ..."
//                          (only used when no USER/PASS is set; for a proxy in front of it)
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

const TIMEOUT_MS = 100_000; // total budget; the API route allows 120 s (maxDuration)
const RETRY_WAIT_MS = 4_000;

const fail = (code, message) => Object.assign(new Error(message), { code });

/* ------------------------------------------------------------- remote */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function converterHeaders() {
  const headers = {};
  const user = process.env.PDF_CONVERTER_USER;
  const pass = process.env.PDF_CONVERTER_PASS;
  if (user && pass) headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  else if (process.env.PDF_CONVERTER_TOKEN) headers.Authorization = `Bearer ${process.env.PDF_CONVERTER_TOKEN}`;
  return headers;
}

async function viaGotenberg(docx, name) {
  const base = String(process.env.PDF_CONVERTER_URL).trim().replace(/\/+$/, "");
  const url = /\/forms\/libreoffice\/convert$/.test(base) ? base : `${base}/forms/libreoffice/convert`;
  const headers = converterHeaders();
  const deadline = Date.now() + TIMEOUT_MS;

  // A sleeping container (Render free tier, Cloud Run scale-to-zero) needs a while to wake up:
  // the first attempt can be refused / answered 502-504. Retry until the budget runs out.
  let lastProblem = "no answer";
  for (let attempt = 1; ; attempt++) {
    const left = deadline - Date.now();
    if (left < 3_000) break;

    // FormData / Blob are single-use: build fresh ones for every attempt.
    const form = new FormData();
    form.append("files", new Blob([docx], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), name);

    let res = null;
    try {
      res = await fetch(url, { method: "POST", body: form, headers, signal: AbortSignal.timeout(left) });
    } catch (e) {
      lastProblem = `could not reach it (${e.message})`;
    }

    if (res) {
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      lastProblem = `it answered ${res.status}`;
      // wrong credentials / wrong URL / bad document: retrying cannot help
      if (![502, 503, 504].includes(res.status)) {
        const hint = res.status === 401 ? " Check PDF_CONVERTER_USER / PDF_CONVERTER_PASS." : res.status === 404 ? " Check PDF_CONVERTER_URL." : "";
        throw fail("CONVERTER_FAILED", `The PDF converter service rejected the request (${res.status}).${hint}`);
      }
    }
    console.warn(`exam-pdf: converter attempt ${attempt} failed (${lastProblem}); retrying`);
    await sleep(RETRY_WAIT_MS);
  }
  throw fail("CONVERTER_FAILED", `The PDF converter service did not respond in time (${lastProblem}). It may be waking up -- try again in a minute.`);
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
  if (process.env.PDF_CONVERTER_URL) return viaGotenberg(docx, name);
  // Vercel / AWS Lambda: LibreOffice cannot exist in a serverless function, so do not even try.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    throw fail(
      "CONVERTER_MISSING",
      "PDF conversion is not set up on this deployment. Deploy the converter in /pdf-converter and set PDF_CONVERTER_URL in Vercel -> Settings -> Environment Variables, then redeploy."
    );
  }
  return viaLocal(docx);
}
