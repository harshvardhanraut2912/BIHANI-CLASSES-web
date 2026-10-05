// app/admin/inquiry-reports/page.js  (new file)
//
// Inquiry Reports. Same job as the older Contact Inquiries page (app/admin/inquiries):
// contact-form submissions from contact_inquiries, matched by e-mail with the student
// profile (online / offline / no account), and a "Received" button that marks them handled.
// Same API (/api/admin/inquiries) and the same realtime updates, in the new admin look,
// plus an All / Unread / Handled filter.
"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import s from "./inquiryReports.module.css";

const PAGE_SIZE = 25;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmtDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};
const key = (v) => (v ?? "").toString().trim().toLowerCase();
const isRead = (i) => key(i?.status) === "read";

function Presence({ profile }) {
  if (!profile) return <span className={s.muted}>No account</span>;
  return profile.is_online
    ? <span className={`${s.badge} ${s.good}`}><i /> Online</span>
    : <span className={s.badge}><i /> Offline</span>;
}

const Row = memo(function Row({ inquiry, profile, onOpen, onRead }) {
  const read = isRead(inquiry);
  return (
    <tr className={`${s.row} ${read ? "" : s.rowUnread}`} onClick={() => onOpen(inquiry)}>
      <td className={s.sender}>
        <strong title={inquiry.name}>{inquiry.name}</strong>
        <span title={inquiry.email}>{inquiry.email}</span>
      </td>
      <td className={s.nowrap}>{inquiry.mobile || "-"}</td>
      <td><div className={s.snippet} title={inquiry.message}>{inquiry.message}</div></td>
      <td className={s.nowrap}>{fmtDate(inquiry.created_at)}</td>
      <td><Presence profile={profile} /></td>
      <td><span className={`${s.badge} ${read ? s.good : s.bad}`}><i /> {read ? "Read" : inquiry.status || "Unread"}</span></td>
      <td onClick={(e) => e.stopPropagation()}>
        {read
          ? <span className={s.muted}>&#10003; Handled</span>
          : <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => onRead(inquiry.id)}>Received</button>}
      </td>
    </tr>
  );
});

