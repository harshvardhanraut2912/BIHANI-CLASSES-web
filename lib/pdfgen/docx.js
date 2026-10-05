// lib/pdfgen/docx.js  (new file, server only)
//
// Builds the exam sheet as a real .docx with the SAME architecture as the sample
// "Question Paper" / "Teacher Copy" files:
//
//   title                                   (centred, bold, 24pt)
//   Date / Time / Marks  .... TEST ID / SUBJECT   (left block + right-aligned block)
//   chapter line + rule
//   -- continuous section break, 1 column --
//   ONE fixed-layout table, 9-column grid, zero cell margins:
//        "Single Correct Answer Type"
//        N.  | question text
//            | a) .. b) .. c) .. d) ..   (4 / 2 / 1 per row, decided by option length)
//        Ans.| c                          (teacher copy only)
//        Sol.:| solution                  (teacher copy only)
//   -- section ends here: 1 or 2 columns with the vertical separator line --
//   diagonal watermark (header) + "Page | N" footer (footer)
//
// The static parts (styles, theme, watermark, footer ...) come from templateParts.js,
// i.e. straight from the sample files. Content rows are generated here.
//
// EQUATIONS: paper.mathMode = "image" (default, used for PDF) draws every <math> as a picture
// (mathimg.js) so the result never depends on LibreOffice having its Math module; "omml" writes real,
// editable Word equations (used when the admin downloads the .docx).
//
// PART 2: `runXml` turns <math> into real Word equations (omml.js) and <img> into embedded
// pictures (images are fetched beforehand by images.js and passed in as `paper.images`),
// sized to the 1- or 2-column width. The student copy can end with an "Answer Key" page and
// a "Hints and Solutions" section (paper.appendKey), like the sample Question Paper.

import JSZip from "jszip";
import * as T from "./templateParts.js";
import { htmlToParagraphs, plainLength } from "./html.js";
import { mathmlToOmml } from "./omml.js";
import { renderMath } from "./mathimg.js";

