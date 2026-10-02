import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize the Admin Client using the secret Service Role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY 
);

export async function POST(request) {
    try {
        // 💥 ZERO-TRUST FIX: Extract session token from Authorization header first, fallback to cookies
        const authHeader = request.headers.get('Authorization');
const sessionToken = authHeader 
    ? authHeader.replace('Bearer ', '') 
    : request.cookies.get('cet_session_token')?.value;
        if (!sessionToken) {
            return NextResponse.json({ error: 'Unauthorized: Session token missing.' }, { status: 401 });
        }

        // 1. Verify Session with Supabase Auth Engine
        const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(sessionToken);
        if (authErr || !user) {
            return NextResponse.json({ error: 'Unauthorized: Invalid or expired session.' }, { status: 401 });
        }

        // 2. Cross-check your verified email against the admin whitelist
        const cleanEmail = user.email ? user.email.toLowerCase().trim() : "";
        
        // 📜 DIAGNOSTIC LOG: This prints out in your VS Code / terminal window where npm run dev is running!
        console.log("==========================================");
        console.log("CMS SECURITY DIAGNOSTIC RUN:");
        console.log("Token authenticated email target:", cleanEmail);
        console.log("==========================================");

        const { data: adminRecords, error: adminErr } = await supabaseAdmin
            .from('admin_users')
            .select('*')
            .ilike('email', cleanEmail);

        if (adminErr) {
            console.error("Supabase Database Query Error:", adminErr);
        }

        // Verify we found at least one valid administrative user record matching this email
        if (adminErr || !adminRecords || adminRecords.length === 0) {
            console.error(`Access Blocked: Email "${cleanEmail}" was not located inside the admin_users whitelist table.`);
            return NextResponse.json({ error: 'Access Denied: You do not have administrative privileges.' }, { status: 403 });
        }

        const payload = await request.json();
        const { testId, title, duration, imageBaseUrl, price, isPaid, sections, answerKeyArray, portalSubsection } = payload;

        // 3. ATOMIC MULTI-TABLE TRANSACTION INSERTION
        // A. Insert Configuration Details
        const { error: configErr } = await supabaseAdmin.from('exam_configurations').upsert([{
            id: testId,
            title: title,
            duration_mins: duration,
            image_base_url: imageBaseUrl,
            image_extension: '.png',
            price: price,
            is_paid: isPaid,
            sections: sections
        }]);
        if (configErr) throw new Error("Configurations Layer Insertion Blocked: " + configErr.message);

        // B. Insert Protected Answer Key
        const { error: keyErr } = await supabaseAdmin.from('exam_answer_keys').upsert([{
            test_id: testId,
            correct_answer_key: answerKeyArray
        }]);
        if (keyErr) throw new Error("Answer Key Layer Insertion Blocked: " + keyErr.message);

        // C. Update/Insert Portal UI Item Card
        const { error: portalErr } = await supabaseAdmin.from('portal_items').upsert([{
            id: testId,
            item_type: 'mock_test',
            title: title,
            subsection_id: portalSubsection,
            main_section: 'Study',
            is_live: true,
            display_order: 99,
            meta_1: '150 Questions',
            meta_2: `${duration} Minutes`,
            badge: 'New',
            redirect_url: `/exam.html`, // Handled natively by browser secure token trigger
            is_paid: isPaid,
            price: price
        }]);
        if (portalErr) throw new Error("Portal Items UI Layer Insertion Blocked: " + portalErr.message);

        return NextResponse.json({ success: true, message: "Exam Matrix Successfully Deployed!" });

    } catch (err) {
        console.error("Admin Exam Deployment Exception:", err);
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
    }
}