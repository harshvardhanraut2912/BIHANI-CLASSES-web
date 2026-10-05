// lib/pdfgen/avatars.js  (new file, server only)
//
// Fetches the students' profile pictures for the leaderboard PDF.
//
//   loadAvatars(urls)  ->  Map<url, { buf, ext: "jpeg" | "png" }>      (failures are simply absent)
//
// pdfkit can only embed PNG and JPEG, and a 4000 px phone selfie would make the PDF huge. So when
// `sharp` is available (Next.js installs it for image optimisation) every picture is cropped to a
// 160 x 160 square JPEG first -- any input format works (webp, avif, gif, png ...) and the file stays
// tiny. Without sharp, PNG / JPEG pictures are used as they are and the rest show initials.
//
// SAFETY (SSRF rule, same idea as lib/pdfgen/images.js): only https URLs on allow-listed hosts are
// fetched -- Google profile photos (*.googleusercontent.com), Supabase Storage, the host of
// NEXT_PUBLIC_SUPABASE_URL and anything listed in AVATAR_HOSTS / PDF_IMAGE_HOSTS (comma separated).
// Never throws: a slow, missing or broken picture just means "initials circle" for that student.

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const CONCURRENCY = 8;
const MAX_URLS = 600; // a leaderboard PDF never needs more pictures than this
const SIDE = 160; // px of the stored square

const GOOGLE_HOST = /(^|\.)(googleusercontent\.com|ggpht\.com)$/i;
const SUPABASE_HOST = /(^|\.)supabase\.(co|in)$/i;

function extraHosts() {
  const set = new Set();
  try { set.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host.toLowerCase()); } catch { /* not configured */ }
  `${process.env.AVATAR_HOSTS || ""},${process.env.PDF_IMAGE_HOSTS || ""}`
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .forEach((h) => set.add(h));
  return set;
}

function allowed(url, hosts) {
  const host = url.host.toLowerCase();
  const own = hosts.has(host);
  if (url.protocol !== "https:" && !(own && url.protocol === "http:")) return false; // http only for your own server
  if (own) return true;
  if (GOOGLE_HOST.test(url.hostname)) return true;
  return SUPABASE_HOST.test(url.hostname) && url.pathname.startsWith("/storage/v1/");
}

function toUrl(raw) {
  const src = String(raw || "").trim();
  if (!src) return null;
  try {
    if (/^\/\//.test(src)) return new URL(`https:${src}`);
    if (/^https?:\/\//i.test(src)) return new URL(src);
    // a path inside the current Supabase project
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (/^\/?storage\/v1\//i.test(src)) return new URL(src.startsWith("/") ? src : `/${src}`, base);
  } catch { /* fall through */ }
  return null;
}

// Google serves any size: ask for a small one (...=s96-c  ->  ...=s192-c)
function sized(url) {
  if (GOOGLE_HOST.test(url.hostname)) {
    const u = new URL(url.toString());
    u.pathname = u.pathname.replace(/=s\d+(-c)?$/i, "=s192-c");
    if (u.searchParams.has("sz")) u.searchParams.set("sz", "192");
    return u;
  }
  return url;
}

async function download(url, hosts) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
        redirect: "follow",
        headers: { Accept: "image/jpeg,image/png,image/*;q=0.8" },
      });
      if (res.url) {
        try { if (!allowed(new URL(res.url), hosts)) return null; } catch { return null; } // redirected somewhere else
      }
      if (res.ok) {
        if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        return buf.length && buf.length <= MAX_BYTES ? buf : null;
      }
      if (res.status >= 400 && res.status < 500) return null; // missing / private: retrying will not help
    } catch { /* timeout / network: retry once */ }
  }
  return null;
}

let sharpPromise = null;
function getSharp() {
  if (!sharpPromise) {
    const name = "sharp"; // not a literal: the build must not fail on machines where sharp is absent
    sharpPromise = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ name)
      .then((m) => m.default || m)
      .catch(() => null);
  }
  return sharpPromise;
}

function kind(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  return null;
}

async function normalise(buf) {
  const sharp = await getSharp();
  if (sharp) {
    try {
      const out = await sharp(buf, { failOn: "none" })
        .rotate() // respect the phone's orientation flag
        .resize(SIDE, SIDE, { fit: "cover" })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 82 })
        .toBuffer();
      return { buf: out, ext: "jpeg" };
    } catch { /* fall back to the raw bytes below */ }
  }
  const k = kind(buf);
  return k ? { buf, ext: k } : null;
}

export async function loadAvatars(urls) {
  const out = new Map();
  const unique = [...new Set((urls || []).map((u) => String(u || "").trim()).filter(Boolean))].slice(0, MAX_URLS);
  if (!unique.length) return out;
  const hosts = extraHosts();
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const raw = unique[next++];
      try {
        const url = toUrl(raw);
        if (!url || !allowed(url, hosts)) continue;
        const buf = await download(sized(url), hosts);
        if (!buf) continue;
        const img = await normalise(buf);
        if (img) out.set(raw, img);
      } catch { /* this student shows initials */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker));
  return out;
}
