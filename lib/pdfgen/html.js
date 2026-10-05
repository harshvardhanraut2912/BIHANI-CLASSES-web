// lib/pdfgen/html.js  (new file, server only)
//
// question_html / options / solution_html  ->  paragraphs of formatted runs.
// No dependencies: a tiny tolerant HTML parser (also understands the inline
// MathML the question bank uses) plus a walker that turns the tree into
//   paragraphs = [ [ run, run, ... ], [ ... ] ]
//   run        = { t, b, i, u, sup, sub }            text
//              | { br: true }                         line break
//              | { fig: true, src }                   <img>   (Part 2 embeds the picture)
//              | { math: <node>, fb: [runs] }         <math>  (picture / Word equation; fb = readable
//                                                              text runs with real sub/superscripts)
//
// PART 2: docx.js turns { math } runs into real Word equations (omml.js) and { fig } runs into
// embedded pictures (images.js). The plain-text version of the math (r.t) is kept only as the
// fallback when an equation cannot be converted.

const VOID = new Set(["br", "img", "hr", "input", "meta", "link", "col", "mspace"]);
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", minus: "\u2212", times: "\u00d7", divide: "\u00f7", plusmn: "\u00b1", deg: "\u00b0", le: "\u2264", ge: "\u2265", ne: "\u2260", pi: "\u03c0", theta: "\u03b8", alpha: "\u03b1", beta: "\u03b2", gamma: "\u03b3", delta: "\u03b4", lambda: "\u03bb", mu: "\u03bc", sigma: "\u03c3", omega: "\u03c9", infin: "\u221e", rarr: "\u2192", larr: "\u2190", hellip: "\u2026", middot: "\u00b7", ndash: "\u2013", mdash: "\u2014", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d" };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""; } catch { return ""; }
    }
    return Object.prototype.hasOwnProperty.call(NAMED, e.toLowerCase()) ? NAMED[e.toLowerCase()] : m;
  });
}

const TOKEN = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|[^<]+|</g;
const ATTR = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttrs(src) {
  const attrs = {};
  let m;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(src))) {
    if (m[1] === "/") continue;
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

// Returns a root node: { tag: "#root", children: [ {tag, attrs, children} | {text} ] }
export function parseHtml(html) {
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(String(html ?? "")))) {
    const tok = m[0];
    if (tok.startsWith("<!--")) continue;
    if (tok[0] !== "<" || tok === "<") {
      top().children.push({ text: decodeEntities(tok) });
      continue;
    }
    const name = m[1].toLowerCase();
    if (tok[1] === "/") {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === name) { stack.length = i; break; }
      }
      continue;
    }
    const node = { tag: name, attrs: parseAttrs(m[2] || ""), children: [] };
    top().children.push(node);
    if (!VOID.has(name) && !/\/\s*$/.test(m[2] || "")) stack.push(node);
  }
  return root;
}

/* ------------------------------------------------------------ MathML -> text / runs */
// Used when an equation cannot be drawn as a picture (renderer missing): the formula is written
// with REAL subscripts / superscripts (run flags sup / sub) instead of "r_2^2" style text.
const textOf = (n) => (n.text !== undefined ? n.text : (n.children || []).map(textOf).join(""));
const kids = (n) => (n.children || []).filter((c) => c.text === undefined || c.text.trim() !== "");

const SUP = { "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3", "4": "\u2074", "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079", "+": "\u207a", "-": "\u207b", "\u2212": "\u207b", "=": "\u207c", "(": "\u207d", ")": "\u207e", n: "\u207f", i: "\u2071" };
const SUB = { "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083", "4": "\u2084", "5": "\u2085", "6": "\u2086", "7": "\u2087", "8": "\u2088", "9": "\u2089", "+": "\u208a", "-": "\u208b", "\u2212": "\u208b", "=": "\u208c", "(": "\u208d", ")": "\u208e", a: "\u2090", e: "\u2091", o: "\u2092", x: "\u2093", h: "\u2095", k: "\u2096", l: "\u2097", m: "\u2098", n: "\u2099", p: "\u209a", s: "\u209b", t: "\u209c" };

function unicodeScript(str, map) {
  let out = "";
  for (const ch of str.replace(/\s+/g, "")) { if (!map[ch]) return null; out += map[ch]; }
  return out;
}

const ACCENT_MARK = { "\u2192": "\u20d7", "\u20d7": "\u20d7", "^": "\u0302", "\u02c6": "\u0302", "~": "\u0303", "\u02dc": "\u0303", "\u02d9": "\u0307", "\u00af": "\u0304", "\u203e": "\u0304", "\u2015": "\u0304", "\u2212": "\u0304", "-": "\u0304" };
const SIMPLE = /^\u221a?[A-Za-z0-9.\u00b0\u03b1-\u03c9\u0391-\u03a9\u2080-\u209c\u2070-\u207f\u00b2\u00b3\u00b9]+$|^\([^()]*\)$/;

