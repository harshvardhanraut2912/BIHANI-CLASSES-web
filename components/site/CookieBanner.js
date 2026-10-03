'use client';

import { useEffect } from 'react';

// Loads ONLY the cookie-consent banner (not the YN-branded app popup that
// LegacyScripts also loads). The script waits for DOMContentLoaded, which has
// already fired by the time a client component mounts, so fire it once.
let booted = false;
export default function CookieBanner() {
  useEffect(() => {
    if (booted) return;
    booted = true;
    const s = document.createElement('script');
    s.src = '/cookie-consent.js';
    s.onload = () => document.dispatchEvent(new Event('DOMContentLoaded'));
    document.body.appendChild(s);
  }, []);
  return null;
}
