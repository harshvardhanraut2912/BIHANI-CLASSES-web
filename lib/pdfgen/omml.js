// lib/pdfgen/omml.js  (new file, server only)
//
// MathML node (from html.js parseHtml)  ->  Word equation (OMML, the <m:oMath> body).
// Covers what the question bank produces: identifiers / numbers / operators / text,
// fractions, super/subscripts, roots, fences, accents (vectors, bars), limits,
// sums / products / integrals, matrices and cases. Anything unknown degrades to its
// text content, so an equation can never break the whole document.

const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const esc = (s) => String(s ?? "").replace(BAD_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

const MATH_RPR = '<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr>';

const textOf = (n) => (n.text !== undefined ? n.text : (n.children || []).map(textOf).join(""));
const kids = (n) => (n.children || []).filter((c) => c.text === undefined || c.text.trim() !== "");
const clean = (s) => String(s).replace(/[\s\u00a0]+/g, " ").trim();

// ----------------------------------------------------------------- leaves
function run(text, { plain = false, normalText = false } = {}) {
  if (text === "") return "";
  let mrpr = "";
  if (normalText) mrpr = "<m:rPr><m:nor/></m:rPr>";
  else if (plain) mrpr = '<m:rPr><m:sty m:val="p"/></m:rPr>';
  return `<m:r>${mrpr}${MATH_RPR}<m:t xml:space="preserve">${esc(text)}</m:t></m:r>`;
}

// ----------------------------------------------------------------- helpers
const NARY_CHARS = new Set(["\u2211", "\u220f", "\u2210", "\u222b", "\u222c", "\u222d", "\u222e", "\u22c3", "\u22c2"]);
const INTEGRALS = new Set(["\u222b", "\u222c", "\u222d", "\u222e"]);
// accent characters that sit directly on the base (vector arrows, hats, dots ...)
const ACCENTS = new Set(["\u2192", "\u20d7", "\u2190", "\u2194", "^", "\u02c6", "~", "\u02dc", "\u02d9", "\u00a8", "\u2322", "\u0302", "\u0303", "\u0307", "\u0308", "\u00b4", "`"]);
const BARS = new Set(["\u00af", "\u203e", "\u2015", "\u2212", "-", "_", "\u2014", "\u0304"]);

const isOp = (n, set) => n && n.tag === "mo" && set.has(clean(textOf(n)));

const wrapE = (inner) => `<m:e>${inner}</m:e>`;
const arg = (tag, inner) => `<m:${tag}>${inner}</m:${tag}>`;

function conv(n) {
  if (!n) return "";
  if (n.text !== undefined) {
    const t = n.text.replace(/\s+/g, " ");
    return t.trim() ? run(t) : "";
  }
  const c = kids(n);
  const k = (i) => conv(c[i]);
  const all = () => c.map(conv).join("");

  switch (n.tag) {
    case "math": case "mrow": case "mstyle": case "mpadded": case "merror": case "mtd": case "mth":
      return all();
    case "semantics": return c.length ? conv(c[0]) : "";
    case "annotation": case "annotation-xml": case "mphantom": return "";
    case "mspace": return run("\u2009");

    case "mn": return run(clean(textOf(n)), { plain: true });
    case "mi": {
      const t = clean(textOf(n));
      // multi-letter identifiers (sin, log, ...) and mathvariant="normal" stay upright
      return run(t, { plain: t.length > 1 || n.attrs.mathvariant === "normal" });
    }
    case "mo": {
      const t = clean(textOf(n));
      return run(t, { plain: true });
    }
    case "mtext": {
      const raw = textOf(n).replace(/\u00a0/g, " ");
      return raw ? run(raw, { normalText: true }) : "";
    }
    case "ms": return run(textOf(n), { normalText: true });

    case "mfrac": {
      const lin = n.attrs.linethickness === "0";
      const body = arg("num", k(0) || run(" ")) + arg("den", k(1) || run(" "));
      return `<m:f>${lin ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : ""}${body}</m:f>`;
    }
    case "msqrt":
      return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>${wrapE(all())}</m:rad>`;
    case "mroot":
      return `<m:rad><m:radPr></m:radPr>${arg("deg", k(1))}${wrapE(k(0))}</m:rad>`;

    case "msup": return sub_sup(c[0], null, c[1]);
    case "msub": return sub_sup(c[0], c[1], null);
    case "msubsup": return sub_sup(c[0], c[1], c[2]);

    case "mover": return over_under(c[0], null, c[1]);
    case "munder": return over_under(c[0], c[1], null);
    case "munderover": return over_under(c[0], c[1], c[2]);

    case "mfenced": {
      const open = n.attrs.open ?? "(";
      const close = n.attrs.close ?? ")";
      const sep = (n.attrs.separators ?? ",").charAt(0);
      const items = c.length ? c : [];
      const pr = `<m:dPr><m:begChr m:val="${escAttr(open)}"/><m:sepChr m:val="${escAttr(sep)}"/><m:endChr m:val="${escAttr(close)}"/></m:dPr>`;
      return `<m:d>${pr}${(items.length ? items : [null]).map((it) => wrapE(it ? conv(it) : "")).join("")}</m:d>`;
    }

    case "mtable": return matrix(c);
    case "mtr": case "mlabeledtr": return all();

    case "menclose": return all(); // boxes / strike: keep the content
    case "mmultiscripts": return all();
    default:
      return all() || (clean(textOf(n)) ? run(clean(textOf(n))) : "");
  }
}

function sub_sup(base, sub, sup) {
  // an operator like  ∑ ∏ ∫  with limits  ->  proper limits layout
  if (base && isOp(base, NARY_CHARS)) {
    const ch = clean(textOf(base));
    return nary(ch, sub, sup);
  }
  const e = wrapE(conv(base));
  if (sub && sup) return `<m:sSubSup>${e}${arg("sub", conv(sub))}${arg("sup", conv(sup))}</m:sSubSup>`;
  if (sup) return `<m:sSup>${e}${arg("sup", conv(sup))}</m:sSup>`;
  return `<m:sSub>${e}${arg("sub", conv(sub))}</m:sSub>`;
}

function over_under(base, under, over) {
  if (base && isOp(base, NARY_CHARS)) return nary(clean(textOf(base)), under, over);

  // a single accent / bar above or below the base
  if (over && !under && over.tag === "mo") {
    const ch = clean(textOf(over));
    if (ACCENTS.has(ch)) return `<m:acc><m:accPr><m:chr m:val="${escAttr(ch)}"/></m:accPr>${wrapE(conv(base))}</m:acc>`;
    if (BARS.has(ch)) return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr>${wrapE(conv(base))}</m:bar>`;
  }
  if (under && !over && under.tag === "mo" && BARS.has(clean(textOf(under)))) {
    return `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr>${wrapE(conv(base))}</m:bar>`;
  }
  // general limits:  lim, arrows with text above/below (reaction conditions), underbraces ...
  let out = conv(base);
  if (under) out = `<m:limLow>${wrapE(out)}${arg("lim", conv(under))}</m:limLow>`;
  if (over) out = `<m:limUpp>${wrapE(out)}${arg("lim", conv(over))}</m:limUpp>`;
  return out;
}

function nary(ch, lo, hi) {
  // Integrals keep their limits at the side, sums / products above and below.
  if (INTEGRALS.has(ch)) {
    const e = wrapE(run(ch, { plain: true }));
    if (lo && hi) return `<m:sSubSup>${e}${arg("sub", conv(lo))}${arg("sup", conv(hi))}</m:sSubSup>`;
    if (hi) return `<m:sSup>${e}${arg("sup", conv(hi))}</m:sSup>`;
    if (lo) return `<m:sSub>${e}${arg("sub", conv(lo))}</m:sSub>`;
    return run(ch, { plain: true });
  }
  let inner = run(ch, { plain: true });
  if (lo) inner = `<m:limLow>${wrapE(inner)}${arg("lim", conv(lo))}</m:limLow>`;
  if (hi) inner = `<m:limUpp>${wrapE(inner)}${arg("lim", conv(hi))}</m:limUpp>`;
  return inner;
}

function matrix(rows) {
  const trs = rows.filter((r) => r.tag === "mtr" || r.tag === "mlabeledtr");
  const list = trs.length ? trs : rows;
  const body = list
    .map((r) => {
      const cells = kids(r).filter((x) => x.tag === "mtd" || x.tag === "mth");
      const cs = cells.length ? cells : kids(r);
      return `<m:mr>${cs.map((cell) => wrapE(conv(cell))).join("")}</m:mr>`;
    })
    .join("");
  return `<m:m><m:mPr><m:plcHide m:val="1"/></m:mPr>${body || "<m:mr><m:e/></m:mr>"}</m:m>`;
}

/**
 * mathNode -> "<m:oMath>...</m:oMath>" (inline equation) or "" when it has no content.
 * Never throws.
 */
export function mathmlToOmml(mathNode) {
  try {
    const inner = conv(mathNode);
    return inner ? `<m:oMath>${inner}</m:oMath>` : "";
  } catch {
    return "";
  }
}
