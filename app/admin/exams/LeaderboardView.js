// app/admin/exams/LeaderboardView.js  (new file)
//
// Leaderboard of ONE exam (opened from the "Leaderboard" column on Admin -> Exams, next to
// "Online exam"). Same data and scoring as the old Admin -> Leaderboard page: it reads
// /api/admin/leaderboard?productId=<product> (that route is untouched), so the numbers match
// exactly. Only the screen is new:
//   * summary cards (students / top score / average / attempts) and a podium for the top 3
//   * Live results (scheduled exams) | Best score | By attempt number
//   * search by name or e-mail (ranks stay true), "show more" paging, student profile photos
//   * "Download PDF": opens the Leaderboard PDF window (/exams/leaderboard-pdf, see leaderboard-pdf/page.js)
//     with the rows of the tab on screen (hand-over through localStorage, key = ?draft=...)
// An exam can be online as several products: a product switch appears when there are more than one.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminHref } from "@/components/admin/useAdminHref";
import s from "./exams.module.css";
import b from "./leaderboard.module.css";

const PAGE = 50;
const pct = (n) => `${(Number(n) || 0).toFixed(1)}%`;
const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));
const initials = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

// profile photo, or the initials when the student has none / the picture does not load
function Photo({ url, name }) {
  const [bad, setBad] = useState(false);
  if (url && !bad) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={b.photo} referrerPolicy="no-referrer" loading="lazy" onError={() => setBad(true)} />;
  }
  return <>{initials(name)}</>;
}