// merge neighbouring runs that share formatting
function mergeRuns(runs) {
  const out = [];
  runs.forEach((r) => {
    if (r.t === undefined || r.t === "") return;
    const p = out[out.length - 1];
    if (p && !!p.i === !!r.i && !!p.sup === !!r.sup && !!p.sub === !!r.sub && !!p.b === !!r.b) p.t += r.t;
    else out.push({ ...r });
  });
  return out;
}
const runsText = (runs) => runs.map((r) => r.t).join("");

// children / node -> runs.  `fmt` = formatting inherited (italic, bold, sup, sub ...)
function mathRuns(n, fmt) {
  if (n.text !== undefined) { const t = n.text.replace(/\s+/g, " "); return t ? [{ t, ...fmt }] : []; }
  const c = kids(n);
  // a fraction that touches a letter / number gets brackets:  8\u03c0(1/\u03c0)T, not 8\u03c01/\u03c0T.
  // Next to an operator, bracket or space it stays as it is:  r=1/\u221a\u03c0 cm
  const touches = (x, end) => {
    if (!x || x.tag === "mo") return false;
    const t = textOf(x);
    return t !== "" && /[A-Za-z0-9\u0370-\u03ff]/.test(end === "last" ? t[t.length - 1] : t[0]);
  };
  const all = (f = fmt) => c.flatMap((x, i) => {
    const runs = mathRuns(x, f);
    return x.tag === "mfrac" && (touches(c[i - 1], "last") || touches(c[i + 1], "first")) ? [{ t: "(", ...f }, ...runs, { t: ")", ...f }] : runs;
  });
  const R = (i, f = fmt) => (c[i] ? mathRuns(c[i], f) : []);
  const lit = (t) => ({ t, ...fmt });
  // (x) around anything that is not a single symbol / number
  const grouped = (runs) => (SIMPLE.test(runsText(runs).trim()) || !runs.length ? runs : [lit("("), ...runs, lit(")")]);

  // x in a sub/superscript position: real script formatting; nested scripts fall back to unicode
  const script = (node, kind) => {
    const inner = mathRuns(node, { ...fmt, i: fmt.i });
    const txt = runsText(inner);
    if (fmt.sup || fmt.sub) {
      const u = unicodeScript(txt, kind === "sup" ? SUP : SUB);
      return u ? [lit(u)] : [lit(kind === "sup" ? "^" : "_"), ...grouped(inner)];
    }
    // a prime (f', \u03c9') is a mark of its own, not a raised letter
    if (kind === "sup" && /^[\u0027\u2032\u02b9]+$/.test(txt.trim())) return [lit("\u2032".repeat(txt.trim().length))];
    return inner.map((r) => ({ ...r, sup: kind === "sup", sub: kind === "sub" }));
  };

  switch (n.tag) {
    case "mi": {
      const t = textOf(n).replace(/\s+/g, " ");
      if (!t) return [];
      const italic = n.attrs.mathvariant !== "normal" && t.trim().length === 1 && /[A-Za-z\u03b1-\u03c9]/.test(t.trim());
      return [{ t, ...fmt, ...(italic ? { i: true } : {}) }];
    }
    case "mn": case "mo": case "mtext": case "ms": {
      const t = textOf(n).replace(/\u00a0/g, " ").replace(/\s+/g, " ");
      return t ? [{ t, ...fmt }] : [];
    }
    case "mfrac": return [...grouped(R(0)), lit("/"), ...grouped(R(1))];
    case "msup": return [...R(0), ...script(c[1], "sup")];
    case "msub": return [...R(0), ...script(c[1], "sub")];
    case "msubsup": return [...R(0), ...script(c[1], "sub"), ...script(c[2], "sup")];
    case "msqrt": { const inner = all(); return [lit("\u221a"), ...grouped(inner)]; }
    case "mroot": return [...(c[1] ? script(c[1], "sup") : []), lit("\u221a"), ...grouped(R(0))];
    case "mover": case "munder": {
      const base = R(0);
      const over = c[1] && c[1].tag === "mo" ? textOf(c[1]).trim() : "";
      const mark = n.tag === "mover" ? ACCENT_MARK[over] : null;
      if (mark) return [...base, lit(mark)];
      if (n.tag === "munder") return [...base, ...script(c[1], "sub")];
      return [...base, ...script(c[1], "sup")];
    }
    case "munderover": return [...R(0), ...script(c[1], "sub"), ...script(c[2], "sup")];
    case "mtable": return c.flatMap((r, i) => [...(i ? [lit("; ")] : []), ...kids(r).flatMap((x, j) => [...(j ? [lit(" ")] : []), ...mathRuns(x, fmt)])]);
    case "mfenced": {
      const open = n.attrs.open ?? "(";
      const close = n.attrs.close ?? ")";
      const sep = n.attrs.separators ?? ",";
      return [lit(open), ...c.flatMap((x, i) => [...(i ? [lit(sep.charAt(0))] : []), ...mathRuns(x, fmt)]), lit(close)];
    }
    case "annotation": case "annotation-xml": case "mphantom": return [];
    default: return all();
  }
}

