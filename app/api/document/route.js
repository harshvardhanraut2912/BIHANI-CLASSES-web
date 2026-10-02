import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// 🔧 CHANGED: now points at the GitHub Contents API instead of raw.githubusercontent.com.
// The raw CDN caches files for ~5+ minutes per edge node (a known GitHub-acknowledged issue)
// and ignores cache-busting query strings in many cases. The Contents API hits GitHub's
// backend directly, so updates show up immediately after a push — private repos included,
// using the same GITHUB_TOKEN you already had.
const GITHUB_API_BASE = 'https://api.github.com/repos/harshvardhanraut2912/mht-cet-images/contents';
const GITHUB_REF = 'main';

const FILE_MIME_TYPES = {
    'pdf': 'application/pdf',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'html': 'text/html'
};

// FIX: the DRM lookup below (products / sidebar_subsections / user_enrollments)
// was previously run through the anon-key, RLS-scoped client. That client is
// correct for authenticating *who the user is* via their session cookie/token,
// but running the actual enrollment-chain reads through it means every one of
// those reads is silently filtered by whatever RLS policies exist on those
// tables -- which is why a genuinely-enrolled student could still get a false
// 403 (a blocked `sidebar_subsections` or `user_enrollments` read just comes
// back empty, not as an error, so it looked identical to "not enrolled").
//
// app/api/dashboard/tree/route.js already established the right pattern for
// this codebase: authenticate with the user's own token, but do the actual
// access-control reads with the service-role key, since the authorization
// logic is fully implemented in this route's own code (not delegated to
// RLS). Mirroring that here so document access matches what the dashboard
// tree already shows the student.
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
    try {
        const cookieStore = await cookies();
        
        // 1. EXTRACT RAW ACCESS TOKEN DIRECTLY FROM INCOMING AUTHORIZATION HEADERS
        const authHeader = request.headers.get('Authorization');
        let accessToken = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            accessToken = authHeader.split(' ')[1];
        }

        // 🔧 FIX: Map standard getAll/setAll cookies and pass accessToken into global headers 
        // to ensure Supabase applies your Row Level Security (RLS) policies correctly.
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, // Keeping it strictly secure via the anon key
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch (err) {}
                    },
                },
                global: {
                    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
                },
            }
        );

        // 2. BACKUP SECURITY HANDOFF: REHYDRATE USER PROFILE SEAMLESSLY IF HEADERS EXIST
        let session = null;
        if (accessToken) {
            const { data: { user }, error: userErr } = await supabase.auth.getUser(accessToken);
            if (!userErr && user) {
                session = { user };
            }
        }

        // Fallback to normal browser cookie validation if no token was passed via headers
        if (!session) {
            const { data: { session: cookieSession }, error: authError } = await supabase.auth.getSession();
            if (!authError && cookieSession) session = cookieSession;
        }

        // Throw 401 if both token sourcing channels fail
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized: Valid authentication credentials completely missing' }, { status: 401 });
        }

        const { path } = await request.json();
        if (!path) {
            return NextResponse.json({ error: 'Bad Request: Target path parameter is missing' }, { status: 400 });
        }

        if (path.includes('..') || path.startsWith('/') || (!path.startsWith('Documents/') && !path.startsWith('swapfiles/'))) {
            return NextResponse.json({ error: 'Forbidden: Malicious asset path parameters flagged' }, { status: 403 });
        }

        // 3. EXECUTE RE-MAPPED VALIDATION CHECK UPWARDS AGAINST ENROLLED USERS
        const cleanEmail = session.user.email.toLowerCase();
        const studentUuid = session.user.id;

        // NOTE: document_path is NOT guaranteed unique in `products` -- the same
        // underlying file can legitimately (or accidentally, via CMS duplication)
        // be attached to more than one product row, each tied to a different
        // course/subsection. Fetching only one row and checking enrollment
        // against just that one caused false "Access Denied" results for
        // students who were enrolled via a DIFFERENT product row pointing at
        // the same file. So: fetch ALL matching products, and grant access if
        // the student is enrolled in ANY of them.
        //
        // REAL FIX (this was the actual bug, confirmed against how
        // app/api/dashboard/tree/route.js resolves the same tree): a product
        // reaches its course's main_section_id via ONE of three different
        // shapes depending on how the CMS created it --
        //   1. chaptered section:  product.chapter_id -> sidebar_chapters.subsection_id -> sidebar_subsections.main_section_id
        //   2. 2-level section:    product.course_subsection_id (legacy column) -> sidebar_subsections.main_section_id
        //   3. 2-level section:    product.subsection_id (newer column)        -> sidebar_subsections.main_section_id
        // This route was only ever checking shape (2), so any product reached
        // via a chapter (shape 1 -- which is exactly what your dashboard tree
        // shows for courses with chapters) could never resolve its course and
        // always fell through to a false 403, even for a student genuinely
        // enrolled in that course. Selecting chapter_id too and resolving all
        // three shapes below makes "enrolled in the course" reliably grant
        // access to every current AND future product under it, regardless of
        // which shape a given row happens to use.
        const { data: matchingProducts, error: productErr } = await supabaseAdmin
            .from('products')
            .select('id, product_type, allow_download, course_subsection_id, subsection_id, chapter_id')
            .eq('document_path', path);

        let isApprovedSwapfile = false;
        if (path.startsWith('swapfiles/')) {
            const { data: swapProduct } = await supabaseAdmin
                .from('products')
                .select('id, product_type')
                .eq('id', path.split('/').pop().split('.')[0])
                .limit(1)
                .maybeSingle();
            if (swapProduct) isApprovedSwapfile = true;
        }

        let hasValidEnrollment = false;
        let enrollmentError = null;
        let grantingProduct = null; // whichever matching product actually granted access -- used below for response headers

        for (const candidate of matchingProducts || []) {
            if (hasValidEnrollment) break;

            const { data: directEnrollment, error: directErr } = await supabaseAdmin
                .from('user_enrollments')
                .select('product_id')
                .or(`student_id.ilike.${cleanEmail},student_id.eq.${studentUuid}`)
                .eq('product_id', candidate.id)
                .limit(1)
                .maybeSingle();

            if (directErr) {
                enrollmentError = directErr;
                continue;
            }
            if (directEnrollment) {
                hasValidEnrollment = true;
                grantingProduct = candidate;
                break;
            }

            // Resolve this product's subsection id. Chaptered products (the
            // common case for courses with chapters) don't carry a subsection
            // id directly -- go through their chapter first.
            let resolvedSubsectionId = candidate.course_subsection_id || candidate.subsection_id || null;

            if (!resolvedSubsectionId && candidate.chapter_id) {
                const { data: chapter, error: chapterErr } = await supabaseAdmin
                    .from('sidebar_chapters')
                    .select('subsection_id')
                    .eq('id', candidate.chapter_id)
                    .limit(1)
                    .maybeSingle();

                if (chapterErr) {
                    enrollmentError = chapterErr;
                    continue;
                }
                resolvedSubsectionId = chapter?.subsection_id || null;
            }

            if (resolvedSubsectionId) {
                const { data: subsection, error: subsectionErr } = await supabaseAdmin
                    .from('sidebar_subsections')
                    .select('main_section_id')
                    .eq('id', resolvedSubsectionId)
                    .limit(1)
                    .maybeSingle();

                if (subsectionErr) {
                    enrollmentError = subsectionErr;
                    continue;
                }
                if (subsection?.main_section_id) {
                    const { data: courseEnrollment, error: courseErr } = await supabaseAdmin
                        .from('user_enrollments')
                        .select('course_id')
                        .or(`student_id.ilike.${cleanEmail},student_id.eq.${studentUuid}`)
                        .eq('course_id', subsection.main_section_id)
                        .limit(1)
                        .maybeSingle();

                    if (courseErr) {
                        enrollmentError = courseErr;
                    } else if (courseEnrollment) {
                        hasValidEnrollment = true;
                        grantingProduct = candidate;
                    }
                }
            }
        }

        // For header metadata below, fall back to the first matching product
        // if none of them actually granted access (keeps prior 403 behavior
        // for the error/logging path).
        const product = grantingProduct || (matchingProducts && matchingProducts[0]) || null;
        const hasAnyMatchingProduct = !!(matchingProducts && matchingProducts.length > 0);

        if (matchingProducts && matchingProducts.length > 1) {
            console.warn(
                `DRM: document_path "${path}" is attached to ${matchingProducts.length} product rows ` +
                `(${matchingProducts.map(p => p.id).join(', ')}) -- this should be cleaned up in the CMS ` +
                `so each file maps to exactly one product.`
            );
        }

        if ((productErr || (!hasAnyMatchingProduct && !isApprovedSwapfile)) || (!hasValidEnrollment && !isApprovedSwapfile)) {
            if (productErr || enrollmentError) {
                console.error('DRM product/enrollment lookup error:', (productErr || enrollmentError).message);
            } else {
                console.error(
                    `DRM: no enrolled product found for path="${path}" and student_id="${cleanEmail}" / uuid="${studentUuid}"`
                );
            }
            return NextResponse.json({ error: 'Access Denied: Missing product enrollment clear bounds' }, { status: 403 });
        }

        const fileExtension = path.split('.').pop().toLowerCase();
        const mimeType = FILE_MIME_TYPES[fileExtension] || 'application/octet-stream';

        // 4. FETCH FRESH FROM GITHUB CONTENTS API (bypasses the stale raw.githubusercontent.com CDN)
        // Each path segment is URL-encoded individually (so spaces/special chars in folder names
        // like "icon and images/..." work) while keeping the "/" separators intact.
        const encodedPath = path.split('/').map(encodeURIComponent).join('/');
        const gitHubUrl = `${GITHUB_API_BASE}/${encodedPath}?ref=${GITHUB_REF}&cb=${Date.now()}`;

        const githubResponse = await fetch(gitHubUrl, {
            headers: {
                'User-Agent': 'CETWALLE-DRM-Shield',
                'Authorization': `token ${process.env.GITHUB_TOKEN}`, // Private repo deployment access token
                'Accept': 'application/vnd.github.raw+json' // Ask the API for raw file bytes, not JSON+base64
            },
            cache: 'no-store'
        });

        if (!githubResponse.ok) {
            console.error(
                `DRM upstream fetch failed: ${githubResponse.status} ${githubResponse.statusText} for URL: ${gitHubUrl}`
            );
            return NextResponse.json(
                {
                    error: 'Asset sync failure inside upstream system registers',
                    upstreamStatus: githubResponse.status,
                    upstreamUrl: gitHubUrl
                },
                { status: 502 }
            );
        }

        const fileBuffer = await githubResponse.arrayBuffer();

        const responseHeaders = new Headers();
        responseHeaders.set('Content-Type', mimeType);
        responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        responseHeaders.set('Pragma', 'no-cache');
        responseHeaders.set('Expires', '0');
        responseHeaders.set('X-Product-Type', product?.product_type || 'swapfile');
        responseHeaders.set('X-Allow-Download', product?.allow_download ? 'true' : 'false');
        responseHeaders.set('X-Content-Type-Options', 'nosniff');
        responseHeaders.set('Content-Security-Policy', "default-src 'self'; object-src 'none'; frame-ancestors 'none';");

        return new Response(fileBuffer, {
            status: 200,
            headers: responseHeaders
        });

    } catch (fatalException) {
        console.error('CRITICAL LOG: DRM Stream execution tracing error:', fatalException);
        return NextResponse.json({ error: 'Internal Gateway operational infrastructure fault' }, { status: 500 });
    }
}