/* ------------------------------------------------------------- xml helpers */
const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const esc = (s) => String(s ?? "").replace(BAD_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

const HEAD_FONT = '<w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/>';
const MATH_FONT = '<w:rFonts w:ascii="Cambria Math" w:eastAsiaTheme="minorEastAsia" w:hAnsi="Cambria Math"/>';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

// relationship ids of the static parts (document.xml.rels below)
const RID = { hdrEven: "rIdH1", hdrDefault: "rIdH2", hdrFirst: "rIdH3", footer: "rIdF1" };

/* ------------------------------------------------------------------- runs */
// Per-build state (set synchronously by buildDocx just before the XML is generated).
let CTX = null;

const PAGE_TEXT_WIDTH = 11907 - 1440; // A4 width minus the two 0.5" margins (twips)
const COL_GAP = 113;
const BODY_PT = 11; // body text size of the sheet (styles.xml: 22 half-points)
const LOGO_MAX_H = 880; // twips (0.61 in): the logo is about as tall as the title block
const LOGO_MAX_W = 1700; // twips (1.18 in)
const MAX_FIG_HEIGHT = 7200; // twips (5 in): a picture never fills a page on its own

// width (twips) of one text column
const columnWidth = (columns) => (columns === 2 ? Math.floor((PAGE_TEXT_WIDTH - COL_GAP) / 2) : PAGE_TEXT_WIDTH);

// css length -> twips ("9.72em" in the question bank = 16px per em, as on the website)
function cssLengthTwips(style, prop) {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([\\d.]+)\\s*(em|rem|px|pt|in|cm|mm)?\\s*(?:;|$)`, "i").exec(style || "");
  if (!m) return 0;
  const v = parseFloat(m[1]);
  if (!(v > 0)) return 0;
  switch ((m[2] || "px").toLowerCase()) {
    case "em": case "rem": return v * 240;
    case "pt": return v * 20;
    case "in": return v * 1440;
    case "cm": return (v * 1440) / 2.54;
    case "mm": return (v * 1440) / 25.4;
    default: return v * 15; // px
  }
}

// one inline <w:drawing> run. `rpr` = optional run properties (baseline shift for equations)
function drawingRun(key, wT, hT, alt, rpr = "") {
  const cx = Math.max(1, Math.round(wT * 635));
  const cy = Math.max(1, Math.round(hT * 635));
  const id = CTX.nextId++;
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Picture ${id}" descr="${escAttr(alt)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${escAttr(key.file)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${key.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

// register a picture once, whatever the number of times it is used
function mediaKey(id, img) {
  let key = CTX.media.get(id);
  if (!key) {
    const n = CTX.media.size + 1;
    key = { rid: `rIdImg${n}`, file: `image${n}.${img.ext}`, img };
    CTX.media.set(id, key);
  }
  return key;
}

// <img> -> inline picture. Returns "" when the picture could not be loaded (caller prints [figure]).
function figureXml(r, maxW) {
  const img = CTX?.images?.get(r.src);
  if (!img) return "";
  const key = mediaKey(r.src, img);

  // natural size in twips: html width/height attribute > css width/height (the bank uses
  // style="width:9.72em") > embedded dpi > 96 dpi
  const attrW = parseFloat(r.width);
  const attrH = parseFloat(r.height);
  const cssW = cssLengthTwips(r.style, "width");
  const cssH = cssLengthTwips(r.style, "height");
  let wT;
  if (attrW > 0) wT = attrW * 15;
  else if (cssW > 0) wT = cssW;
  else if (attrH > 0) wT = (attrH * 15 * img.wPx) / img.hPx;
  else if (cssH > 0) wT = (cssH * img.wPx) / img.hPx;
  else if (img.dpi > 20) wT = (img.wPx / img.dpi) * 1440;
  else wT = img.wPx * 15;
  let hT = (wT * img.hPx) / img.wPx;

  const scale = Math.min(1, maxW / wT, MAX_FIG_HEIGHT / hT);
  return drawingRun(key, wT * scale, hT * scale, r.alt || "figure");
}

// ---- equations wider than the column (the bank sometimes puts a whole sentence inside <math>) ----
const mathKids = (n) => (n.children || []).filter((c) => c.text === undefined || c.text.trim() !== "");
const wrapMath = (nodes) => ({ tag: "math", attrs: {}, children: nodes });
const widthT = (nodes) => { const m = renderMath(wrapMath(nodes), BODY_PT); return m ? m.wPt * 20 : 0; };
const TEXT_TOKENS = new Set(["mi", "mtext", "mn", "mo", "ms"]);
const tokenText = (n) => (n.text !== undefined ? n.text : (n.children || []).map(tokenText).join(""));

// cut an over-long text token into word-wrapped pieces that each fit `maxW`
function splitToken(tok, maxW) {
  const words = tokenText(tok).trim().split(/\s+/);
  if (words.length < 2) return [tok];
  const mk = (t) => ({ tag: tok.tag, attrs: tok.attrs || {}, children: [{ text: t }] });
  const out = [];
  let cur = "";
  words.forEach((w) => {
    const trial = cur ? `${cur} ${w}` : w;
    if (cur && widthT([mk(trial)]) > maxW) { out.push(mk(cur)); cur = w; } else cur = trial;
  });
  if (cur) out.push(mk(cur));
  return out;
}

// -> array of renderMath() results whose widths fit `maxW` where that is possible
function mathPieces(node, maxW) {
  const whole = renderMath(node, BODY_PT);
  if (!whole) return [];
  if (whole.wPt * 20 <= maxW * 1.15) return [whole];

  let kids = mathKids(node);
  while (kids.length === 1 && ["mrow", "mstyle"].includes(kids[0].tag)) kids = mathKids(kids[0]);
  if (!kids.length) return [whole];

  const flat = [];
  kids.forEach((k) => {
    if (TEXT_TOKENS.has(k.tag) && widthT([k]) > maxW) flat.push(...splitToken(k, maxW));
    else flat.push(k);
  });
  if (flat.length < 2) return [whole];

  const groups = [];
  let cur = [];
  flat.forEach((k) => {
    const trial = [...cur, k];
    if (cur.length && widthT(trial) > maxW) { groups.push(cur); cur = [k]; } else cur = trial;
  });
  if (cur.length) groups.push(cur);
  const pieces = groups.map((g) => renderMath(wrapMath(g), BODY_PT)).filter(Boolean);
  return pieces.length ? pieces : [whole];
}

function onePicture(m, maxW, alt) {
  const key = mediaKey(m, m);
  let wT = m.wPt * 20;
  let hT = m.hPt * 20;
  const scale = Math.min(1, maxW / wT);
  wT *= scale;
  hT *= scale;
  const drop = Math.round(m.depthPt * scale * 2); // half-points below the text baseline
  return drawingRun(key, wT, hT, alt || "equation", drop > 0 ? `<w:position w:val="-${drop}"/>` : "");
}

// <math> -> equation picture(s) (see mathimg.js). "" when it cannot be drawn.
function mathPictureXml(r, maxW) {
  const pieces = mathPieces(r.math, maxW);
  if (!pieces.length) return "";
  const gap = '<w:r><w:t xml:space="preserve"> </w:t></w:r>'; // line-break opportunity between pieces
  return pieces.map((m) => onePicture(m, maxW, r.t)).join(gap);
}

function runXml(r, font, maxW) {
  if (r.br) return "<w:r><w:br/></w:r>";
  if (r.fig) {
    return figureXml(r, maxW) || `<w:r><w:rPr>${font}<w:i/><w:iCs/><w:color w:val="808080"/></w:rPr><w:t>[figure]</w:t></w:r>`;
  }
  if (r.math) {
    if (CTX?.mathMode === "omml") {
      const omml = mathmlToOmml(r.math);
      if (omml) return omml;
    } else {
      const pic = mathPictureXml(r, maxW);
      if (pic) return pic;
    }
    // No picture / Word equation possible: print a readable text version of the formula, with real
    // subscripts and superscripts (r.fb), and remember it so the admin can be told.
    if (CTX) CTX.mathFallbacks++;
    if (r.fb && r.fb.length) {
      return r.fb.map((x) => runXml({ ...x, b: x.b || r.b, u: r.u }, font, maxW)).join("");
    }
  }
  const rpr = [font];
  if (r.b) rpr.push("<w:b/><w:bCs/>");
  if (r.i) rpr.push("<w:i/><w:iCs/>");
  if (r.u) rpr.push('<w:u w:val="single"/>');
  if (r.sup) rpr.push('<w:vertAlign w:val="superscript"/>');
  else if (r.sub) rpr.push('<w:vertAlign w:val="subscript"/>');
  return `<w:r><w:rPr>${rpr.join("")}</w:rPr><w:t xml:space="preserve">${esc(r.t)}</w:t></w:r>`;
}

/* ------------------------------------------------------------- table bits */
const CELL_MAR = '<w:tcMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar>';

const tc = (w, span, inner, vAlign) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="pct"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}${CELL_MAR}${vAlign ? `<w:vAlign w:val="${vAlign}"/>` : ""}</w:tcPr>${inner}</w:tc>`;

const tr = (cells, { split = false } = {}) => `<w:tr>${split ? "" : "<w:trPr><w:cantSplit/></w:trPr>"}${cells}</w:tr>`;

// paragraph(s) of rich content (question / option / solution html) inside a cell
// `frac` = share of the column the cell occupies (used to size pictures)
function contentParas(html, { keepNext = false, before = 0, frac = 0.9 } = {}) {
  const maxW = Math.floor(columnWidth(CTX?.columns) * frac) - 40;
  let paras = htmlToParagraphs(html);
  if (!paras.length) paras = [[]];
  return paras
    .map((runs, i) => {
      const spacing = `<w:spacing${i === 0 && before ? ` w:before="${before}"` : ""} w:after="0"/>`;
      return `<w:p><w:pPr>${keepNext ? "<w:keepNext/>" : ""}${spacing}<w:contextualSpacing/><w:rPr>${MATH_FONT}</w:rPr></w:pPr>${runs.map((r) => runXml(r, MATH_FONT, maxW)).join("")}</w:p>`;
    })
    .join("");
}

// short bold/plain label in the sample's theme font ("1.", "a)", "Ans.", "Sol.:")
function labelPara(text, { bold = false, keepNext = false, before = 0 } = {}) {
  const b = bold ? "<w:b/><w:bCs/>" : "";
  const spacing = `<w:spacing${before ? ` w:before="${before}"` : ""} w:after="0"/>`;
  const run = text ? `<w:r><w:rPr>${HEAD_FONT}${b}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>` : "";
  return `<w:p><w:pPr>${keepNext ? "<w:keepNext/>" : ""}${spacing}<w:contextualSpacing/><w:rPr>${HEAD_FONT}${b}</w:rPr></w:pPr>${run}</w:p>`;
}

const EMPTY_NUM_CELL = (keepNext) => tc(440, 1, labelPara("", { keepNext }));

/* -------------------------------------------------------- option layout */
const LETTERS = ["A", "B", "C", "D"];
const optionHtml = (options, L) => options?.[L] ?? options?.[L.toLowerCase()] ?? "";

// 4 across when all options are short, 2 across when medium, otherwise one per row
// (same three layouts the sample uses). Pictures / multi-line options always stack.
function layoutFor(options, columns) {
  // an equation drawn as a picture is as wide as its picture (~4.4 pt per character of option text)
  const measure = (r) => {
    if (!r.math || CTX?.mathMode === "omml") return null;
    const m = renderMath(r.math, BODY_PT);
    return m ? Math.ceil(m.wPt / 4.4) : null;
  };
  const info = LETTERS.map((L) => plainLength(optionHtml(options, L), measure));
  if (info.some((i) => i.hasFig || i.lines > 1)) return 1;
  const max = Math.max(...info.map((i) => i.length));
  const [lim4, lim2] = columns === 2 ? [11, 28] : [26, 60];
  return max <= lim4 ? 4 : max <= lim2 ? 2 : 1;
}

function optionRows(options, columns, keepNextOnLast) {
  const mode = layoutFor(options, columns);
  const lab = (L, keep) => labelPara(`${L.toLowerCase()})`, { keepNext: keep });
  const rows = [];
  if (mode === 4) {
    const keep = keepNextOnLast;
    rows.push(tr(EMPTY_NUM_CELL(keep) + LETTERS.map((L) => tc(230, 1, lab(L, keep), "top") + tc(910, 1, contentParas(optionHtml(options, L), { keepNext: keep, frac: 0.17 }), "top")).join("")));
  } else if (mode === 2) {
    for (let i = 0; i < 4; i += 2) {
      const keep = i === 0 ? true : keepNextOnLast;
      rows.push(tr(EMPTY_NUM_CELL(keep) + [LETTERS[i], LETTERS[i + 1]].map((L) => tc(230, 1, lab(L, keep), "top") + tc(2050, 3, contentParas(optionHtml(options, L), { keepNext: keep, frac: 0.4 }), "top")).join("")));
    }
  } else {
    LETTERS.forEach((L, i) => {
      const keep = i < 3 ? true : keepNextOnLast;
      rows.push(tr(EMPTY_NUM_CELL(keep) + tc(230, 1, lab(L, keep), "top") + tc(4330, 7, contentParas(optionHtml(options, L), { keepNext: keep, frac: 0.84 }), "top")));
    });
  }
  return rows;
}

/* ------------------------------------------------------ question table */
function questionTable(paper) {
  const teacher = paper.copy === "teacher";
  const grid = [440, 230, 910, 230, 910, 230, 910, 230, 910].map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const rows = [];

  rows.push(
    tr(tc(5000, 9, `<w:p><w:pPr><w:keepNext/><w:contextualSpacing/><w:jc w:val="center"/><w:rPr>${HEAD_FONT}<w:b/></w:rPr></w:pPr><w:r><w:rPr>${HEAD_FONT}<w:b/></w:rPr><w:t>${esc(paper.sectionTitle)}</w:t></w:r></w:p>`, "top"))
  );

  paper.questions.forEach((q, i) => {
    const before = i === 0 ? 0 : 100;
    rows.push(
      tr(tc(440, 1, labelPara(`${q.num}.`, { keepNext: true, before })) + tc(4560, 8, contentParas(q.html, { keepNext: true, before })))
    );
    rows.push(...optionRows(q.options, paper.columns, teacher));
    if (teacher) {
      rows.push(tr(tc(440, 1, labelPara("Ans.", { bold: true, keepNext: true })) + tc(4560, 8, labelPara(q.answer, { keepNext: true }))));
      rows.push(tr(tc(440, 1, labelPara("Sol.:", { bold: true })) + tc(4560, 8, contentParas(q.solutionHtml)), { split: true }));
    }
  });

  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows.join("")}</w:tbl>`;
}

/* ----------------------------------------------------------- page header */
const hp = (inner, { jc, tabs = "", sz = 0, after = 0, ind = 0, line = "" } = {}) =>
  `<w:p><w:pPr>${tabs}<w:spacing${after ? ` w:after="${after}"` : ""} ${line || 'w:line="240" w:lineRule="auto"'}/><w:contextualSpacing/>${ind ? `<w:ind w:left="${ind}" w:right="${ind}"/>` : ""}${jc ? `<w:jc w:val="${jc}"/>` : ""}<w:rPr>${HEAD_FONT}${sz ? `<w:sz w:val="${sz}"/>` : ""}</w:rPr></w:pPr>${inner}</w:p>`;

const hr = (text, bold = false) => `<w:r><w:rPr>${HEAD_FONT}${bold ? "<w:b/><w:bCs/>" : ""}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const TAB = `<w:r><w:rPr>${HEAD_FONT}</w:rPr><w:tab/></w:r>`;

// "Date : 3/10/2026 ............ TEST ID: 23"
function infoRow(left, right) {
  const tabs = `<w:tabs><w:tab w:val="left" w:pos="900"/><w:tab w:val="right" w:pos="${PAGE_TEXT_WIDTH}"/></w:tabs>`;
  let inner = "";
  if (left) inner += hr(left.label, true) + TAB + hr(": ", true) + hr(left.value);
  if (right) inner += TAB + (left ? "" : TAB) + hr(right, true);
  return hp(inner, { tabs });
}

// floating picture pinned to the top-left corner of the text area (does not move the text)
function logoAnchorRun(logo) {
  const cx = Math.round(logo.wT * 635);
  const cy = Math.round(logo.hT * 635);
  return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="margin"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${CTX.nextId++}" name="Logo" descr="Logo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${CTX.nextId++}" name="${logo.file}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${logo.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
}

// centred picture behind the text of every page (page header part; image comes from header*.xml.rels)
const WM_TWIPS = 7000; // 4.9 in square
function watermarkHeader(rid) {
  const cx = WM_TWIPS * 635;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${NS}><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:align>center</wp:align></wp:positionH><wp:positionV relativeFrom="page"><wp:align>center</wp:align></wp:positionV><wp:extent cx="${cx}" cy="${cx}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="9001" name="Watermark" descr="Watermark"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="9002" name="watermark.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cx}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p></w:hdr>`;
}

function headerBlock(paper) {
  const titleSz = paper.title.length > 40 ? 36 : paper.title.length > 28 ? 40 : 48;
  const out = [];
  const logo = CTX?.logo; // { rid, wT, hT } -- printed in the top-left corner, title stays centred
  const logoRun = logo ? logoAnchorRun(logo) : "";
  const indent = logo ? logo.wT + 140 : 0; // equal space on both sides keeps the title centred
  out.push(hp(logoRun + `<w:r><w:rPr>${HEAD_FONT}<w:b/><w:bCs/><w:sz w:val="${titleSz}"/></w:rPr><w:t xml:space="preserve">${esc(paper.title)}</w:t></w:r>`, { jc: "center", sz: titleSz, ind: indent }));
  // spacer under the title; with a logo it is tall enough that the logo never reaches the Date row
  out.push(hp(`<w:r><w:rPr>${HEAD_FONT}<w:b/><w:bCs/><w:sz w:val="36"/></w:rPr></w:r>`, { jc: "center", sz: 36, line: logo ? 'w:line="620" w:lineRule="atLeast"' : "" }));

  const left = [{ label: "Date", value: paper.dateText }];
  if (paper.timeText) left.push({ label: "Time", value: paper.timeText });
  left.push({ label: "Marks", value: paper.marksText });
  const right = [];
  if (paper.testId) right.push(`TEST ID: ${paper.testId}`);
  if (paper.subjectText) right.push(paper.subjectText);
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++) out.push(infoRow(left[i], right[i]));

  if (paper.chapterLine) out.push(hp(hr(paper.chapterLine), { jc: "center", after: 60 }));
  // the horizontal rule under the heading (a paragraph border: no floating shape to drift)
  out.push(`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="10" w:space="1" w:color="000000"/></w:pBdr><w:spacing w:after="120" w:line="120" w:lineRule="exact"/><w:rPr><w:sz w:val="4"/></w:rPr></w:pPr></w:p>`);
  return out.join("");
}

/* -------------------------------------------------------------- sections */
const sectPr = (cols, type = "continuous") => {
  const colsXml = cols === 2 ? '<w:cols w:num="2" w:sep="1" w:space="113"/>' : '<w:cols w:space="720"/>';
  return `<w:sectPr><w:headerReference w:type="even" r:id="${RID.hdrEven}"/><w:headerReference w:type="default" r:id="${RID.hdrDefault}"/><w:footerReference w:type="default" r:id="${RID.footer}"/><w:headerReference w:type="first" r:id="${RID.hdrFirst}"/><w:type w:val="${type}"/><w:pgSz w:w="11907" w:h="16839" w:code="9"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="720" w:footer="113" w:gutter="0"/>${colsXml}<w:docGrid w:linePitch="360"/></w:sectPr>`;
};

/* ------------------------------------------------- answer key + solutions */
const sectionHeading = (text, { pageBreak = false } = {}) =>
  `<w:p><w:pPr><w:keepNext/>${pageBreak ? "<w:pageBreakBefore/>" : ""}<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="000000"/></w:pBdr><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/><w:rPr>${HEAD_FONT}<w:b/><w:bCs/><w:sz w:val="28"/></w:rPr></w:pPr><w:r><w:rPr>${HEAD_FONT}<w:b/><w:bCs/><w:sz w:val="28"/></w:rPr><w:t>${esc(text)}</w:t></w:r></w:p>`;

// "1. c   2. a   3. d ..." -- five pairs per row
function answerKeyTable(questions) {
  const PER_ROW = 5;
  const grid = Array.from({ length: PER_ROW }, () => [450, 550]).flat().map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const rows = [];
  for (let i = 0; i < questions.length; i += PER_ROW) {
    const cells = [];
    for (let j = 0; j < PER_ROW; j++) {
      const q = questions[i + j];
      cells.push(tc(450, 1, labelPara(q ? `${q.num}.` : "", { bold: true, before: 40 })) + tc(550, 1, labelPara(q ? q.answer : "", { before: 40 })));
    }
    rows.push(tr(cells.join("")));
  }
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows.join("")}</w:tbl>`;
}

// N. | Ans. c  +  full solution   (rows may break across pages / columns)
function solutionsTable(questions) {
  const grid = [440, 4560].map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const rows = questions.map((q, i) => {
    const before = i === 0 ? 0 : 100;
    // no keep-with-next in here: a very long solution must be free to run on into the next column / page
    const inner = labelPara(`Ans. ${q.answer}`, { bold: true }) + contentParas(q.solutionHtml);
    return tr(tc(440, 1, labelPara(`${q.num}.`, { before })) + tc(4560, 1, inner), { split: true });
  });
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows.join("")}</w:tbl>`;
}

const tinyPara = (sect = "") =>
  `<w:p><w:pPr><w:spacing w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr>${sect}</w:pPr></w:p>`;

function documentXml(paper) {
  const cols = paper.columns === 2 ? 2 : 1;
  let body =
    headerBlock(paper) +
    `<w:p><w:pPr>${sectPr(1)}</w:pPr></w:p>` + // end of the header section (1 column)
    questionTable(paper);

  if (paper.appendKey) {
    body +=
      tinyPara(sectPr(cols)) + // end of the question section (1 or 2 columns + separator line)
      sectionHeading("Answer Key") +
      answerKeyTable(paper.questions) +
      sectionHeading("Hints and Solutions") +
      tinyPara(sectPr(1, "nextPage")) + // the key page: 1 column, starts on a new page
      solutionsTable(paper.questions) +
      tinyPara() +
      sectPr(cols); // solutions: 1 or 2 columns, continues on the same page
  } else {
    body += tinyPara() + sectPr(cols); // the question section: 1 or 2 columns + separator line
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body}</w:body></w:document>`;
}

/* --------------------------------------------------------------- package */
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const rel = (id, type, target) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/webSettings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/header3.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel("rId1", "officeDocument", "word/document.xml")}<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>${rel("rId3", "extended-properties", "docProps/app.xml")}</Relationships>`;

const docRels = (media, logo) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[
  rel("rIdS", "styles", "styles.xml"),
  rel("rIdSet", "settings", "settings.xml"),
  rel("rIdWeb", "webSettings", "webSettings.xml"),
  rel("rIdFont", "fontTable", "fontTable.xml"),
  rel("rIdTheme", "theme", "theme/theme1.xml"),
  rel("rIdNum", "numbering", "numbering.xml"),
  rel("rIdFn", "footnotes", "footnotes.xml"),
  rel("rIdEn", "endnotes", "endnotes.xml"),
  rel(RID.hdrEven, "header", "header1.xml"),
  rel(RID.hdrDefault, "header", "header2.xml"),
  rel(RID.hdrFirst, "header", "header3.xml"),
  rel(RID.footer, "footer", "footer1.xml"),
  ...(logo ? [rel(logo.rid, "image", `media/${logo.file}`)] : []),
  ...[...media.values()].map((m) => rel(m.rid, "image", `media/${m.file}`)),
].join("")}</Relationships>`;

