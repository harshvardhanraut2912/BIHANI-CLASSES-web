// app/api/admin/exam-v2-options/route.js
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const getAdminClient = () => createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { cookies: { getAll() { return []; }, setAll() {} } }
);

export async function GET() {
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('exam_question_data_v2')
      .select('id, mock_test_name, mock_slug, questions_manifest')
      .order('id', { ascending: true });

    if (error) throw error;

    const options = (data || []).map((row) => {
      const manifest = Array.isArray(row.questions_manifest)
        ? row.questions_manifest
        : JSON.parse(row.questions_manifest || '[]');
      return {
        id: row.id,
        label: row.mock_test_name || row.mock_slug || row.id,
        questionCount: manifest.length,
      };
    });

    return NextResponse.json(options);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load exam options' }, { status: 500 });
  }
}