// lib/pdfgen/images.js  (new file, server only)
//
// Fetches the pictures used by an exam's questions / options / solutions so docx.js can embed
// them in the Word file. Returns a Map:
//     src  ->  { buf, ext: "png"|"jpeg"|"gif", wPx, hPx, dpi }      (failures are simply absent)
//
// Safety: only Supabase Storage URLs (https://<any-project>.supabase.co/storage/v1/...), hosts
// listed in PDF_IMAGE_HOSTS and data: URIs are fetched -- never an arbitrary URL (SSRF rule).
//
// WHY "any Supabase project": the question bank was restored into the NEW Supabase project, but
// the <img src> inside question_html / options / solution_html still point at the OLD project's
// storage host. Allowing only NEXT_PUBLIC_SUPABASE_URL's host rejected every figure, which is why
// the sheet printed "[figure]". Each picture is now tried at its stored URL first and, if that
// fails, at the same storage path on the current project (after the storage files are migrated).
// Pictures that are missing, too big, slow or in an unsupported format (svg / webp) are skipped
// and printed as "[figure]" by docx.js, so a bad link can never fail the whole sheet.

const MAX_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 6;

const SUPABASE_HOST = /(^|\.)supabase\.(co|in)$/i;

function allowedHosts() {
  const hosts = new Set();
  try { hosts.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host.toLowerCase()); } catch { /* not configured */ }
  String(process.env.PDF_IMAGE_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .forEach((h) => hosts.add(h));
  return hosts;
}

const isAllowed = (url, hosts) => {
  if (!/^https?:$/.test(url.protocol)) return false;
  const host = url.host.toLowerCase();
  if (hosts.has(host)) return true;
  // any Supabase project, but only its Storage API (never rest / auth / functions)
  return SUPABASE_HOST.test(url.hostname) && url.pathname.startsWith("/storage/v1/");
};

// The URLs worth trying for one stored src (in order). Relative / protocol-relative values are
// resolved against the current Supabase project.
function candidates(src) {
  const base = (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL); } catch { return null; } })();
  let first;
  try {
    if (/^\/\//.test(src)) first = new URL(`https:${src}`);
    else if (/^\//.test(src) && base) first = new URL(src, base);
    else if (/^https?:\/\//i.test(src)) first = new URL(src);
    else if (/^storage\/v1\//i.test(src) && base) first = new URL(`/${src}`, base);
    else return [];
  } catch { return []; }
  const list = [first];
  if (base && first.host.toLowerCase() !== base.host.toLowerCase() && first.pathname.startsWith("/storage/v1/")) {
    const alt = new URL(first.toString());
    alt.protocol = base.protocol;
    alt.host = base.host;
    list.push(alt);
  }
  return list;
}

/* ------------------------------------------------------------ size sniffing */
const u32 = (b, o) => b.readUInt32BE(o);

function sniff(buf) {
  if (buf.length < 24) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const wPx = u32(buf, 16);
    const hPx = u32(buf, 20);
    let dpi = 0;
    let o = 8;
    while (o + 12 <= buf.length) {
      const len = u32(buf, o);
      const type = buf.toString("latin1", o + 4, o + 8);
      if (type === "pHYs" && len >= 9) {
        const ppu = u32(buf, o + 8);
        if (buf[o + 16] === 1 && ppu > 0) dpi = ppu * 0.0254; // pixels per metre -> dpi
        break;
      }
      if (type === "IDAT" || type === "IEND") break;
      o += 12 + len;
    }
    return { ext: "png", wPx, hPx, dpi };
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let dpi = 0;
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const marker = buf[o + 1];
      if (marker === 0xff) { o++; continue; }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { o += 2; continue; }
      const len = buf.readUInt16BE(o + 2);
      if (marker === 0xe0 && buf.toString("latin1", o + 4, o + 8) === "JFIF") {
        const units = buf[o + 11];
        const dx = buf.readUInt16BE(o + 12);
        if (units === 1 && dx > 1) dpi = dx;
        else if (units === 2 && dx > 1) dpi = dx * 2.54;
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { ext: "jpeg", hPx: buf.readUInt16BE(o + 5), wPx: buf.readUInt16BE(o + 7), dpi };
      }
      o += 2 + len;
    }
    return null;
  }
  // GIF
  if (buf.toString("latin1", 0, 3) === "GIF") {
    return { ext: "gif", wPx: buf.readUInt16LE(6), hPx: buf.readUInt16LE(8), dpi: 0 };
  }
  return null; // svg (handled in loadOne) / webp / anything else: not embedded
}

// <svg> figure -> PNG (resvg is installed together with the equation renderer)
async function svgToPng(buf) {
  try {
    const head = buf.toString("utf8", 0, Math.min(buf.length, 512)).trimStart();
    if (!/^(<\?xml|<svg|<!doctype svg)/i.test(head) || !/<svg[\s>]/i.test(buf.toString("utf8"))) return null;
    const mod = await import("@resvg/resvg-js");
    const Resvg = mod.Resvg || mod.default?.Resvg;
    const r = new Resvg(buf, { fitTo: { mode: "width", value: 1200 }, background: "rgba(255,255,255,0)" }).render();
    return Buffer.from(r.asPng());
  } catch { return null; }
}

/* ----------------------------------------------------------------- loading */
async function download(url) {
  // one retry: Supabase Storage occasionally answers 5xx / resets on a cold connection
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
      if (res.ok) {
        const declared = Number(res.headers.get("content-length") || 0);
        if (declared > MAX_BYTES) return null;
        return Buffer.from(await res.arrayBuffer());
      }
      if (res.status >= 400 && res.status < 500) return null; // missing / private: retrying will not help
    } catch { /* timeout / network: retry */ }
  }
  return null;
}

async function loadOne(src, hosts) {
  try {
    let buf;
    if (/^data:image\//i.test(src)) {
      const m = /^data:[^;,]+(;base64)?,(.*)$/is.exec(src);
      if (!m) return null;
      buf = m[1] ? Buffer.from(m[2], "base64") : Buffer.from(decodeURIComponent(m[2]));
    } else {
      for (const url of candidates(src)) {
        if (!isAllowed(url, hosts)) continue;
        buf = await download(url);
        if (buf && buf.length) break;
      }
      if (!buf) return null;
    }
    if (!buf.length || buf.length > MAX_BYTES) return null;
    let info = sniff(buf);
    if (!info) {
      const png = await svgToPng(buf);
      if (png) { buf = png; info = sniff(png); }
    }
    if (!info || !info.wPx || !info.hPx) return null;
    return { buf, ...info };
  } catch {
    return null;
  }
}

export async function loadImages(srcs) {
  const unique = [...new Set((srcs || []).map((s) => String(s || "").trim()).filter(Boolean))];
  const hosts = allowedHosts();
  const out = new Map();
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const src = unique[next++];
      const img = await loadOne(src, hosts);
      if (img) out.set(src, img);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker));
  return out;
}