export default function InquiryReportsPage() {
  const [inquiries, setInquiries] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all"); // all | unread | read
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState(null);
  const [actionErr, setActionErr] = useState("");

  const load = useCallback(async () => {
    try {
      setStatus("loading");
      setError("");
      const res = await fetch("/api/admin/inquiries", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load inquiries.");
      setInquiries(json.inquiries || []);
      const map = {};
      (json.profiles || []).forEach((p) => { if (p.email) map[key(p.email)] = p; });
      setProfiles(map);
      setStatus("ready");
    } catch (e) {
      setError(e.message || "Failed to load inquiries.");
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // live status / online updates
  useEffect(() => {
    const inq = supabase
      .channel("realtime-inquiry-reports")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contact_inquiries" }, (payload) => {
        setInquiries((prev) => prev.map((x) => (x.id === payload.new.id ? { ...x, ...payload.new } : x)));
        setSelected((prev) => (prev && prev.id === payload.new.id ? { ...prev, ...payload.new } : prev));
      })
      .subscribe();
    const prof = supabase
      .channel("realtime-inquiry-profiles")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        if (payload.new.email) setProfiles((prev) => ({ ...prev, [key(payload.new.email)]: payload.new }));
      })
      .subscribe();
    return () => { supabase.removeChannel(inq); supabase.removeChannel(prof); };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(input); setVisible(PAGE_SIZE); }, 200);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e) => { if (e.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  const markRead = useCallback(async (id) => {
    setActionErr("");
    try {
      const res = await fetch("/api/admin/inquiries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "Read" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to update the status.");
      setInquiries((prev) => prev.map((x) => (x.id === id ? { ...x, status: "Read" } : x)));
      setSelected((prev) => (prev && prev.id === id ? { ...prev, status: "Read" } : prev));
    } catch (e) {
      setActionErr(e.message || "Failed to update the status.");
    }
  }, []);

  const counts = useMemo(() => {
    const unread = inquiries.filter((x) => !isRead(x)).length;
    return { all: inquiries.length, unread, read: inquiries.length - unread };
  }, [inquiries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inquiries.filter((x) => {
      if (tab === "unread" && isRead(x)) return false;
      if (tab === "read" && !isRead(x)) return false;
      if (!q) return true;
      return (
        x.name?.toLowerCase().includes(q) ||
        x.email?.toLowerCase().includes(q) ||
        x.mobile?.toString().includes(q) ||
        x.message?.toLowerCase().includes(q)
      );
    });
  }, [inquiries, tab, search]);

  const profileOf = selected ? profiles[key(selected.email)] : null;

  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>Inquiry Reports</h1>
          <p className={s.subtitle}>Contact-form inquiries from the website. Mark them received once handled.</p>
        </div>
        <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={load} disabled={status === "loading"}>Refresh</button>
      </div>

      {actionErr && <p className={s.err}>{actionErr}</p>}

      {status === "loading" && <div className={`${s.card} ${s.empty}`}><span className={s.spin} />Loading inquiries&hellip;</div>}
      {status === "error" && (
        <p className={s.err}>
          {error}
          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={load}>Retry</button>
        </p>
      )}

      {status === "ready" && (
        <>
          <div className={s.pills}>
            <span className={s.pill}><b>{counts.all}</b> inquiries</span>
            <span className={`${s.pill} ${counts.unread ? s.pillBad : ""}`}><b>{counts.unread}</b> unread</span>
            <span className={`${s.pill} ${s.pillOk}`}><b>{counts.read}</b> handled</span>
          </div>

          <div className={s.bar}>
            <div className={s.tabs}>
              {[["all", "All"], ["unread", "Unread"], ["read", "Handled"]].map(([k, l]) => (
                <button key={k} type="button" className={`${s.tab} ${tab === k ? s.tabOn : ""}`} onClick={() => { setTab(k); setVisible(PAGE_SIZE); }}>{l}</button>
              ))}
            </div>
            <input className={s.search} placeholder="Search name, email, mobile or message…" value={input} onChange={(e) => setInput(e.target.value)} />
          </div>

          <div className={`${s.card} ${s.tableWrap}`}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Sender</th>
                  <th>Mobile</th>
                  <th>Message</th>
                  <th>Submitted</th>
                  <th>User</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className={s.empty}>No inquiries found.</td></tr>
                )}
                {filtered.slice(0, visible).map((x) => (
                  <Row key={x.id} inquiry={x} profile={profiles[key(x.email)]} onOpen={setSelected} onRead={markRead} />
                ))}
              </tbody>
            </table>
            {visible < filtered.length && (
              <div className={s.more}>
                <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setVisible((c) => c + PAGE_SIZE)}>
                  Load more ({filtered.length - visible} remaining)
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {selected && (
        <div className={s.overlay} onClick={() => setSelected(null)}>
          <div className={s.modal} role="dialog" aria-label="Inquiry details" onClick={(e) => e.stopPropagation()}>
            <div className={s.mHead}>
              <div>
                <h3 className={s.mTitle}>{selected.name}</h3>
                <div style={{ marginTop: 6 }}>
                  <span className={`${s.badge} ${isRead(selected) ? s.good : s.bad}`}><i /> {isRead(selected) ? "Read" : selected.status || "Unread"}</span>
                </div>
              </div>
              <button type="button" className={s.mX} onClick={() => setSelected(null)} aria-label="Close">&#10005;</button>
            </div>

            <div className={s.mBody}>
              <div className={s.infoGrid}>
                <div><div className={s.infoLabel}>Email</div><div className={s.infoValue}>{selected.email}</div></div>
                <div><div className={s.infoLabel}>Phone</div><div className={s.infoValue}>{selected.mobile || "-"}</div></div>
                <div><div className={s.infoLabel}>Submitted</div><div className={s.infoValue}>{fmtDate(selected.created_at)}</div></div>
              </div>

              <h4 className={s.h3}>Message</h4>
              <div className={s.msgBox}><p>{selected.message}</p></div>

              <h4 className={s.h3}>Account verification</h4>
              {profileOf ? (
                <div className={s.acct}>
                  <div className={s.acctTop}>
                    <strong>{profileOf.full_name || "Account found"}</strong>
                    <Presence profile={profileOf} />
                  </div>
                  <p><strong>Username:</strong> {profileOf.username || "-"}</p>
                  <p><strong>Class:</strong> {profileOf.current_class || "-"}</p>
                  <p><strong>Exam:</strong> {profileOf.is_exam_active ? "Taking an exam now" : "Not in an exam"}</p>
                </div>
              ) : (
                <p className={s.note}>No registered account matches this inquiry&apos;s email.</p>
              )}
            </div>

            <div className={s.mFoot}>
              <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setSelected(null)}>Close</button>
              {!isRead(selected) && <button type="button" className={s.btn} onClick={() => markRead(selected.id)}>Mark received</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
