// ===================================================
// Cookie Consent Banner — Bihani Chemistry Classes theme
// Include AFTER auth.js is loaded, e.g.:
//   <script src="/auth.js"></script>
//   <script src="/cookie-consent.js"></script>
//
// Behavior:
//   - Shows once, bottom-right, if no choice has been recorded yet.
//   - "Accept"  -> localStorage.setItem('cookie_consent', 'accepted')
//                  Supabase/session cookie persistence works normally.
//   - "Decline" -> localStorage.setItem('cookie_consent', 'declined')
//                  Clears any existing session cookie/localStorage and
//                  auth.js will skip persisting future logins.
// ===================================================

(function () {
  const CONSENT_KEY = "cookie_consent";

  // "Accepted" is remembered via an actual cookie — if the user has
  // cookies blocked/cleared, this naturally comes back empty and the
  // banner reappears, which is exactly correct.
  // "Declined" is remembered only for the current tab session
  // (sessionStorage) so we don't nag on every click during one visit,
  // but a fresh visit / browser restart always asks again, since we
  // are not storing anything on their machine long-term.
  function getCookie(name) {
    const match = document.cookie.match(
      new RegExp("(?:^|; )" + name + "=([^;]*)")
    );
    return match ? decodeURIComponent(match[1]) : null;
  }

  function getConsent() {
    try {
      if (getCookie(CONSENT_KEY) === "accepted") return "accepted";
      if (sessionStorage.getItem(CONSENT_KEY) === "declined")
        return "declined";
    } catch (e) {}
    return null;
  }

  function setAccepted() {
    const isSecureEnv = window.location.protocol === "https:";
    let cookieString = `${CONSENT_KEY}=accepted; path=/; max-age=${
      60 * 60 * 24 * 365
    }; SameSite=Lax`;
    if (isSecureEnv) cookieString += "; Secure";
    document.cookie = cookieString;
  }

  function setDeclined() {
    try {
      sessionStorage.setItem(CONSENT_KEY, "declined");
    } catch (e) {}
  }

  function clearAuthData() {
    try {
      document.cookie =
        "cet_session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      Object.keys(localStorage).forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
  }

  function injectStyles() {
    if (document.getElementById("cookie-consent-styles")) return;
    const style = document.createElement("style");
    style.id = "cookie-consent-styles";
    style.textContent = `
      @keyframes cc-rise-in {
        0%   { opacity: 0; transform: translateY(70px); }
        70%  { opacity: 1; transform: translateY(-6px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes cc-sink-out { to { opacity: 0; transform: translateY(50px); } }
      @keyframes cc-wave { to { transform: translateX(-24px); } }
      @keyframes cc-bubble {
        0%   { transform: translateY(0) scale(.6); opacity: 0; }
        20%  { opacity: .95; }
        100% { transform: translateY(-34px) scale(1.15); opacity: 0; }
      }
      @keyframes cc-vapour {
        0%   { transform: translateY(0) scale(.5); opacity: 0; }
        35%  { opacity: .5; }
        100% { transform: translateY(-12px) scale(1.5); opacity: 0; }
      }
      @keyframes cc-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
      @keyframes cc-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      @keyframes cc-ring { 0% { box-shadow: 0 0 0 0 rgba(18,160,238,.55); } 100% { box-shadow: 0 0 0 12px rgba(18,160,238,0); } }

      .cc-banner {
        position: fixed; left: 0; right: 0; bottom: 18px; margin: 0 auto;
        width: min(780px, calc(100vw - 28px));
        display: flex; align-items: center; gap: 22px;
        padding: 20px 26px 20px 20px; overflow: hidden;
        background: linear-gradient(135deg, #0c1438 0%, #14246f 100%);
        border: 1px solid rgba(143, 176, 255, 0.28); border-radius: 22px;
        box-shadow: 0 24px 60px rgba(8, 14, 48, 0.55), inset 0 1px 0 rgba(255,255,255,.08);
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #e8edff; z-index: 9000;
        animation: cc-rise-in 0.6s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .cc-banner.cc-leaving { animation: cc-sink-out 0.3s cubic-bezier(0.4, 0, 1, 1) forwards; }
      .cc-banner::before {
        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; overflow: hidden;
        background: linear-gradient(90deg, #12a0ee, #e0242c, #12a0ee); opacity: .35;
      }
      .cc-banner::after {
        content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 3px;
        background: linear-gradient(90deg, transparent, #ffffff, transparent);
        animation: cc-sweep 2.4s ease-in-out infinite;
      }

      .cc-flask { flex: none; width: 74px; padding-top: 6px; animation: cc-float 4s ease-in-out infinite; }
      .cc-flask svg { width: 100%; height: auto; display: block; overflow: visible; }
      .cc-wave { animation: cc-wave 1.6s linear infinite; }
      .cc-bub { transform-box: fill-box; transform-origin: center; animation: cc-bubble 2.4s ease-in infinite; opacity: 0; }
      .cc-vap { transform-box: fill-box; transform-origin: center; animation: cc-vapour 3s ease-out infinite; opacity: 0; }
      .cc-fizz .cc-bub { animation-duration: .55s; }
      .cc-fizz .cc-vap { animation-duration: .8s; }
      .cc-fizz .cc-wave { animation-duration: .5s; }

      .cc-body { flex: 1; min-width: 0; }
      .cc-banner h3 { margin: 0 0 6px; font-size: 18px; font-weight: 800; letter-spacing: -0.01em; color: #ffffff; font-family: 'Bricolage Grotesque', 'DM Sans', sans-serif; }
      .cc-banner p { margin: 0; font-size: 13px; line-height: 1.6; color: #b9c6ea; }
      .cc-banner a { color: #7fd0ff; font-weight: 600; text-decoration: none; border-bottom: 1px solid rgba(127, 208, 255, 0.4); }
      .cc-banner a:hover { border-color: #7fd0ff; }

      .cc-actions { flex: none; display: flex; flex-direction: column; gap: 8px; min-width: 124px; }
      .cc-btn {
        border: 0; border-radius: 12px; padding: 11px 18px; font-size: 13.5px; font-weight: 700;
        font-family: inherit; cursor: pointer; transition: transform .15s ease, background-color .15s ease, box-shadow .15s ease;
      }
      .cc-btn:active { transform: scale(0.96); }
      .cc-btn:disabled { opacity: .7; cursor: default; }
      .cc-btn-accept { background: #12a0ee; color: #06123a; animation: cc-ring 2.2s ease-out infinite; }
      .cc-btn-accept:hover { background: #3bb4f5; transform: translateY(-1px); }
      .cc-btn-decline { background: transparent; color: #c9d5f5; border: 1px solid rgba(143, 176, 255, 0.35); }
      .cc-btn-decline:hover { background: rgba(143, 176, 255, 0.12); }

      @media (max-width: 640px) {
        .cc-banner { flex-wrap: wrap; bottom: 10px; padding: 18px 18px 16px; gap: 14px 14px; }
        .cc-flask { width: 52px; }
        .cc-body { flex-basis: calc(100% - 70px); }
        .cc-actions { flex-direction: row; width: 100%; }
        .cc-actions .cc-btn { flex: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .cc-banner, .cc-flask, .cc-wave, .cc-bub, .cc-vap, .cc-banner::after, .cc-btn-accept { animation: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function renderBanner() {
    injectStyles();

    const el = document.createElement("div");
    el.className = "cc-banner";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Cookie consent");
    el.setAttribute("data-testid", "bihani-cookie-consent");
    el.innerHTML = `
      <div class="cc-flask" aria-hidden="true">
        <svg viewBox="0 0 64 76" fill="none">
          <defs>
            <linearGradient id="cc-liq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4cc3ff"/><stop offset="1" stop-color="#12a0ee"/></linearGradient>
            <clipPath id="cc-clip"><path d="M26 8V30L9 62Q5 70 13 70H51Q59 70 55 62L38 30V8Z"/></clipPath>
          </defs>
          <g clip-path="url(#cc-clip)">
            <g class="cc-wave"><path d="M-12 46q6-5 12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0V80H-12Z" fill="url(#cc-liq)"/></g>
            <circle class="cc-bub" cx="24" cy="62" r="2.4" fill="#fff"/>
            <circle class="cc-bub" style="animation-delay:.8s" cx="34" cy="64" r="1.8" fill="#fff"/>
            <circle class="cc-bub" style="animation-delay:1.5s" cx="42" cy="60" r="2.8" fill="#fff"/>
            <circle class="cc-bub" style="animation-delay:.4s" cx="30" cy="66" r="1.5" fill="#fff"/>
          </g>
          <path d="M26 8V30L9 62Q5 70 13 70H51Q59 70 55 62L38 30V8" stroke="#cfe0ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M23 8H41" stroke="#cfe0ff" stroke-width="4" stroke-linecap="round"/>
          <circle class="cc-vap" cx="32" cy="4" r="3.4" fill="#7fd0ff"/>
          <circle class="cc-vap" style="animation-delay:1.1s" cx="28" cy="4" r="2.4" fill="#ff6a6f"/>
          <circle class="cc-vap" style="animation-delay:2s" cx="36" cy="4" r="2.8" fill="#cfe0ff"/>
        </svg>
      </div>
      <div class="cc-body">
        <h3>A pinch of cookies, for a smoother class</h3>
        <p>
          Bihani Chemistry Classes uses cookies to keep you signed in and remember your
          preferences. If you decline, your login won't be saved once you
          close the site. Read our
          <a href="/privacypolicy">Privacy Policy</a>.
        </p>
      </div>
      <div class="cc-actions">
        <button type="button" class="cc-btn cc-btn-accept" id="cc-accept">Accept</button>
        <button type="button" class="cc-btn cc-btn-decline" id="cc-decline">Decline</button>
      </div>
    `;
    document.body.appendChild(el);

    function dismiss(cb) {
      el.classList.add("cc-leaving");
      setTimeout(() => {
        el.remove();
        if (cb) cb();
      }, 280);
    }

    function lock() {
      el.querySelectorAll("button").forEach((b) => (b.disabled = true));
    }

    document.getElementById("cc-accept").addEventListener("click", () => {
      lock();
      setAccepted();
      el.classList.add("cc-fizz"); // quick "reaction" before the banner leaves
      setTimeout(() => dismiss(), 550);
    });

    document.getElementById("cc-decline").addEventListener("click", () => {
      lock();
      dismiss(() => {
        setDeclined();
        clearAuthData();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!getConsent()) renderBanner();
  });
})();