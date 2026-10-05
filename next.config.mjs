/** @type {import('next').NextConfig} */
const nextConfig = {
    // PDF sheets (lib/pdfgen): the equation renderer uses a native binary (resvg) and MathJax;
    // keep both out of the server bundle so they load from node_modules at runtime.
    // pdfkit (leaderboard PDF) reads its built-in font files from its own folder, so it must stay external too;
    // sharp resizes the students' photos for it.
    serverExternalPackages: ['@resvg/resvg-js', 'mathjax-full', 'pdfkit', 'sharp'],

    // auth.js is a plain /public static file -- unlike _next/static/*
    // bundles (which get a content hash in their filename, so a new
    // deploy is automatically a new URL), this URL never changes. Without
    // an explicit header, a browser that cached an old copy could keep
    // reusing it indefinitely, silently running stale OAuth/session logic
    // even after a fix has shipped. no-cache doesn't mean "never cache" --
    // it means "always ask the server first" (a fast conditional request),
    // so every page load is guaranteed to run the current version without
    // needing anyone to manually clear their cache.
    async headers() {
        return [
            {
                source: '/auth.js',
                headers: [
                    { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
                ],
            },
            // SECURITY FIX: these routes read a per-user session cookie and
            // return per-student data. Without an explicit no-store here,
            // Vercel's edge/CDN cache can serve ONE cached response for a
            // URL (e.g. /api/dashboard/subsections?mainSectionId=X) to every
            // visitor who hits that same URL, regardless of who they are or
            // what cookie they send -- the CDN cache key is the URL, not the
            // cookie, unless we forbid caching outright. `export const
            // dynamic = 'force-dynamic'` on each route stops Next.js's OWN
            // Data/Route cache, but not this separate CDN layer -- hence
            // this header, in addition to (not instead of) that export.
            {
                source: '/api/dashboard/:path*',
                headers: [
                    { key: 'Cache-Control', value: 'private, no-store, no-cache, must-revalidate' },
                ],
            },
            {
                source: '/api/exam/:path*',
                headers: [
                    { key: 'Cache-Control', value: 'private, no-store, no-cache, must-revalidate' },
                ],
            },
            {
                source: '/api/course-price',
                headers: [
                    { key: 'Cache-Control', value: 'private, no-store, no-cache, must-revalidate' },
                ],
            },
            {
                source: '/api/enroll/:path*',
                headers: [
                    { key: 'Cache-Control', value: 'private, no-store, no-cache, must-revalidate' },
                ],
            },
        ];
    },

    // Since Next.js 14.2, the client-side Router Cache treats DYNAMIC
    // routes (like our /dashboard/[[...slug]]) as stale immediately --
    // every router.push()/back to a course/subsection/chapter you've
    // already visited re-fetches the route's RSC payload (?_rsc=...
    // request in Network tab) even though our OWN data cache
    // (contentByKey/productsByChapterKey in dashboard/layout.js) already
    // has everything it needs and never re-hits Supabase for it.
    //
    // That RSC round-trip -- not our data fetching -- is what was making
    // revisiting a subsection/chapter feel like ~1s instead of instant.
    // Raising staleTimes.dynamic tells the Router Cache to reuse a
    // recently-visited dynamic route's payload instead of re-requesting
    // it. Our own state is the real source of truth for the actual
    // course data either way, so this is safe -- it only skips the
    // redundant page-shell refetch, not any content freshness.
    experimental: {
        staleTimes: {
            dynamic: 300, // seconds a dynamic route stays in the Router Cache
        },
    },

    // Next.js's dev server blocks cross-origin requests by default (a
    // security feature) -- localhost:3000 and a Cloudflare/ngrok tunnel
    // domain are different origins, so without this, client components
    // fetched/hydrated through the tunnel fail silently (this is why
    // BuyBox rendered fine on localhost but was entirely blank through
    // the trycloudflare.com URL).
    //
    // *.trycloudflare.com covers the free "quick tunnel" (URL changes
    // every restart); add your ngrok domain too if you switch back to it.
    // This setting only affects `next dev` -- it's a no-op in production.
    allowedDevOrigins: [
        '*.trycloudflare.com',
        '*.ngrok-free.app',
        '*.ngrok.io',
        // Testing on a phone over Wi-Fi (http://192.168.x.x:3000): without
        // these, Next blocks /_next/* in dev, so React never hydrates and
        // every client component (navbar, periodic table, tabs) stays dead.
        '192.168.*.*',
        '10.*.*.*',
        '172.16.*.*',
        '*.local',
        // Admin subdomain in dev (http://admin.localhost:3000)
        'admin.localhost',
        '*.localhost',
    ],

    // pdfjs-dist's *legacy* build statically requires the native "canvas"
    // package for a Node/SSR fallback path we never use (the document
    // viewer only imports the standard, non-legacy build in the browser).
    // This alias is a safety net so that if any dependency (now or in the
    // future) pulls in the legacy path, the bundler resolves "canvas" to
    // nothing instead of failing the build looking for a package that was
    // never meant to be installed here.
    turbopack: {
        resolveAlias: {
            // Unconditional (string) alias -- Turbopack only supports the
            // `browser` condition for *conditional* aliasing, there's no
            // server/SSR equivalent. Since this component is still SSR'd
            // once on the server even though it's 'use client', a
            // `{ browser: ... }` alias here only fixes the client bundle
            // and leaves the SSR bundle trying (and failing) to resolve
            // the real "canvas" package. Plain string form applies to
            // every build target.
            canvas: './lib/emptyModule.js',
        },
    },
};
export default nextConfig;
