// lib/pdfgen/mathimg.js  (new file, server only)
//
// MathML node  ->  PNG picture of the equation (+ its size and baseline depth).
//
// WHY THIS EXISTS
//   Word equations (OMML, omml.js) are converted by LibreOffice's *Math* component. When the
//   converter has no Math module (Gotenberg images, `apt install libreoffice-writer` only,
//   minimal Docker images ...) LibreOffice silently DROPS every equation, so options that
//   are pure maths printed as an empty "a)", and inline maths vanished from questions and
//   solutions. Pictures do not depend on any converter feature, so the PDF always looks right.
//
//   MathML --(MathJax, pure JS, no browser)--> SVG (all glyphs are vector paths, no fonts needed)
//          --(resvg, prebuilt binary)--------> PNG at 300 dpi (transparent background)
//
// Nothing here ever throws to the caller: when the packages are missing or an equation cannot
// be drawn, renderMath() returns null and docx.js prints the plain-text version of the formula.

import { createRequire } from "module";
import path from "path";

let engine = null; // { convert(mathml) -> svg string, Resvg }
let initPromise = null;
let initError = null;

const cache = new Map(); // key -> result | null

// Two ways to load the packages: native ESM import first, then a plain Node require() rooted at the
// project folder (works even when the bundler rewrites dynamic imports).
async function loadPackages() {
  try {
    const [{ mathjax }, { MathML }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, resvg] = await Promise.all([
      import("mathjax-full/js/mathjax.js"),
      import("mathjax-full/js/input/mathml.js"),
      import("mathjax-full/js/output/svg.js"),
      import("mathjax-full/js/adaptors/liteAdaptor.js"),
      import("mathjax-full/js/handlers/html.js"),
      import("@resvg/resvg-js"),
    ]);
    return { mathjax, MathML, SVG, liteAdaptor, RegisterHTMLHandler, resvg };
  } catch (e1) {
    try {
      const req = createRequire(path.join(process.cwd(), "package.json"));
      return {
        mathjax: req("mathjax-full/js/mathjax.js").mathjax,
        MathML: req("mathjax-full/js/input/mathml.js").MathML,
        SVG: req("mathjax-full/js/output/svg.js").SVG,
        liteAdaptor: req("mathjax-full/js/adaptors/liteAdaptor.js").liteAdaptor,
        RegisterHTMLHandler: req("mathjax-full/js/handlers/html.js").RegisterHTMLHandler,
        resvg: req("@resvg/resvg-js"),
      };
    } catch (e2) {
      throw new Error(`import: ${e1?.message || e1}; require: ${e2?.message || e2}`);
    }
  }
}

/** Load MathJax + resvg once. Safe to call many times. Resolves true when equations can be drawn.
 *  A failed load is NOT remembered: the next request tries again (e.g. after `npm i`). */
export function prepareMath() {
  if (engine) return Promise.resolve(true);
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const { mathjax, MathML, SVG, liteAdaptor, RegisterHTMLHandler, resvg } = await loadPackages();
        const adaptor = liteAdaptor();
        RegisterHTMLHandler(adaptor);
        const doc = mathjax.document("", { InputJax: new MathML(), OutputJax: new SVG({ fontCache: "none" }) });
        const next = {
          Resvg: resvg.Resvg || resvg.default?.Resvg,
          convert(mathml) {
            const node = doc.convert(mathml, { display: false, em: 16, ex: 8, containerWidth: 80 * 16 });
            return adaptor.outerHTML(node);
          },
        };
        if (!next.Resvg) throw new Error("resvg not available");
        engine = next;
        initError = null;
        return true;
      } catch (e) {
        initError = e;
        initPromise = null; // allow a retry on the next request
        console.error("exam-pdf: equation renderer unavailable (", e?.message || e, ") -- equations will print as plain text. Run: npm i mathjax-full @resvg/resvg-js");
        return false;
      }
    })();
  }
  return initPromise;
}

export const mathRendererError = () => initError;

/* ------------------------------------------------------------ MathML node -> string */
const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => escText(s).replace(/"/g, "&quot;");
const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

export function nodeToMathml(n) {
  if (n.text !== undefined) return escText(String(n.text).replace(BAD_XML, ""));
  const attrs = Object.entries(n.attrs || {})
    .filter(([k]) => k !== "xmlns" && !k.startsWith("xmlns:") && /^[\w:-]+$/.test(k))
    .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
    .join("");
  const inner = (n.children || []).map(nodeToMathml).join("");
  const tag = /^[\w:-]+$/.test(n.tag) ? n.tag : "mrow";
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

/* ------------------------------------------------------------------- SVG -> PNG */
const DPI = 300;

function svgToResult(svgHtml, fontPt) {
  const m = /<svg\b[\s\S]*<\/svg>/.exec(svgHtml);
  if (!m) return null;
  let svg = m[0];

  const wEx = parseFloat(/\bwidth="([\d.]+)ex"/.exec(svg)?.[1]);
  const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!(wEx > 0) || !vb) return null;
  let [vbX, vbY, vbW, vbH] = vb.slice(1).map(Number);
  const vaEx = parseFloat(/vertical-align:\s*(-?[\d.]+)ex/.exec(svg)?.[1] || "0") || 0;

  // ex-per-em of this drawing (width in ex / width in em; the viewBox is 1000 units per em)
  const exPerEm = wEx / (vbW / 1000);
  const depthEm = -vaEx / exPerEm; // positive = hangs below the baseline

  // a hair of side padding so italic overhangs are never clipped
  const pad = 25;
  vbX -= pad;
  vbW += pad * 2;

  const wPt = (vbW / 1000) * fontPt;
  const hPt = (vbH / 1000) * fontPt;
  const pxW = Math.max(1, Math.round((wPt / 72) * DPI));
  const pxH = Math.max(1, Math.round((hPt / 72) * DPI));

  svg = svg
    .replace(/\bwidth="[^"]*"/, `width="${pxW}"`)
    .replace(/\bheight="[^"]*"/, `height="${pxH}"`)
    .replace(/viewBox="[^"]*"/, `viewBox="${vbX} ${vbY} ${vbW} ${vbH}"`)
    .replace(/\sstyle="[^"]*"/, "")
    .replace(/currentColor/g, "#000000")
    .replace(/(<use\b[^>]*?)\bhref=/g, "$1xlink:href=");
  if (!/xmlns:xlink=/.test(svg)) svg = svg.replace("<svg", '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');

  const png = new engine.Resvg(svg, { fitTo: { mode: "original" }, background: "rgba(255,255,255,0)" }).render().asPng();
  return { buf: Buffer.from(png), ext: "png", wPx: pxW, hPx: pxH, wPt, hPt, depthPt: Math.max(0, depthEm * fontPt) };
}

/**
 * mathNode (from html.js parseHtml) -> { buf, ext, wPx, hPx, wPt, hPt, depthPt } | null
 * `fontPt` = size of the surrounding text (the sheet body is 11 pt).
 * prepareMath() must have resolved first (otherwise this returns null).
 */
export function renderMath(mathNode, fontPt = 11) {
  if (!engine || !mathNode) return null;
  let mathml;
  try { mathml = nodeToMathml(mathNode); } catch { return null; }
  const key = `${fontPt}|${mathml}`;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  try {
    out = svgToResult(engine.convert(mathml), fontPt);
  } catch (e) {
    out = null;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, out);
  return out;
}
