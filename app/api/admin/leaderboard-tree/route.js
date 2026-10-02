// 📂 SAVE THIS FILE AT: app/api/admin/leaderboard-tree/route.js
//
// Single-call tree for the new Leaderboard drill-down UI:
//   Courses/Sections (sidebar_main_sections)
//     -> Subsections (sidebar_subsections)
//       -> Chapters (sidebar_chapters)
//         -> Exam products only (products where product_type = 'exam')
//
// Branches with zero exam products anywhere underneath are pruned so the
// picker only ever shows courses/chapters that actually have exams in them.
// This does not touch/replace /api/admin/leaderboard, which still serves
// the actual leaderboard rows for a chosen productId (scoring logic there
// is untouched).

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

const getAdminClient = () => createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll() { return []; }, setAll() {} } }
);

export async function GET() {
    try {
        const supabase = getAdminClient();

        const [
            { data: mainSections, error: msErr },
            { data: subsections, error: subErr },
            { data: chapters, error: chErr },
            { data: examProducts, error: prodErr },
        ] = await Promise.all([
            supabase.from('sidebar_main_sections').select('id, name, is_course, thumbnail_url, icon_url').order('display_order', { ascending: true }),
            supabase.from('sidebar_subsections').select('id, name, main_section_id').order('display_order', { ascending: true }),
            supabase.from('sidebar_chapters').select('id, name, subsection_id').order('display_order', { ascending: true }),
            supabase.from('products')
                .select('id, title, chapter_id, is_scheduled, result_declared_at, created_at')
                .eq('product_type', 'exam')
                .order('created_at', { ascending: false }),
        ]);

        if (msErr) throw msErr;
        if (subErr) throw subErr;
        if (chErr) throw chErr;
        if (prodErr) throw prodErr;

        const examsByChapter = {};
        (examProducts || []).forEach(p => {
            if (!p.chapter_id) return;
            (examsByChapter[p.chapter_id] ||= []).push(p);
        });

        const chaptersBySub = {};
        (chapters || []).forEach(c => {
            (chaptersBySub[c.subsection_id] ||= []).push(c);
        });

        const subsByMain = {};
        (subsections || []).forEach(s => {
            (subsByMain[s.main_section_id] ||= []).push(s);
        });

        const tree = (mainSections || []).map(section => {
            const subs = (subsByMain[section.id] || []).map(sub => {
                const chs = (chaptersBySub[sub.id] || [])
                    .map(ch => ({
                        id: ch.id,
                        name: ch.name,
                        exams: examsByChapter[ch.id] || [],
                    }))
                    .filter(ch => ch.exams.length > 0);
                return { id: sub.id, name: sub.name, chapters: chs };
            }).filter(sub => sub.chapters.length > 0);

            return {
                id: section.id,
                name: section.name,
                is_course: !!section.is_course,
                thumbnail_url: section.thumbnail_url,
                icon_url: section.icon_url,
                subsections: subs,
                examCount: subs.reduce((sum, s) => sum + s.chapters.reduce((s2, c) => s2 + c.exams.length, 0), 0),
            };
        }).filter(section => section.examCount > 0);

        return NextResponse.json({ tree });
    } catch (err) {
        return NextResponse.json({ error: err.message || 'Failed to load leaderboard tree.' }, { status: 500 });
    }
}
