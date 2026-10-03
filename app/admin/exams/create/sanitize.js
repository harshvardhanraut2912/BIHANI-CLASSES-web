// app/admin/exams/create/sanitize.js  (new file)
//
// Same approach as the other admin pages: DOMPurify from the CDN with MathML tags
// allowed, because question / option / solution HTML carries inline <math> markup.
"use client";

import { useEffect, useState } from "react";

const SRC = "https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.5/purify.min.js";

export function sanitizeHtml(raw) {
  if (!raw) return "";
  try {
    if (typeof window !== "undefined" && window.DOMPurify) {
      const out = window.DOMPurify.sanitize(raw, {
        ADD_TAGS: ["math", "mi", "mo", "mn", "mrow", "mfrac", "msup", "msub", "msqrt", "mtext", "mspace", "msubsup", "mtable", "mtr", "mtd", "mover", "munder", "munderover", "mroot", "mfenced", "mpadded", "mstyle"],
        ADD_ATTR: ["mathvariant", "xmlns", "stretchy", "fence", "style", "displaystyle"],
      });
      if (out && out.trim().length > 0) return out;
    }
  } catch (e) {
    console.error("sanitizeHtml failed, using manual strip:", e);
  }
  return String(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/ on[a-z]+="[^"]*"/gi, "");
}

// Loads DOMPurify once; returns true when it is ready (so rows re-render sanitized).
export function useDomPurify() {
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!window.DOMPurify);
  useEffect(() => {
    if (window.DOMPurify) return;
    let el = document.querySelector("script[data-dompurify]");
    if (!el) {
      el = document.createElement("script");
      el.src = SRC;
      el.async = true;
      el.setAttribute("data-dompurify", "1");
      document.head.appendChild(el);
    }
    const on = () => setReady(true);
    el.addEventListener("load", on);
    const t = setTimeout(() => { if (window.DOMPurify) setReady(true); }, 0); // loaded between render and effect
    return () => { clearTimeout(t); el.removeEventListener("load", on); };
  }, []);
  return ready;
}
