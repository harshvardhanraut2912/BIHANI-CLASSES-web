// 📂 SAVE THIS FILE AT: lib/resolveImageUrl.js
//
// Small shared helper used anywhere a thumbnail_url / icon_url is rendered.
// Supports two kinds of values stored in those columns:
//   1. A raw Supabase Storage path (e.g. "icon and images/foo.png")
//      -> routed through the existing /api/images proxy, exactly as before.
//   2. A direct absolute URL (http:// or https://), e.g. pasted straight
//      into the admin form -> used as-is, no proxy.
// Existing behavior for storage paths is completely unchanged.

export function resolveImageUrl(value, fallback = '') {
    if (!value) return fallback;
    if (/^https?:\/\//i.test(value)) return value;
    return `/api/images?path=${encodeURIComponent(value)}`;
}