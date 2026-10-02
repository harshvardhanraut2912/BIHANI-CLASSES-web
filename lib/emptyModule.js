// lib/emptyModule.js
//
// Intentionally empty. Used as a Turbopack resolveAlias target for the
// native "canvas" npm package (see next.config.mjs) -- pdfjs-dist's
// *legacy* build path references it for a Node/SSR fallback that this
// client-only PDF viewer never exercises. Aliasing it here means the
// bundler never tries to actually resolve/install the real "canvas"
// package, which requires native compilation and isn't installed.
module.exports = {};