export default function LeaderboardView({ title, products, onBack }) {
  const href = useAdminHref();
  const [pdfMsg, setPdfMsg] = useState("");
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [state, setState] = useState({ status: "loading", error: "" });
  const [data, setData] = useState(null);
  const [mode, setMode] = useState("best"); // live | best | attempt
  const [attemptNum, setAttemptNum] = useState(1);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!productId) return;
    let alive = true;
    setState({ status: "loading", error: "" });
    setData(null);
    fetch(`/api/admin/leaderboard?productId=${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Failed to load the leaderboard.");
        if (!alive) return;
        setData(json);
        setMode(json.isScheduled ? "live" : "best");
        setAttemptNum(1);
        setQuery("");
        setShown(PAGE);
        setState({ status: "ready", error: "" });
      })
      .catch((e) => alive && setState({ status: "error", error: e.message || "Failed to load the leaderboard." }));
    return () => { alive = false; };
  }, [productId, reloadKey]);

  const maxAttempts = useMemo(() => (data ? Math.max(1, ...data.leaderboard.map((x) => x.attempts.length)) : 1), [data]);
  const totalAttempts = useMemo(() => (data ? data.leaderboard.reduce((n, x) => n + x.attempts.length, 0) : 0), [data]);

  // sorted rows with a real rank (equal scores share a rank: 1, 1, 3 ...)
  const ranked = useMemo(() => {
    if (!data) return [];
    let out;
    if (mode === "live") {
      out = (data.liveLeaderboard || []).map((x) => ({ fullName: x.fullName, avatarUrl: x.avatarUrl, email: x.email, percentage: x.percentage, attemptNumber: 1 }));
    } else if (mode === "best") {
      out = data.leaderboard.map((x) => {
        const best = x.attempts.reduce((a, c) => (c.percentage > a.percentage ? c : a), x.attempts[0]);
        return { fullName: x.fullName, avatarUrl: x.avatarUrl, email: x.email, percentage: x.bestPercentage, attemptNumber: best.attemptNumber };
      });
    } else {
      out = data.leaderboard
        .filter((x) => x.attempts.some((a) => a.attemptNumber === attemptNum))
        .map((x) => {
          const a = x.attempts.find((y) => y.attemptNumber === attemptNum);
          return { fullName: x.fullName, avatarUrl: x.avatarUrl, email: x.email, percentage: a.percentage, attemptNumber: attemptNum };
        });
    }
    out.sort((a, c) => c.percentage - a.percentage);
    let rank = 0;
    return out.map((row, i) => {
      if (i === 0 || row.percentage.toFixed(2) !== out[i - 1].percentage.toFixed(2)) rank = i + 1;
      return { ...row, rank };
    });
  }, [data, mode, attemptNum]);

  const stats = useMemo(() => {
    if (!ranked.length) return { top: 0, avg: 0 };
    return { top: ranked[0].percentage, avg: ranked.reduce((n, x) => n + x.percentage, 0) / ranked.length };
  }, [ranked]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? ranked.filter((x) => x.fullName.toLowerCase().includes(q) || x.email.toLowerCase().includes(q)) : ranked),
    [ranked, q]
  );
  const visible = filtered.slice(0, shown);
  const podium = !q ? ranked.filter((x) => x.rank <= 3).slice(0, 3) : [];

  // Download PDF: leave the rows of the tab on screen for the PDF window, then open that window
  // (centred popup, like the PDF icon of the exams table; a normal tab if popups are blocked).
  const openPdfWindow = () => {
    if (!ranked.length) return;
    setPdfMsg("");
    const key = `lbpdf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const viewLabel = mode === "live" ? "Live results" : mode === "best" ? "Best score" : `Attempt ${attemptNum}`;
    const draft = {
      title: data?.productTitle || title || "Leaderboard",
      viewLabel,
      showAttempt: mode === "best", // best score: say which attempt it came from
      rows: ranked.map((x) => ({ name: x.fullName, percentage: x.percentage, attemptNumber: x.attemptNumber, avatarUrl: x.avatarUrl || "" })), // no e-mail addresses
    };
    try {
      // throw away drafts that were never opened (older than a day)
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i) || "";
        const t = /^lbpdf-([a-z0-9]+)-/.exec(k);
        if (t && Date.now() - parseInt(t[1], 36) > 86400000) localStorage.removeItem(k);
      }
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      setPdfMsg("The browser blocked local storage, so the PDF window cannot receive the leaderboard.");
      return;
    }
    const url = `${href("/exams/leaderboard-pdf")}?draft=${encodeURIComponent(key)}`;
    const w = 720;
    const h = 820;
    const left = Math.max(0, Math.round((window.screenX || 0) + ((window.outerWidth || w) - w) / 2));
    const top = Math.max(0, Math.round((window.screenY || 0) + ((window.outerHeight || h) - h) / 2));
    const win = window.open(url, `leaderboard-pdf-${key}`, `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);
    if (!win) window.open(url, "_blank");
    else win.focus();
  };

  const status = data
    ? !data.isScheduled
      ? { text: "Open anytime", cls: b.stNeutral }
      : data.resultDeclared
        ? { text: "Result declared", cls: b.stOk }
        : { text: "Live \u00b7 result not declared", cls: b.stLive }
    : null;

  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>Leaderboard</h1>
          <p className={s.subtitle}>{data?.productTitle || title}</p>
        </div>
        <div className={s.headBtns}>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setReloadKey((k) => k + 1)}>Refresh</button>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onBack}>&larr; Back to exams</button>
        </div>
      </div>

      {products.length > 1 && (
        <div className={b.switchRow}>
          <span className={b.switchLabel}>Online version</span>
          <div className={b.tabs} role="tablist">
            {products.map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={p.id === productId} className={`${b.tab} ${p.id === productId ? b.tabOn : ""}`} onClick={() => setProductId(p.id)} title={p.path || p.title}>
                {p.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.status === "loading" && <div className={s.empty}>Loading leaderboard&hellip;</div>}
      {state.status === "error" && (
        <p className={s.err}>
          {state.error}
          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
        </p>
      )}

      {state.status === "ready" && data && (
        <>
          <div className={b.stats}>
            <div className={b.stat}><span className={b.statNum}>{data.totalStudents}</span><span className={b.statLbl}>Students attempted</span></div>
            <div className={b.stat}><span className={b.statNum}>{ranked.length ? pct(stats.top) : "\u2014"}</span><span className={b.statLbl}>Top score</span></div>
            <div className={b.stat}><span className={b.statNum}>{ranked.length ? pct(stats.avg) : "\u2014"}</span><span className={b.statLbl}>Average score</span></div>
            <div className={b.stat}><span className={b.statNum}>{totalAttempts}</span><span className={b.statLbl}>Total attempts</span></div>
          </div>

          <div className={`${s.card} ${b.board}`}>
            <div className={b.toolbar}>
              <div className={b.tabs} role="tablist">
                {data.isScheduled && (
                  <button type="button" role="tab" aria-selected={mode === "live"} className={`${b.tab} ${mode === "live" ? b.tabOn : ""}`} onClick={() => { setMode("live"); setShown(PAGE); }}>Live results</button>
                )}
                <button type="button" role="tab" aria-selected={mode === "best"} className={`${b.tab} ${mode === "best" ? b.tabOn : ""}`} onClick={() => { setMode("best"); setShown(PAGE); }}>Best score</button>
                <button type="button" role="tab" aria-selected={mode === "attempt"} className={`${b.tab} ${mode === "attempt" ? b.tabOn : ""}`} onClick={() => { setMode("attempt"); setShown(PAGE); }}>By attempt</button>
              </div>
              {mode === "attempt" && (
                <select className={b.select} value={attemptNum} onChange={(e) => { setAttemptNum(parseInt(e.target.value, 10)); setShown(PAGE); }} aria-label="Attempt number">
                  {Array.from({ length: maxAttempts }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Attempt {n}</option>)}
                </select>
              )}
              {status && <span className={`${b.status} ${status.cls}`}>{status.text}</span>}
              <span className={b.grow} />
              <input className={b.search} value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder="Search name or e-mail" aria-label="Search students" />
              <button type="button" className={`${s.btn} ${s.btnSm} ${b.pdfBtn}`} onClick={openPdfWindow} disabled={!ranked.length}><span aria-hidden="true">PDF</span> Download PDF</button>
            </div>

            {pdfMsg && <p className={s.err}>{pdfMsg}</p>}

            {mode === "live" && <p className={b.notice}>Only students who attempted this exam live, inside the scheduled time, are counted here (first attempt only).</p>}

            {podium.length > 0 && (
              <div className={b.podium}>
                {podium.map((x) => (
                  <div key={x.email} className={`${b.pod} ${b["pod" + x.rank]}`}>
                    <span className={b.podRank}>#{x.rank}</span>
                    <span className={b.avatar}><Photo url={x.avatarUrl} name={x.fullName} /></span>
                    <span className={b.podName} title={x.fullName}>{x.fullName}</span>
                    <span className={b.podScore}>{pct(x.percentage)}</span>
                  </div>
                ))}
              </div>
            )}

            {ranked.length === 0 ? (
              <div className={s.empty}>
                {mode === "live" ? "No one attempted this exam live during the scheduled time." : "No attempts found for this view yet."}
              </div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.qTable}>
                  <thead>
                    <tr>
                      <th className={b.thRank}>Rank</th>
                      <th>Student</th>
                      <th className={b.thScore}>Score</th>
                      {mode !== "live" && <th className={b.thAttempt}>Attempt</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((x, i) => (
                      <tr key={x.email + i} className={x.rank <= 3 ? b[`top${x.rank}`] : ""}>
                        <td><span className={`${b.rank} ${x.rank <= 3 ? b["rank" + x.rank] : ""}`}>{x.rank}</span></td>
                        <td>
                          <div className={b.who}>
                            <span className={b.avatarSm}><Photo url={x.avatarUrl} name={x.fullName} /></span>
                            <div className={b.whoTxt}>
                              <div className={b.whoName}>{x.fullName}</div>
                              <div className={b.whoMail}>{x.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={b.scoreCell}>
                            <div className={b.track}><div className={b.fill} style={{ width: `${clamp(x.percentage)}%` }} /></div>
                            <span className={b.scoreNum}>{pct(x.percentage)}</span>
                          </div>
                        </td>
                        {mode !== "live" && <td><span className={b.attemptTag}>Attempt {x.attemptNumber}</span></td>}
                      </tr>
                    ))}
                    {visible.length === 0 && (
                      <tr><td colSpan={mode !== "live" ? 4 : 3} className={b.noMatch}>No student matches &ldquo;{query}&rdquo;.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {filtered.length > visible.length && (
              <div className={b.more}>
                <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setShown((n) => n + PAGE)}>
                  Show more ({filtered.length - visible.length} remaining)
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
