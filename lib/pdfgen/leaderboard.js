// lib/pdfgen/leaderboard.js  (new file, server only)
//
// Draws the LEADERBOARD PDF with pdfkit (A4, portrait). Used by app/api/admin/leaderboard-pdf/route.js.
//
//   buildLeaderboardPdf({ orgName, title, viewLabel, generatedText, logo, rows, avatars, showAttempt, showPhotos })
//      logo      { buf, ext, wPx, hPx } | null          (lib/pdfgen/logo.js -> .header)
//      rows      [{ rank, name, percentage, attemptNumber, avatarUrl }]   best first, real ranks
//      avatars   Map<avatarUrl, { buf, ext }>            (lib/pdfgen/avatars.js); a missing entry = initials circle
//      showPhotos  optional; default = on when at least one picture was found
//   -> Promise<Buffer>
//
// LAYOUT
//   page 1   gradient header banner (logo tile . organisation . test name . view . date)
//            4 summary cards, "Top performers" cards, then the ranking table
//   page 2+  slim header strip, table header repeated
//   every page  footer: organisation . generated time . Page x of y
//
// Only the 14 built-in PDF fonts are used (no font files to deploy), so text is limited to Latin
// characters: safeText() folds fancy Unicode (e.g. bold-math "Jay") to plain letters first.

import PDFDocument from "pdfkit";

/* ----------------------------------------------------------------------------- text */
export function safeText(value, max = 100) {
  const t = String(value ?? "")
    .normalize("NFKC") // bold / italic "math" letters, full-width forms -> plain letters
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7e\u00a0-\u00ff]/g, " ") // anything the built-in fonts cannot draw
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, max);
}

