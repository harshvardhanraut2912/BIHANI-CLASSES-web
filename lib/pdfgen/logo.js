// lib/pdfgen/logo.js  (new file, server only)
//
// The logo chosen in the "Create PDF" window  ->  the two pictures the sheet needs:
//   header     the logo itself, printed in the top-left corner of the first page
//   watermark  the same logo, faded and slightly blurred, centred behind the text of every page
//
// The fading + blur are "baked" into a PNG here (resvg, which is installed with the equation
// renderer), so the result looks the same in Word, LibreOffice and Gotenberg -- no converter
// feature (picture transparency, effects) is needed.
//
// Input: a data:image/... URL (the browser already shrinks it to <= 700 px). Never throws:
// returns null when the logo cannot be used, and the sheet then prints without it.

import { loadImages } from "./images.js";

const MAX_DATA_URL = 4 * 1024 * 1024; // characters

const WM_SIZE = 1000; // watermark canvas (px)
const WM_FIT = 780; // the logo is fitted inside this box, leaving room for the blur
const WM_OPACITY = 0.13; // faint
const WM_BLUR = 5; // gaussian blur (px of the 1000 px canvas): soft, still recognisable

async function bakeWatermark(img) {
  try {
    const mod = await import("@resvg/resvg-js");
    const Resvg = mod.Resvg || mod.default?.Resvg;
    if (!Resvg) return null;
    const k = Math.min(WM_FIT / img.wPx, WM_FIT / img.hPx);
    const w = Math.round(img.wPx * k);
    const h = Math.round(img.hPx * k);
    const x = Math.round((WM_SIZE - w) / 2);
    const y = Math.round((WM_SIZE - h) / 2);
    const href = `data:image/${img.ext};base64,${img.buf.toString("base64")}`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WM_SIZE}" height="${WM_SIZE}" viewBox="0 0 ${WM_SIZE} ${WM_SIZE}">` +
      `<defs><filter id="b" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${WM_BLUR}"/></filter></defs>` +
      `<g opacity="${WM_OPACITY}" filter="url(#b)"><image x="${x}" y="${y}" width="${w}" height="${h}" xlink:href="${href}"/></g></svg>`;
    const png = Buffer.from(new Resvg(svg, { fitTo: { mode: "original" }, background: "rgba(255,255,255,0)" }).render().asPng());
    return { buf: png, ext: "png", wPx: WM_SIZE, hPx: WM_SIZE };
  } catch {
    return null;
  }
}

/** dataUrl -> { header: {buf, ext, wPx, hPx}, watermark: {...} | null } | null */
export async function prepareLogo(dataUrl) {
  try {
    const src = String(dataUrl || "");
    if (!/^data:image\//i.test(src) || src.length > MAX_DATA_URL) return null;
    const map = await loadImages([src]);
    const img = map.get(src);
    if (!img || !["png", "jpeg", "gif"].includes(img.ext)) return null;
    return { header: img, watermark: await bakeWatermark(img) };
  } catch {
    return null;
  }
}