const coreXml = (title) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>Bihani Classes</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`;

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application></Properties>`;

/**
 * paper = {
 *   copy: "teacher" | "student", columns: 1 | 2,
 *   title, dateText, timeText?, testId?, marksText, subjectText, chapterLine,
 *   sectionTitle ("Single Correct Answer Type"), watermark,
 *   questions: [{ num, html, options: {A,B,C,D}, answer, solutionHtml }],
 *   images?: Map(src -> { buf, ext, wPx, hPx, dpi })     (from images.js; missing -> "[figure]")
 *   mathMode?: "image" (default: equations drawn as pictures, PDF-safe) | "omml" (editable Word equations)
 *   appendKey?: boolean       add "Answer Key" + "Hints and Solutions" after the questions (the admin window no longer uses it: student copies are questions only)
 *   logo?: { header, watermark }   from logo.js: top-left logo + faded blurred logo watermark (replaces the text watermark)
 * }
 * returns a Buffer (.docx)
 */
export async function buildDocx(paper) {
  const zip = new JSZip();
  const header = T.HEADER.replace("{{WATERMARK}}", escAttr(paper.watermark || ""));

  // Generate the body synchronously with this build's state, then drop it again.
  // logo (from logo.js): top-left picture in the body + faded picture behind the text in the headers
  const logoIn = paper.logo?.header || null;
  const wmIn = paper.logo?.watermark || null;
  let logo = null;
  if (logoIn) {
    const k = Math.min(LOGO_MAX_H / logoIn.hPx, LOGO_MAX_W / logoIn.wPx);
    logo = { rid: "rIdLogo", file: `logo.${logoIn.ext}`, wT: Math.round(logoIn.wPx * k), hT: Math.round(logoIn.hPx * k) };
  }
  CTX = { columns: paper.columns === 2 ? 2 : 1, mathMode: paper.mathMode === "omml" ? "omml" : "image", images: paper.images || new Map(), media: new Map(), nextId: 100, mathFallbacks: 0, logo };
  let documentBody;
  let media;
  let mathFallbacks = 0;
  try {
    documentBody = documentXml(paper);
    media = CTX.media;
    mathFallbacks = CTX.mathFallbacks;
  } finally {
    CTX = null;
  }

  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", ROOT_RELS);
  zip.file("docProps/core.xml", coreXml(paper.title));
  zip.file("docProps/app.xml", APP_XML);
  zip.file("word/document.xml", documentBody);
  zip.file("word/_rels/document.xml.rels", docRels(media, logo));
  media.forEach((m) => zip.file(`word/media/${m.file}`, m.img.buf));
  if (logo) zip.file(`word/media/${logo.file}`, logoIn.buf);
  zip.file("word/styles.xml", T.STYLES);
  zip.file("word/settings.xml", T.SETTINGS);
  zip.file("word/webSettings.xml", T.WEB_SETTINGS);
  zip.file("word/fontTable.xml", T.FONT_TABLE);
  zip.file("word/numbering.xml", T.NUMBERING);
  zip.file("word/footnotes.xml", T.FOOTNOTES);
  zip.file("word/endnotes.xml", T.ENDNOTES);
  zip.file("word/theme/theme1.xml", T.THEME);
  if (wmIn) {
    // logo watermark replaces the diagonal text watermark
    const wmHeader = watermarkHeader("rIdWm");
    const wmRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel("rIdWm", "image", "media/watermark.png")}</Relationships>`;
    ["header1", "header2", "header3"].forEach((h) => {
      zip.file(`word/${h}.xml`, wmHeader);
      zip.file(`word/_rels/${h}.xml.rels`, wmRels);
    });
    zip.file("word/media/watermark.png", wmIn.buf);
  } else {
    zip.file("word/header1.xml", header);
    zip.file("word/header2.xml", header);
    zip.file("word/header3.xml", header);
  }
  zip.file("word/footer1.xml", T.FOOTER);

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  buf.mathFallbacks = mathFallbacks; // equations printed as plain text (0 = every equation was drawn)
  return buf;
}
