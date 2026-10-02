// ===================================================
// Cookie Consent Banner — YN Classes theme
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
      @keyframes cc-slide-up {
        0%   { opacity: 0; transform: translateY(40px) scale(0.9); }
        60%  { opacity: 1; transform: translateY(-4px) scale(1.02); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes cc-slide-down {
        0%   { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(24px) scale(0.97); }
      }
      @keyframes cc-pulse-ring {
        0%   { box-shadow: 0 0 0 0 rgba(29, 127, 214, 0.35); }
        70%  { box-shadow: 0 0 0 10px rgba(29, 127, 214, 0); }
        100% { box-shadow: 0 0 0 0 rgba(29, 127, 214, 0); }
      }
      @keyframes cc-card-glow {
        0%, 100% { box-shadow: 0 20px 45px rgba(6, 49, 92, 0.18), 0 4px 12px rgba(6, 49, 92, 0.08), 0 0 0 0 rgba(29, 127, 214, 0.45); }
        50%      { box-shadow: 0 20px 45px rgba(6, 49, 92, 0.18), 0 4px 12px rgba(6, 49, 92, 0.08), 0 0 0 7px rgba(29, 127, 214, 0); }
      }
      @keyframes cc-icon-float {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        50%      { transform: translateY(-3px) rotate(-6deg); }
      }
      @keyframes cc-dot-ping {
        0%   { transform: scale(1); opacity: 1; }
        75%, 100% { transform: scale(2.2); opacity: 0; }
      }
      @keyframes cc-backdrop-in {
        0% { opacity: 0; }
        100% { opacity: 1; }
      }

      .cc-backdrop {
        position: fixed;
        inset: 0;
        z-index: 8999;
        pointer-events: none;
        background: radial-gradient(circle at bottom right, rgba(6, 49, 92, 0.16), rgba(6, 49, 92, 0) 55%);
        animation: cc-backdrop-in 0.5s ease-out;
      }

      .cc-banner {
        position: fixed;
        right: 18px;
        bottom: 18px;
        max-width: 400px;
        width: calc(100vw - 32px);
        max-height: calc(100vh - 32px);
        overflow: auto;
        background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
        border: 1.5px solid rgba(29, 127, 214, 0.4);
        border-radius: 20px;
        padding: 24px 26px 22px;
        box-shadow: 0 20px 45px rgba(6, 49, 92, 0.18), 0 4px 12px rgba(6, 49, 92, 0.08);
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        z-index: 9000;
        color: #0f1f2e;
        animation: cc-slide-up 0.55s cubic-bezier(0.22, 1, 0.36, 1), cc-card-glow 2.6s ease-in-out 0.6s 3;
      }
      .cc-banner.cc-leaving {
        animation: cc-slide-down 0.3s cubic-bezier(0.4, 0, 1, 1) forwards;
      }

      .cc-top {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;
      }
      .cc-icon {
        position: relative;
        flex: none;
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: linear-gradient(135deg, #1d7fd6, #0b4f8a);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: cc-icon-float 3s ease-in-out infinite;
        box-shadow: 0 6px 16px rgba(11, 79, 138, 0.35);
      }
      .cc-icon svg {
        width: 21px;
        height: 21px;
      }
      .cc-icon-dot {
        position: absolute;
        top: -3px;
        right: -3px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #ff5757;
        border: 2px solid #fff;
      }
      .cc-icon-dot::after {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: 50%;
        background: #ff5757;
        animation: cc-dot-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
      }
      .cc-banner h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 800;
        color: #06315c;
        letter-spacing: -0.01em;
      }
      .cc-banner p {
        margin: 0 0 18px;
        font-size: 13px;
        line-height: 1.6;
        color: #5c6b7a;
      }
      .cc-banner a {
        color: #1d7fd6;
        font-weight: 600;
        text-decoration: none;
        border-bottom: 1px solid rgba(29, 127, 214, 0.35);
        transition: border-color 0.15s ease;
      }
      .cc-banner a:hover {
        border-color: #1d7fd6;
      }

      .cc-actions {
        display: flex;
        gap: 10px;
      }
      .cc-btn {
        flex: 1;
        border: 0;
        border-radius: 10px;
        padding: 11px 14px;
        font-size: 13.5px;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
      }
      .cc-btn:active {
        transform: scale(0.96);
      }
      .cc-btn-decline {
        background: #eef3f9;
        color: #0b4f8a;
        border: 1px solid rgba(11, 79, 138, 0.15);
      }
      .cc-btn-decline:hover {
        background: #e2eaf4;
      }
      .cc-btn-accept {
        background: linear-gradient(135deg, #1d7fd6, #0b4f8a);
        color: #ffffff;
        box-shadow: 0 6px 16px rgba(11, 79, 138, 0.28);
        animation: cc-pulse-ring 2.4s ease-out infinite;
      }
      .cc-btn-accept:hover {
        box-shadow: 0 8px 20px rgba(11, 79, 138, 0.38);
        transform: translateY(-1px);
      }

      [data-theme="dark"] .cc-banner {
        background: linear-gradient(180deg, #0e1a2b 0%, #0a1522 100%);
        border-color: rgba(29, 127, 214, 0.25);
      }
      [data-theme="dark"] .cc-banner h3 {
        color: #eaf2fb;
      }
      [data-theme="dark"] .cc-banner p {
        color: #93a3b8;
      }
      [data-theme="dark"] .cc-btn-decline {
        background: #16233a;
        color: #cfe0f5;
        border-color: rgba(29, 127, 214, 0.25);
      }
      [data-theme="dark"] .cc-btn-decline:hover {
        background: #1c2c48;
      }

      @media (max-width: 420px) {
        .cc-banner { right: 8px; bottom: 8px; padding: 18px 18px 16px; }
      }
    `;
    document.head.appendChild(style);
  }

  function renderBanner() {
    injectStyles();

    const backdrop = document.createElement("div");
    backdrop.className = "cc-backdrop";
    backdrop.setAttribute("data-testid", "yn-cookie-consent-backdrop");
    document.body.appendChild(backdrop);

    const el = document.createElement("div");
    el.className = "cc-banner";
    el.setAttribute("data-testid", "yn-cookie-consent");
    el.innerHTML = `
      <div class="cc-top">
        <div class="cc-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"></circle>
            <circle cx="9" cy="10" r="1" fill="#ffffff"></circle>
            <circle cx="14" cy="9" r="1" fill="#ffffff"></circle>
            <circle cx="15" cy="14" r="1" fill="#ffffff"></circle>
            <circle cx="10" cy="15" r="1" fill="#ffffff"></circle>
          </svg>
          <span class="cc-icon-dot"></span>
        </div>
        <h3>We value your privacy</h3>
      </div>
      <p>
        YN Classes uses cookies to keep you signed in and remember your
        preferences. If you decline, your login won't be saved once you
        close the site. Read our
        <a href="/privacypolicy.html">Privacy Policy</a>.
      </p>
      <div class="cc-actions">
        <button type="button" class="cc-btn cc-btn-decline" id="cc-decline">Decline</button>
        <button type="button" class="cc-btn cc-btn-accept" id="cc-accept">Accept</button>
      </div>
    `;
    document.body.appendChild(el);

    function dismiss(cb) {
      el.classList.add("cc-leaving");
      backdrop.style.transition = "opacity 0.28s ease";
      backdrop.style.opacity = "0";
      setTimeout(() => {
        el.remove();
        backdrop.remove();
        if (cb) cb();
      }, 280);
    }

    document.getElementById("cc-accept").addEventListener("click", () => {
      setAccepted();
      dismiss();
    });

    document.getElementById("cc-decline").addEventListener("click", () => {
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