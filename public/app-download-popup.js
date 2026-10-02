// ===================================================
// App Download Popup — YN Classes theme
// Include AFTER auth.js is loaded, e.g.:
//   <script src="/auth.js"></script>
//   <script src="/cookie-consent.js"></script>
//   <script src="/app-download-popup.js"></script>
//
// Behavior:
//   - Shows once per browser, a couple seconds after first page load.
//   - Skips entirely if the browser reports the app is already installed
//     (Chrome on Android only, via navigator.getInstalledRelatedApps() —
//     requires Digital Asset Links / assetlinks.json to be set up on this
//     domain; see notes at the bottom of this file). On any browser that
//     doesn't support the check, it just falls back to always showing.
//   - Dismissible (X button, backdrop click, or Escape key).
//   - Once dismissed/clicked-through, never shows again on this device
//     (localStorage flag) — reset by clearing site data.
//   - Follows the same light/dark theme as the rest of the site
//     (data-theme attribute / localStorage('theme')).
//   - Play-Store-style layout: app icon, title, developer, rating row,
//     description, install button.
// ===================================================

(function () {
  const SEEN_KEY = "app_download_popup_seen";
  const SHOW_DELAY_MS = 500;
  const ANDROID_PACKAGE_ID = "in.ynclasses.app"; // must match app.json -> expo.android.package

  function hasSeenPopup() {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch (e) {}
  }

  // Chrome-on-Android only. Returns true if the app is confirmed installed,
  // false if confirmed not installed OR if the browser can't tell us
  // (unsupported API, no Digital Asset Links set up yet, etc). We only
  // ever use this to SKIP the popup, never to claim "not installed" with
  // certainty, since the check can under-report on unsupported browsers.
  async function isAppAlreadyInstalled() {
    if (!("getInstalledRelatedApps" in navigator)) return false;
    try {
      const related = await navigator.getInstalledRelatedApps();
      return related.some(
        (app) => app.platform === "play" && app.id === ANDROID_PACKAGE_ID
      );
    } catch (e) {
      return false;
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light";
  }

  function buildPopup() {
    const dark = currentTheme() === "dark";

    const bg = dark ? "#10233a" : "#ffffff";
    const border = dark ? "rgba(255,255,255,0.1)" : "#e8eaed";
    const text = dark ? "#f2f7fc" : "#202124";
    const textMuted = dark ? "#b7c6d6" : "#5f6368";
    const green = dark ? "#17a860" : "#0a7d4c";
    const greenHover = dark ? "#1ec172" : "#086c41";
    const overlayBg = "rgba(10, 15, 25, 0.6)";
    const laterColor = dark ? "#8ea0b3" : "#80868b";

    const overlay = document.createElement("div");
    overlay.id = "app-download-popup-overlay";
    overlay.innerHTML = `
      <style>
        #app-download-popup-overlay {
          position: fixed; inset: 0; background: ${overlayBg};
          display: flex; align-items: center; justify-content: center;
          z-index: 99999; padding: 20px; opacity: 0; transition: opacity 0.25s ease;
        }
        #app-download-popup-overlay.visible { opacity: 1; }
        #app-download-popup-card {
          background: ${bg}; border: 1px solid ${border}; border-radius: 20px;
          max-width: 380px; width: 100%;
          padding: 26px 22px 22px; text-align: left; position: relative;
          box-shadow: 0 20px 50px rgba(0,0,0,0.35);
          transform: translateY(10px) scale(0.97); transition: transform 0.25s ease;
        }
        #app-download-popup-overlay.visible #app-download-popup-card {
          transform: translateY(0) scale(1);
        }
        #app-download-popup-close {
          position: absolute; top: 10px; right: 10px; border: none; background: rgba(0,0,0,0.05);
          width: 36px; height: 36px; border-radius: 50%;
          font-size: 26px; line-height: 1; cursor: pointer; color: ${textMuted};
          display: flex; align-items: center; justify-content: center;
        }
        #app-download-popup-close:hover { color: ${text}; }

        .adp-header { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 4px; }
        .adp-icon-wrap {
          width: 64px; height: 64px; min-width: 64px; border-radius: 16px;
          background: ${bg}; overflow: hidden; display: flex; align-items: center;
          justify-content: center; box-shadow: 0 2px 6px rgba(60,64,67,0.17), 0 6px 16px rgba(60,64,67,0.09);
        }
        .adp-icon-wrap img { width: 100%; height: 100%; object-fit: contain; }

        .adp-title { font-size: 17px; font-weight: 700; color: ${text}; margin: 2px 0 4px; }
        .adp-dev { font-size: 12.5px; color: ${textMuted}; margin-bottom: 6px; }
        .adp-meta-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: ${textMuted}; }
        .adp-meta-row .stars { color: #fbbc04; letter-spacing: 1px; }
        .adp-meta-sep { width: 1px; height: 12px; background: ${border}; }

        .adp-sub {
          font-size: 13.5px; color: ${textMuted}; line-height: 1.55;
          margin: 16px 0 18px;
        }

        .adp-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 100%; padding: 12px 20px; border-radius: 24px;
          background: ${green}; color: #fff;
          font-weight: 700; font-size: 14.5px; text-decoration: none; box-sizing: border-box;
          transition: background 0.15s ease;
        }
        .adp-btn:hover { background: ${greenHover}; }

        .adp-later {
          display: block; width: 100%; margin-top: 10px; padding: 8px; font-size: 13px;
          color: ${laterColor}; background: none; border: none; cursor: pointer; text-align: center;
        }
      </style>
      <div id="app-download-popup-card">
        <button id="app-download-popup-close" aria-label="Close">&times;</button>

        <div class="adp-header">
          <div class="adp-icon-wrap">
            <img src="/images/other_images/ynclasses-logo.png" alt="YN CLASSES" />
          </div>
          <div>
            <div class="adp-title">YN CLASSES</div>
            <div class="adp-dev">YN CLASSES • Student App</div>
            <div class="adp-meta-row">
              <span>Education</span>
              <span class="adp-meta-sep"></span>
              <span class="stars">★★★★★</span>
            </div>
          </div>
        </div>

        <div class="adp-sub">Access your batches, tests, and dashboard faster with our official student app.</div>

        <a href="/android/download" id="app-download-popup-cta" class="adp-btn">Install</a>
        <button class="adp-later" id="app-download-popup-later">Maybe later</button>
      </div>
    `;
    return overlay;
  }

  function showPopup() {
    const overlay = buildPopup();
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    // Lock background scroll while the popup is up, so it stays put and
    // can't be scrolled past or accidentally tapped through.
    const scrollY = window.scrollY || window.pageYOffset;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";

    function close() {
      markSeen();
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 250);

      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
    }

    // Only the X button closes it now — no accidental backdrop taps or
    // Escape-key dismissals.
    overlay.querySelector("#app-download-popup-close").addEventListener("click", close);
    overlay.querySelector("#app-download-popup-later").addEventListener("click", close);
    overlay.querySelector("#app-download-popup-cta").addEventListener("click", close);
  }

  document.addEventListener("DOMContentLoaded", async function () {
    if (window.innerWidth > 900) return; // desktop/laptop: app install isn't relevant there
    if (hasSeenPopup()) return;
    const alreadyInstalled = await isAppAlreadyInstalled();
    if (alreadyInstalled) {
      markSeen(); // don't keep re-checking every visit
      return;
    }
    setTimeout(showPopup, SHOW_DELAY_MS);
  });
})();

// ===================================================
// SETUP NOTE for the installed-app check (getInstalledRelatedApps):
// Only works on Chrome for Android; every other browser silently
// falls back to "not installed" and always shows the popup.
//
// 1. Host this file at https://<your-domain>/.well-known/assetlinks.json:
//    [{
//      "relation": ["delegate_permission/common.handle_all_urls"],
//      "target": {
//        "namespace": "android_app",
//        "package_name": "in.ynclasses.app",
//        "sha256_cert_fingerprints": ["<YOUR_APK_SIGNING_SHA256_FINGERPRINT>"]
//      }
//    }]
//    Get the fingerprint from your keystore, e.g.:
//      keytool -list -v -keystore your-release-key.keystore
//    or via `eas credentials` if you're building with EAS.
//
// 2. Add to your site's web manifest (manifest.json):
//    "related_applications": [{ "platform": "play", "id": "in.ynclasses.app" }]
//
// Until step 1 is live, the check just always returns false (popup shows
// as it did before) — nothing breaks in the meantime.
// ===================================================