const initialsOf = (name) => {
  const parts = String(name || "").replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

/* -------------------------------------------------------------------------- palette */
const C = {
  navy: "#0f1d5e",
  blue: "#172a85",
  sky: "#2f6df0",
  teal: "#0e9aa7",
  amber: "#f59e0b",
  ink: "#0c1438",
  slate: "#5b6784",
  mute: "#8a94ad",
  line: "#e3e8f2",
  zebra: "#f6f8fd",
  white: "#ffffff",
};
const MEDAL = [
  { fill: "#f5b301", ink: "#ffffff", tint: "#fff8e1", edge: "#f1d28a", text: "#8a5a00" }, // gold
  { fill: "#94a3b8", ink: "#ffffff", tint: "#f1f5f9", edge: "#cbd5e1", text: "#475569" }, // silver
  { fill: "#c9814a", ink: "#ffffff", tint: "#fdf1e7", edge: "#e8c3a0", text: "#8a4a1c" }, // bronze
];
const AVATAR_COLORS = ["#172a85", "#0e7490", "#7c3aed", "#be185d", "#b45309", "#15803d", "#c2410c", "#0369a1"];
const colorFor = (name) => {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

// performance band of a score
function band(p) {
  if (p >= 80) return { label: "OUTSTANDING", fg: "#14532d", bg: "#dcfce7", bd: "#86efac", bar: "#16a34a" };
  if (p >= 60) return { label: "VERY GOOD", fg: "#1e3a8a", bg: "#e0ebff", bd: "#a9c4fb", bar: "#2f6df0" };
  if (p >= 40) return { label: "SATISFACTORY", fg: "#8a4b00", bg: "#fff3d6", bd: "#f3d28b", bar: "#f59e0b" };
  return { label: "NEEDS WORK", fg: "#9b1c1c", bg: "#fde8e8", bd: "#f5b5b5", bar: "#ef4444" };
}

/* ------------------------------------------------------------------------- geometry */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MX = 36; // side margin
const CW = PAGE_W - MX * 2; // content width
const FOOT_Y = 806;
const BOTTOM = 796; // rows never go below this

const pct = (n) => `${(Number(n) || 0).toFixed(1)}%`;
const clamp01 = (n) => Math.max(0, Math.min(100, Number(n) || 0)) / 100;

export function buildLeaderboardPdf({ orgName, title, viewLabel, generatedText, logo, rows, avatars, showAttempt, showPhotos }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 0,
        bufferPages: true,
        info: { Title: `${title} - Leaderboard`, Author: orgName, Creator: orgName, Subject: viewLabel },
      });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // photo column: on when the admin asked for photos (students without one get an initials circle)
      const showPhotoCol = showPhotos === undefined ? avatars instanceof Map && avatars.size > 0 : !!showPhotos;

      /* -------------------------------------------------------------- small helpers */
      const font = (bold, size) => doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
      const width = (str, bold, size, spacing = 0) => font(bold, size).widthOfString(str, { characterSpacing: spacing });
      // text with its top-left at (x, y); everything is placed manually, so nothing ever wraps or paginates
      const put = (str, x, y, { bold = false, size = 10, color = C.ink, spacing = 0 } = {}) => {
        font(bold, size).fillColor(color).text(str, x, y, { lineBreak: false, characterSpacing: spacing });
      };
      const putR = (str, right, y, o = {}) => put(str, right - width(str, o.bold, o.size ?? 10, o.spacing ?? 0), y, o);
      const putC = (str, cx, y, o = {}) => put(str, cx - width(str, o.bold, o.size ?? 10, o.spacing ?? 0) / 2, y, o);
      // y that centres the capital letters of `size` pt text on the line cy
      const midY = (cy, size) => cy - size * 0.36;
      const fit = (str, maxW, bold, size) => {
        if (width(str, bold, size) <= maxW) return str;
        let s = str;
        while (s.length > 1 && width(`${s}...`, bold, size) > maxW) s = s.slice(0, -1);
        return `${s.trimEnd()}...`;
      };
      const wrap = (str, maxW, bold, size, maxLines) => {
        const words = str.split(" ");
        const lines = [];
        let cur = "";
        for (let i = 0; i < words.length; i++) {
          const next = cur ? `${cur} ${words[i]}` : words[i];
          if (width(next, bold, size) <= maxW || !cur) { cur = next; continue; }
          lines.push(cur);
          cur = words[i];
          if (lines.length === maxLines - 1) { cur = words.slice(i).join(" "); break; }
        }
        lines.push(cur);
        return lines.slice(0, maxLines).map((l, i, a) => (i === a.length - 1 ? fit(l, maxW, bold, size) : l));
      };
      const gradient = (x0, y0, x1, y1, stops) => {
        const g = doc.linearGradient(x0, y0, x1, y1);
        stops.forEach(([at, col]) => g.stop(at, col));
        return g;
      };

      const drawLogo = (x, y, w, h) => {
        if (!logo || !logo.buf) return false;
        try {
          doc.image(logo.buf, x, y, { fit: [w, h], align: "center", valign: "center" });
          return true;
        } catch {
          return false; // e.g. a GIF: pdfkit cannot embed it, the PDF is simply printed without a logo
        }
      };

      const avatar = (row, cx, cy, r) => {
        const img = avatars?.get?.(row.avatarUrl);
        let done = false;
        if (img) {
          doc.save();
          try {
            doc.circle(cx, cy, r).clip();
            doc.image(img.buf, cx - r, cy - r, { cover: [r * 2, r * 2], align: "center", valign: "center" });
            done = true;
          } catch { /* unreadable picture: initials below */ }
          doc.restore();
          if (done) {
            doc.circle(cx, cy, r).lineWidth(1).strokeColor("#ffffff").stroke();
            doc.circle(cx, cy, r + 0.6).lineWidth(0.6).strokeColor("#cdd6ea").stroke();
          }
        }
        if (!done) {
          doc.circle(cx, cy, r).fill(colorFor(row.name));
          putC(initialsOf(row.name), cx, midY(cy, r * 0.95), { bold: true, size: r * 0.95, color: C.white });
        }
      };

      /* ------------------------------------------------------------------- page chrome */
      let pageNo = 0;

      // big banner on the first page
      const banner = (top) => {
        const h = 150;
        doc.save();
        doc.roundedRect(MX, top, CW, h, 14).fill(gradient(MX, top, MX + CW, top + h, [[0, C.navy], [0.55, C.blue], [1, C.sky]]));
        doc.restore();
        // decorative circles, clipped to the banner
        doc.save();
        doc.roundedRect(MX, top, CW, h, 14).clip();
        doc.fillOpacity(0.07).circle(MX + CW - 40, top + 20, 96).fill("#ffffff");
        doc.fillOpacity(0.05).circle(MX + CW - 150, top + h + 30, 80).fill("#ffffff");
        doc.fillOpacity(1);
        doc.restore();
        // accent strip along the bottom edge
        doc.save();
        doc.roundedRect(MX, top, CW, h, 14).clip();
        doc.rect(MX, top + h - 5, CW, 5).fill(gradient(MX, 0, MX + CW, 0, [[0, C.teal], [1, C.amber]]));
        doc.restore();

        // logo tile
        let tx = MX + 22;
        if (logo) {
          doc.roundedRect(MX + 20, top + 22, 62, 62, 12).fill(C.white);
          if (drawLogo(MX + 26, top + 28, 50, 50)) tx = MX + 98;
          else tx = MX + 22;
        }
        const room = MX + CW - 22 - tx;
        put(fit(orgName.toUpperCase(), room, true, 9), tx, top + 24, { bold: true, size: 9, color: "#bcd0ff", spacing: 1.6 });
        const lines = wrap(title, room, true, 21, 2);
        let ty = top + 40;
        lines.forEach((ln) => { put(ln, tx, ty, { bold: true, size: 21, color: C.white }); ty += 25; });
        put(fit(`Leaderboard  |  ${viewLabel}`, room, false, 10.5), tx, ty + 3, { size: 10.5, color: "#dbe6ff" });

        // date pill, bottom-left of the banner
        const pillW = width(generatedText, true, 8.5) + 22;
        doc.save();
        doc.fillOpacity(0.18).roundedRect(MX + 22, top + h - 38, pillW, 18, 9).fill("#ffffff");
        doc.restore();
        put(generatedText, MX + 33, midY(top + h - 29, 8.5), { bold: true, size: 8.5, color: C.white });
        return top + h;
      };

      // slim strip on the following pages
      const strip = (top) => {
        const h = 34;
        doc.save();
        doc.roundedRect(MX, top, CW, h, 8).fill(gradient(MX, top, MX + CW, top, [[0, C.navy], [1, C.sky]]));
        doc.restore();
        let tx = MX + 14;
        if (logo) {
          doc.roundedRect(MX + 8, top + 5, 24, 24, 5).fill(C.white);
          if (drawLogo(MX + 10, top + 7, 20, 20)) tx = MX + 42;
        }
        const right = `${viewLabel}`;
        const rw = width(right, false, 8.5);
        put(fit(title, MX + CW - 14 - rw - 16 - tx, true, 10.5), tx, midY(top + h / 2, 10.5), { bold: true, size: 10.5, color: C.white });
        putR(right, MX + CW - 14, midY(top + h / 2, 8.5), { size: 8.5, color: "#dbe6ff" });
        return top + h;
      };

      const newPage = () => {
        if (pageNo > 0) doc.addPage();
        pageNo += 1;
      };

      /* ------------------------------------------------------------------- table parts */
      const COL = {
        rankCx: MX + 28,
        photoCx: MX + 66,
        nameX: showPhotoCol ? MX + 90 : MX + 56,
        attemptCx: MX + 280,
        barX: MX + 330,
        barW: 62,
        scoreR: MX + 444,
        chipR: MX + CW - 10,
        chipW: 78,
      };
      const nameMax = (showAttempt ? COL.attemptCx - 32 : COL.barX - 14) - COL.nameX;
      const ROW_H = showPhotoCol ? 38 : 30;

      const tableHead = (top) => {
        const h = 26;
        doc.save();
        doc.roundedRect(MX, top, CW, h, 7).fill(C.navy);
        doc.restore();
        const sp = 0.8;
        const o = { bold: true, size: 7.5, color: "#c9d6ff", spacing: sp };
        const y = midY(top + h / 2, 7.5);
        putC("RANK", COL.rankCx, y, o);
        put("STUDENT", showPhotoCol ? COL.photoCx - 14 : COL.nameX, y, o);
        if (showAttempt) putC("ATTEMPT", COL.attemptCx, y, o);
        put("SCORE", COL.barX, y, o);
        putC("RESULT", COL.chipR - COL.chipW / 2, y, o);
        return top + h;
      };

      const tableRow = (row, top, index) => {
        const cy = top + ROW_H / 2;
        const medal = row.rank <= 3 ? MEDAL[row.rank - 1] : null;
        doc.rect(MX, top, CW, ROW_H).fill(medal ? medal.tint : index % 2 === 0 ? C.white : C.zebra);
        doc.moveTo(MX, top + ROW_H).lineTo(MX + CW, top + ROW_H).lineWidth(0.5).strokeColor(C.line).stroke();
        if (medal) doc.rect(MX, top, 3.5, ROW_H).fill(medal.fill);

        // rank
        if (medal) {
          doc.circle(COL.rankCx, cy, 11).fill(medal.fill);
          putC(String(row.rank), COL.rankCx, midY(cy, 10.5), { bold: true, size: 10.5, color: medal.ink });
        } else {
          putC(String(row.rank), COL.rankCx, midY(cy, 10.5), { bold: true, size: 10.5, color: C.slate });
        }

        // photo + name
        if (showPhotoCol) avatar(row, COL.photoCx, cy, 14);
        put(fit(row.name, nameMax, true, 10.5), COL.nameX, midY(cy, 10.5), { bold: true, size: 10.5, color: C.ink });

        // attempt
        if (showAttempt) putC(`Attempt ${row.attemptNumber}`, COL.attemptCx, midY(cy, 8.5), { size: 8.5, color: C.slate });

        // score bar + number
        const b = band(row.percentage);
        doc.roundedRect(COL.barX, cy - 3, COL.barW, 6, 3).fill("#e4e9f5");
        const fw = Math.max(0, COL.barW * clamp01(row.percentage));
        if (fw > 0.5) doc.roundedRect(COL.barX, cy - 3, Math.max(fw, 4), 6, 3).fill(b.bar);
        putR(pct(row.percentage), COL.scoreR, midY(cy, 11), { bold: true, size: 11, color: C.ink });

        // performance chip
        const cx0 = COL.chipR - COL.chipW;
        doc.roundedRect(cx0, cy - 8, COL.chipW, 16, 8).lineWidth(0.7).fillAndStroke(b.bg, b.bd);
        putC(b.label, cx0 + COL.chipW / 2, midY(cy, 6.8), { bold: true, size: 6.8, color: b.fg, spacing: 0.5 });
      };

      /* ----------------------------------------------------------------------- page 1 */
      newPage();
      let y = banner(30) + 12;

      // summary cards
      const count = rows.length;
      const avg = rows.reduce((n, r) => n + r.percentage, 0) / Math.max(1, count);
      const sorted = rows.map((r) => r.percentage).sort((p, q) => p - q);
      const median = count % 2 ? sorted[(count - 1) / 2] : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;
      const cards = [
        { label: "STUDENTS", value: String(count), color: C.sky },
        { label: "TOP SCORE", value: pct(rows[0]?.percentage ?? 0), color: "#16a34a" },
        { label: "AVERAGE", value: pct(avg), color: C.teal },
        { label: "MEDIAN", value: pct(median), color: C.amber },
      ];
      const gap = 10;
      const cw = (CW - gap * 3) / 4;
      cards.forEach((c, i) => {
        const x = MX + i * (cw + gap);
        doc.roundedRect(x, y, cw, 52, 8).lineWidth(0.8).fillAndStroke(C.white, "#dfe5f1");
        doc.save();
        doc.roundedRect(x, y, cw, 52, 8).clip();
        doc.rect(x, y, 4, 52).fill(c.color);
        doc.restore();
        put(c.label, x + 16, y + 11, { bold: true, size: 7, color: C.mute, spacing: 0.9 });
        put(c.value, x + 16, y + 25, { bold: true, size: 18, color: C.ink });
      });
      y += 52 + 16;

      // top performers
      const top3 = rows.slice(0, 3);
      if (top3.length) {
        put("TOP PERFORMERS", MX, y, { bold: true, size: 8, color: C.blue, spacing: 1.2 });
        doc.rect(MX + width("TOP PERFORMERS", true, 8, 1.2) + 10, y + 3.5, CW - width("TOP PERFORMERS", true, 8, 1.2) - 10, 0.8).fill(C.line);
        y += 15;
        const pg = 10;
        const pw = (CW - pg * 2) / 3;
        top3.forEach((r, i) => {
          const m = MEDAL[Math.min(i, 2)];
          const x = MX + i * (pw + pg);
          doc.roundedRect(x, y, pw, 70, 10).lineWidth(0.9).fillAndStroke(m.tint, m.edge);
          if (showPhotoCol) {
            avatar(r, x + 34, y + 35, 21);
            doc.circle(x + 18, y + 17, 9).lineWidth(1.4).fillAndStroke(m.fill, "#ffffff");
            putC(String(r.rank), x + 18, midY(y + 17, 8.5), { bold: true, size: 8.5, color: m.ink });
          } else {
            doc.circle(x + 30, y + 35, 17).fill(m.fill);
            putC(String(r.rank), x + 30, midY(y + 35, 15), { bold: true, size: 15, color: m.ink });
          }
          const tx = x + 64;
          const tw = pw - 64 - 8;
          const nameLines = wrap(r.name, tw, true, 10, 2);
          nameLines.forEach((ln, k) => put(ln, tx, y + 13 + k * 12, { bold: true, size: 10, color: C.ink }));
          put(pct(r.percentage), tx, y + 46, { bold: true, size: 15, color: m.text });
        });
        y += 70 + 18;
      }

      /* ------------------------------------------------------------------- table pages */
      y = tableHead(y);
      rows.forEach((row, i) => {
        if (y + ROW_H > BOTTOM) {
          newPage();
          y = strip(30) + 14;
          y = tableHead(y);
        }
        tableRow(row, y, i);
        y += ROW_H;
      });

      // closing note
      const note = "Ranks are real ranks: students with equal scores share the same rank.";
      if (y + 22 > BOTTOM) { newPage(); y = strip(30) + 14; }
      put(note, MX, y + 9, { size: 8, color: C.mute });

      /* ------------------------------------------------------------------------ footer */
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.moveTo(MX, FOOT_Y).lineTo(MX + CW, FOOT_Y).lineWidth(0.6).strokeColor(C.line).stroke();
        put(fit(orgName, 190, true, 7.5), MX, FOOT_Y + 8, { bold: true, size: 7.5, color: C.slate });
        putC(generatedText, MX + CW / 2, FOOT_Y + 8, { size: 7.5, color: C.mute });
        putR(`Page ${i + 1} of ${range.count}`, MX + CW, FOOT_Y + 8, { size: 7.5, color: C.slate });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