/** <math> node -> runs [{ t, i?, sup?, sub? }] (readable fallback when no equation picture exists) */
export function mathToRuns(n, fmt = {}) {
  try { return mergeRuns(mathRuns(n, fmt)); } catch { return []; }
}

/** <math> node -> plain text, e.g. "4\u03c0r\u00b2\u221a(8T\u03b5\u2080/r)" (scripts as unicode where possible, else ^ and _) */
export function mathToText(n) {
  return mathToRuns(n)
    .map((r) => {
      if (r.sup) return unicodeScript(r.t, SUP) ?? `^${r.t.length > 1 ? `(${r.t})` : r.t}`;
      if (r.sub) return unicodeScript(r.t, SUB) ?? `_${r.t.length > 1 ? `(${r.t})` : r.t}`;
      return r.t;
    })
    .join("");
}

/* ------------------------------------------------------------ HTML -> runs */
const BLOCK = new Set(["p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "table", "blockquote", "pre", "section", "article"]);
const SKIP = new Set(["script", "style", "head", "title"]);

export function htmlToParagraphs(html) {
  const paragraphs = [];
  let cur = [];

  const flush = () => {
    // trim whitespace at both ends of the paragraph
    while (cur.length && cur[0].t !== undefined && !cur[0].t.trim() && !cur[0].fig) cur.shift();
    while (cur.length && cur[cur.length - 1].t !== undefined && !cur[cur.length - 1].t.trim()) cur.pop();
    if (cur.length) {
      const first = cur[0];
      if (first.t !== undefined) first.t = first.t.replace(/^\s+/, "");
      const last = cur[cur.length - 1];
      if (last.t !== undefined) last.t = last.t.replace(/\s+$/, "");
      paragraphs.push(cur);
    }
    cur = [];
  };

  const walk = (node, fmt) => {
    if (node.text !== undefined) {
      const t = node.text.replace(/[\r\n\t ]+/g, " ");
      if (t) cur.push({ t, ...fmt });
      return;
    }
    const tag = node.tag;
    if (SKIP.has(tag)) return;
    if (tag === "br") { cur.push({ br: true }); return; }
    if (tag === "img") { cur.push({ fig: true, src: (node.attrs.src || "").trim(), alt: node.attrs.alt || "", width: node.attrs.width, height: node.attrs.height, style: node.attrs.style || "" }); return; }
    if (tag === "math") {
      const text = mathToText(node).replace(/\s+/g, " ").trim();
      // fb = readable fallback runs (real sub/superscripts), used only when no picture can be drawn
      if (text) cur.push({ t: text, ...fmt, math: node, fb: mathToRuns(node, fmt) });
      return;
    }
    const f = { ...fmt };
    if (tag === "b" || tag === "strong") f.b = true;
    else if (tag === "i" || tag === "em") f.i = true;
    else if (tag === "u") f.u = true;
    else if (tag === "sup") { f.sup = true; f.sub = false; }
    else if (tag === "sub") { f.sub = true; f.sup = false; }

    const block = BLOCK.has(tag);
    if (block) flush();
    if (tag === "li") cur.push({ t: "\u2022 ", ...f });
    (node.children || []).forEach((ch) => walk(ch, f));
    if (tag === "td" || tag === "th") cur.push({ t: "\u2003", ...f }); // keep table cells apart
    if (block) flush();
  };

  walk(parseHtml(html), {});
  flush();
  return paragraphs;
}

// Plain-text length of an option / question (used to pick the options layout).
// `measure(run)` may return a width in "characters" for a run (docx.js uses it to count a drawn
// equation by the width of its picture instead of by its text fallback).
export function plainLength(html, measure) {
  const paras = htmlToParagraphs(html);
  let n = 0;
  let hasFig = false;
  paras.forEach((p) => p.forEach((r) => {
    if (r.fig) { hasFig = true; return; }
    const m = measure ? measure(r) : null;
    if (m != null) n += m;
    else if (r.t) n += r.t.length;
  }));
  return { length: n, hasFig, lines: paras.length };
}

// Every <img src> used in a piece of question html (so the pictures can be fetched up front).
export function imageSrcs(html) {
  const out = [];
  htmlToParagraphs(html).forEach((p) => p.forEach((r) => { if (r.fig && r.src) out.push(r.src); }));
  return out;
}
