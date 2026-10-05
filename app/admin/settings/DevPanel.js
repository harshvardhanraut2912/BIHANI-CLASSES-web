// app/admin/settings/DevPanel.js  (new file)
//
// Settings -> Developers.
//   1. Locked: asks for the developer password (checked on the SERVER against
//      ADMIN_PASSWORD_KEY by /api/admin/dev/unlock -- never in the browser).
//   2. Unlocked: two sub-panels
//        - Subject access  (per-admin Physics / Chemistry / Mathematics / Biology switches)
//        - Maintenance     (website + app switches, no extra password)
// The server re-checks the developer cookie on every call, so this UI is only a
// convenience. Closing the tab / leaving the section locks it again.
"use client";

import { useCallback, useEffect, useState } from "react";
import s from "./settings.module.css";

async function api(url, options) {
  const res = await fetch(url, { cache: "no-store", ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong.");
    err.status = res.status;
    throw err;
  }
  return data;
}
const post = (url, body) => api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const fmtWhen = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
};

function Switch({ on, onChange, disabled, label, danger }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`${s.switch} ${on ? s.switchOn : ""} ${danger ? s.switchRed : ""}`} onClick={() => onChange(!on)} />
  );
}

/* ------------------------------------------------------------ subject access */
function SubjectAccess({ onExpired }) {
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const [busy, setBusy] = useState({}); // "email|Subject" -> true
  const [rowErr, setRowErr] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api("/api/admin/dev/access");
      setState({ status: "ready", data, error: "" });
    } catch (e) {
      if (e.status === 403) return onExpired();
      setState({ status: "error", data: null, error: e.message });
    }
  }, [onExpired]);

  useEffect(() => { load(); }, [load]);

  async function toggle(email, subject, allowed) {
    const key = `${email}|${subject}`;
    setRowErr("");
    setBusy((b) => ({ ...b, [key]: true }));
    const apply = (value) =>
      setState((st) => ({
        ...st,
        data: { ...st.data, admins: st.data.admins.map((a) => (a.email === email ? { ...a, access: { ...a.access, [subject]: value } } : a)) },
      }));
    apply(allowed); // optimistic
    try {
      await post("/api/admin/dev/access", { email, subject, allowed });
    } catch (e) {
      apply(!allowed); // put it back
      if (e.status === 403 && /developer/i.test(e.message)) return onExpired();
      setRowErr(e.message);
    } finally {
      setBusy((b) => { const { [key]: _x, ...rest } = b; return rest; });
    }
  }

  if (state.status === "loading") return <div className={s.note}>Loading admins&hellip;</div>;
  if (state.status === "error") {
    return (
      <p className={s.err}>
        {state.error}{" "}
        <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => { setState({ status: "loading", data: null, error: "" }); load(); }}>Retry</button>
      </p>
    );
  }

  const { admins, subjects, me, setupNeeded } = state.data;
  return (
    <>
      <p className={s.hint}>
        Switch a subject <strong>off</strong> to stop that admin from using it. They can&apos;t pick it, see its questions, or put it in an exam
        &mdash; which also blocks PCM and PCB exams if Physics, Mathematics or Biology is off. They see &ldquo;You don&apos;t have access to this.&rdquo;
        Changes apply immediately.
      </p>
      {setupNeeded && (
        <p className={s.warn}>
          The access table doesn&apos;t exist yet, so nothing can be saved. Run <strong>sql/003_dev_panel_subject_access.sql</strong> in the Supabase SQL editor, then reload.
        </p>
      )}
      {rowErr && <p className={s.err} style={{ marginBottom: 14 }}>{rowErr}</p>}
      {admins.length === 0 ? (
        <div className={s.note}>No admin accounts found.</div>
      ) : (
        <div className={s.adminList}>
          {admins.map((a) => (
            <div key={a.email} className={s.admin}>
              <div className={s.adminTop}>
                <span className={s.adminEmail}>{a.email}{a.email === me && <span className={s.you}>You</span>}</span>
                <span className={s.adminRole}>{a.role}</span>
              </div>
              <div className={s.subjGrid}>
                {subjects.map((subj) => {
                  const on = a.access[subj] !== false;
                  return (
                    <div key={subj} className={s.subjRow}>
                      <div>
                        <span className={s.subjName}>{subj}</span>
                        <span className={`${s.subjState} ${on ? "" : s.subjStateOff}`}>{on ? "Access on" : "Access off"}</span>
                      </div>
                      <Switch on={on} disabled={setupNeeded || !!busy[`${a.email}|${subj}`]} label={`${subj} access for ${a.email}`} onChange={(v) => toggle(a.email, subj, v)} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------------- maintenance */
function Maintenance({ onExpired }) {
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const [saving, setSaving] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api("/api/admin/dev/maintenance");
      setState({ status: "ready", data, error: "" });
    } catch (e) {
      if (e.status === 403) return onExpired();
      setState({ status: "error", data: null, error: e.message });
    }
  }, [onExpired]);

  useEffect(() => { load(); }, [load]);

  async function flip(field, value) {
    setErr("");
    setSaving(field);
    try {
      await post("/api/admin/dev/maintenance", { [field]: value });
      await load();
    } catch (e) {
      if (e.status === 403) return onExpired();
      setErr(e.message);
    } finally {
      setSaving("");
    }
  }

  if (state.status === "loading") return <div className={s.note}>Loading&hellip;</div>;
  if (state.status === "error") {
    return (
      <p className={s.err}>
        {state.error}{" "}
        <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => { setState({ status: "loading", data: null, error: "" }); load(); }}>Retry</button>
      </p>
    );
  }

  const d = state.data;
  const rows = [
    { field: "enabled", on: d.enabled, name: "Website maintenance", sub: "When ON, every visitor sees the \u201CUnder Maintenance\u201D page. The admin panel keeps working.", by: d.updatedBy, at: d.updatedAt },
    { field: "appEnabled", on: d.appEnabled, name: "App maintenance", sub: "When ON, logged-in users of the mobile app see the \u201CApp Under Construction\u201D screen. Login keeps working.", by: d.appUpdatedBy, at: d.appUpdatedAt },
  ];

  return (
    <>
      {err && <p className={s.err} style={{ marginBottom: 14 }}>{err}</p>}
      {rows.map((r) => (
        <div key={r.field} className={s.mRow}>
          <div>
            <div className={s.mName}>{r.name}</div>
            <div className={s.mSub}>{r.sub}</div>
            {(r.by || r.at) && <div className={s.mMeta}>Last changed{r.by ? ` by ${r.by}` : ""}{r.at ? ` \u00B7 ${fmtWhen(r.at)}` : ""}</div>}
          </div>
          <div className={s.mRight}>
            <span className={`${s.mState} ${r.on ? s.mOn : s.mOff}`}>{r.on ? "On" : "Off"}</span>
            <Switch on={r.on} danger disabled={saving === r.field} label={r.name} onChange={(v) => flip(r.field, v)} />
          </div>
        </div>
      ))}
    </>
  );
}

/* ---------------------------------------------------------------- the panel */
export default function DevPanel() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sub, setSub] = useState("access");

  // Leaving the Developers section (or the page) locks it again.
  useEffect(() => {
    const lock = () => { try { fetch("/api/admin/dev/unlock", { method: "DELETE", keepalive: true }); } catch {} };
    window.addEventListener("pagehide", lock);
    return () => { window.removeEventListener("pagehide", lock); lock(); };
  }, []);

  const relock = useCallback((message) => {
    setUnlocked(false);
    setPassword("");
    setError(message || "");
  }, []);
  const onExpired = useCallback(() => relock("Developer session expired. Enter the password again."), [relock]);

  async function submit(e) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await post("/api/admin/dev/unlock", { password });
      setPassword("");
      setSub("access");
      setUnlocked(true);
    } catch (err) {
      setError(err.message || "Could not verify the password.");
    } finally {
      setBusy(false);
    }
  }

  async function lockNow() {
    try { await api("/api/admin/dev/unlock", { method: "DELETE" }); } catch {}
    relock("");
  }

  if (!unlocked) {
    return (
      <section className={s.card}>
        <div className={s.cardHead}><h2 className={s.cardTitle}>Developers</h2></div>
        <div className={s.gate}>
          <div className={s.gateIcon} aria-hidden="true">{"\uD83D\uDD12"}</div>
          <p className={s.gateWarn}>This is a developers-only tab.</p>
          <p className={s.gateSub}>Admins aren&apos;t allowed here.</p>
          <form className={s.gateForm} onSubmit={submit}>
            <div>
              <label htmlFor="devPassword" className={s.label}>Developer password</label>
              <input id="devPassword" className={s.input} type="password" autoComplete="off" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className={s.err} role="alert">{error}</p>}
            <button type="submit" className={s.btn} disabled={busy || !password}>{busy ? "Checking\u2026" : "Unlock"}</button>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2 className={s.cardTitle}>Developers</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={s.badge}>Unlocked</span>
          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={lockNow}>Lock</button>
        </div>
      </div>
      <div className={s.subTabs} role="tablist">
        <button type="button" role="tab" aria-selected={sub === "access"} className={`${s.subTab} ${sub === "access" ? s.subTabOn : ""}`} onClick={() => setSub("access")}>Subject access</button>
        <button type="button" role="tab" aria-selected={sub === "maintenance"} className={`${s.subTab} ${sub === "maintenance" ? s.subTabOn : ""}`} onClick={() => setSub("maintenance")}>Maintenance mode</button>
      </div>
      <div className={s.cardBody}>
        {sub === "access" ? <SubjectAccess onExpired={onExpired} /> : <Maintenance onExpired={onExpired} />}
      </div>
    </section>
  );
}
