// app/api/admin/leaderboard-pdf/route.js
//
// Generates the admin leaderboard PDF from the rows handed over by
// /exams/leaderboard. The browser keeps the draft in localStorage because
// the PDF popup is a separate page; this API receives that draft as JSON.
//
// Authentication is deliberately checked again here. The admin proxy protects
// the route before Next.js executes it, and this second check prevents the
// PDF generator from being called directly without a valid admin session.

import { NextResponse } from "next/server";
import { verifyAdminTokenDetailed, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";
import { SITE } from "@/lib/siteConfig";
import { prepareLogo } from "@/lib/pdfgen/logo";
import { loadAvatars } from "@/lib/pdfgen/avatars";
import { buildLeaderboardPdf, safeText } from "@/lib/pdfgen/leaderboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function requireAdmin(request) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const check = await verifyAdminTokenDetailed(token, secret);
  return !!check.valid;
}

const forbidden = () =>
  NextResponse.json(
    { error: "Forbidden: Admin authentication required." },
    { status: 403 }
  );

const bad = (error, status = 400) =>
  NextResponse.json({ error }, { status });

const clean = (value, max) =>
  String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));

const fileSlug = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "leaderboard";

function rankRows(input) {
  const rows = (Array.isArray(input) ? input : [])
    .slice(0, 500)
    .map((row) => ({
      name: safeText(clean(row?.name, 100), 100) || "Student",
      percentage: clamp(row?.percentage),
      attemptNumber: Math.max(1, parseInt(row?.attemptNumber, 10) || 1),
      avatarUrl: clean(row?.avatarUrl, 1000),
    }))
    .sort((a, b) => b.percentage - a.percentage);

  // Competition ranking: 1, 2, 2, 4...
  let previous = null;
  let previousRank = 0;
  rows.forEach((row, index) => {
    if (previous === null || row.percentage !== previous) {
      previousRank = index + 1;
      previous = row.percentage;
    }
    row.rank = previousRank;
  });

  return rows;
}

function dateText() {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
}

export async function POST(request) {
  try {
    if (!(await requireAdmin(request))) return forbidden();

    const body = await request.json().catch(() => ({}));
    const title = clean(body.title, 120) || "Leaderboard";
    const viewLabel = clean(body.viewLabel, 80) || "Best score";
    const rows = rankRows(body.rows);

    if (!rows.length) return bad("There are no students in this leaderboard.");

    let logo = null;
    if (body.logo) {
      const prepared = await prepareLogo(String(body.logo));
      logo = prepared?.header || null;
    }

    const avatarUrls = rows.map((row) => row.avatarUrl).filter(Boolean);
    const avatars = await loadAvatars(avatarUrls);

    const pdf = await buildLeaderboardPdf({
      orgName: SITE.short,
      title,
      viewLabel,
      generatedText: `Generated ${dateText()}`,
      logo,
      rows,
      avatars,
      showAttempt: body.showAttempt === true,
      showPhotos: avatars.size > 0,
    });

    const filename = `${fileSlug(title)}-leaderboard.pdf`;

    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Filename": filename,
      },
    });
  } catch (err) {
    console.error("leaderboard-pdf POST error:", err);
    return bad(err?.message || "Failed to generate the leaderboard PDF.", 500);
  }
}
