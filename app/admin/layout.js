// app/admin/layout.js  (replace the existing file)
"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./admin.module.css";
import AdminShell from "@/components/admin/AdminShell";
import { NAV_ITEMS } from "@/components/admin/adminNav";
import shell from "@/components/admin/adminShell.module.css";
import { fontVars } from "@/components/site/fonts";

const ADMIN_SESSION_KEY = "cetwalle_admin_verified";

// On admin.<site> the dashboard lives at "/" (proxy.js rewrites it to
// /admin internally); on the plain-path fallback it is "/admin". Both are
// the dashboard / sign-in gate page.
function isAdminHomePath(p) {
  return p === "/admin" || p === "/admin/" || p === "/" || p === "";
}

// Pages that live inside the new sidebar shell: the homepage (Overview) plus every
// slug in adminNav.js. Older pages (cms-v2, users, ...) keep their own look until
// they are rebuilt and added to adminNav.js.
function isShellPath(p) {
  if (isAdminHomePath(p)) return true;
  const rest = p.startsWith("/admin/") ? p.slice("/admin".length) : p;
  const first = rest.split("/").filter(Boolean)[0];
  return NAV_ITEMS.some((i) => i.slug && i.slug === first);
}

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  // "checking" -> "verified" -> renders children
  // "checking" -> "denied"   -> shows the manual login gate (only on /admin itself)
  const [status, setStatus] = useState("checking");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Once verified, moving between sidebar panels must NOT re-run the security
  // check (that would flash "Running security check..." and remount the sidebar).
  const verifiedRef = useRef(false);
  useEffect(() => {
    verifiedRef.current = status === "verified";
  }, [status]);

  useEffect(() => {
    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // NOTE: the old bfcache "pageshow -> window.location.reload()" guard that
  // used to live here was removed. It was intended to fix stale React state
  // on back/forward navigation, but a reload can itself sometimes be flagged
  // as event.persisted=true by the browser, causing reload -> pageshow ->
  // reload -> pageshow forever (the exact infinite flashing loop you saw
  // between "Running security check..." and the login form). Since the
  // real access check has moved server-side into proxy.js, this component
  // no longer needs to force full reloads to stay correct — checkAccess()
  // re-runs on every pathname change anyway, which is enough.

  async function checkAccess() {
    if (verifiedRef.current) return;
    setStatus("checking");

    // 1. Already verified earlier this tab session? Skip the round trip.
    if (typeof window !== "undefined" && sessionStorage.getItem(ADMIN_SESSION_KEY) === "true") {
      setStatus("verified");
      return;
    }

    // 2. If they're already logged in via Supabase auth, check that email
    //    against admin_users (server-side, so the row itself never reaches the browser).
    try {
      const supabase = typeof window !== "undefined" ? window.supabaseClient : null;
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        const email = session?.user?.email;

        if (email) {
          const res = await fetch("/api/admin-check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          const result = await res.json();
          if (result.ok) {
            grantAccess();
            return;
          }
        }
      }
    } catch (e) {
      console.error("Admin session check failed:", e);
    }

    // 3. Not verified via the fast paths above. This component only ever
    //    renders at all if proxy.js's server-side gate already let the
    //    request through — which means EITHER:
    //      a) we're on /admin itself (the gate intentionally lets this
    //         page through unauthenticated so the login form can render), or
    //      b) we're on a nested page and the httpOnly admin cookie IS
    //         already valid server-side, but this client-side check (which
    //         only knows about sessionStorage / a live Supabase session)
    //         hasn't independently confirmed that yet.
    //    Previously this branch called router.replace('/admin') for nested
    //    paths — that's what caused the infinite flashing loop: middleware
    //    already redirects unauthenticated nested requests server-side, so
    //    this client-side redirect was racing against it and re-triggering
    //    checkAccess() over and over. We no longer redirect here at all —
    //    if we're on a nested page, the server already verified us, so we
    //    treat it as verified rather than second-guessing the server.
    if (!isAdminHomePath(pathname)) {
      setStatus("verified");
    } else {
      setStatus("denied");
    }
  }

  function grantAccess() {
    try {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
    } catch (e) {}
    setStatus("verified");
  }

  async function handleManualLogin(e) {
    e.preventDefault();
    setLoginError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const result = await res.json();

      if (!result.ok) {
        setLoginError(result.message || "Invalid admin email or password.");
        setIsSubmitting(false);
        return;
      }

      grantAccess();
    } catch (err) {
      setLoginError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ==========================================
  // SECURE LOGOUT
  // Clearing the sessionStorage flag alone is NOT enough — checkAccess()
  // step 2 will silently re-grant access on the next page load as long
  // as a live Supabase session's email is still in admin_users. So a
  // real logout also has to end that Supabase session (the same one
  // window.supabaseClient/auth.js manages site-wide), otherwise the
  // gate would never actually re-appear.
  // ==========================================
  async function handleAdminLogout() {
    if (isLoggingOut) return;

    const confirmed = window.confirm("Log out of the admin panel?");
    if (!confirmed) return;

    setIsLoggingOut(true);

    try {
      // 1. Drop the fast-path flag so this tab stops treating the
      //    panel as pre-verified.
      try {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
      } catch (e) {}

      // 1b. Clear the REAL security cookie (httpOnly admin session token).
      //     sessionStorage above was only ever a UI convenience flag — the
      //     actual server-enforced gate is the signed cookie set by
      //     /api/admin-login or /api/admin-check, verified by proxy.js on
      //     every /admin and /api/admin/* request. It must be explicitly
      //     cleared server-side or the admin panel would still be fully
      //     reachable (by anyone with this browser) until it naturally
      //     expires in 12 hours.
      try {
        await fetch("/api/admin-logout", { method: "POST" });
      } catch (e) {
        console.error("Failed to clear admin session cookie:", e);
      }

      // 2. End the underlying Supabase session too, if one exists —
      //    this is what actually stops checkAccess() step 2 from
      //    silently letting the admin back in on the next visit.
      //    Reuses the same global logout auth.js already exposes
      //    site-wide (clears cookies/localStorage, calls signOut()).
      if (typeof window !== "undefined" && typeof window.globalSecureLogout === "function") {
        await window.globalSecureLogout();
        // globalSecureLogout() already redirects to '/', so nothing
        // further to do — but guard below in case it's ever missing.
        return;
      }

      // Fallback, only reached if auth.js's global logout isn't
      // available for some reason: sign out directly and bounce to
      // the gate ourselves.
      const supabase = typeof window !== "undefined" ? window.supabaseClient : null;
      if (supabase) {
        await supabase.auth.signOut();
      }

      setStatus("denied");
      router.replace("/admin");
    } catch (err) {
      console.error("Admin logout failed:", err);
      setIsLoggingOut(false);
    }
  }

  if (status === "checking") {
    return (
      <div className={`${shell.gateWrap} ${fontVars}`}>
        <p className={shell.gateText}>Running security check&hellip;</p>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className={`${shell.gateWrap} ${fontVars}`}>
        <div className={shell.gateBrand}>
          <img src="/images/other_images/bihaniclasses-logo.png" alt="Bihani Classes" className={shell.gateLogo} />
          <div>
            <span className={shell.gateBrandText}>Bihani Classes</span>
            <span className={shell.gateBrandTag}>Admin Panel</span>
          </div>
        </div>

        <div className={shell.gateCard}>
          <h2>Admin Sign In</h2>
          <p className={shell.gateSub}>This area is restricted. Sign in with an admin account to continue.</p>

          <form onSubmit={handleManualLogin}>
            <div className={shell.gateField}>
              <label htmlFor="gateEmail">Admin Email</label>
              <input
                id="gateEmail"
                type="email"
                required
                autoComplete="username"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>
            <div className={shell.gateField}>
              <label htmlFor="gatePassword">Password</label>
              <input
                id="gatePassword"
                type="password"
                required
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>

            {loginError && <p className={shell.gateError}>{loginError}</p>}

            <button type="submit" className={shell.gateBtn} disabled={isSubmitting}>
              {isSubmitting ? "Checking..." : "Sign In"}
            </button>
          </form>
        </div>
        <p className={shell.gateFoot}>Authorised staff only. All access attempts are logged.</p>
      </div>
    );
  }

  // Overview + every sidebar panel: persistent blue sidebar, only {children} swaps.
  // Other (older) sub-pages keep their existing look + floating Logout button
  // until they are redesigned one by one.
  if (isShellPath(pathname)) {
    return (
      <div className={fontVars}>
        <AdminShell onLogout={handleAdminLogout} loggingOut={isLoggingOut}>
          {children}
        </AdminShell>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={styles.adminLogoutBtn}
        onClick={handleAdminLogout}
        disabled={isLoggingOut}
        title="Log out of the admin panel"
      >
        {isLoggingOut ? "Logging out..." : "Logout"}
      </button>
      {children}
    </>
  );
}
