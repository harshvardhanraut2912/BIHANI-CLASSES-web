// app/admin/settings/page.js  (new file)
//
// Settings. A real folder, so it wins over the generic placeholder at
// app/admin/[panel]. Left = settings sections, right = the open section.
// "Developers" is password-protected (see DevPanel.js); leaving it locks it again.
"use client";

import { useState } from "react";
import s from "./settings.module.css";
import DevPanel from "./DevPanel";

const TABS = [
  { id: "general", label: "General", icon: "\u2699" },
  { id: "developers", label: "Developers", icon: "\uD83D\uDD12" },
];

export default function SettingsPage() {
  const [tab, setTab] = useState("general");

  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>Settings</h1>
          <p className={s.subtitle}>Manage how the admin panel and the site behave.</p>
        </div>
      </div>

      <div className={s.layout}>
        <nav className={s.tabs} aria-label="Settings sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`${s.tab} ${tab === t.id ? s.tabOn : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              <span className={s.tabIcon} aria-hidden="true">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div>
          {tab === "general" && (
            <section className={s.card}>
              <div className={s.cardHead}><h2 className={s.cardTitle}>General</h2></div>
              <div className={s.note}>General settings will appear here.</div>
            </section>
          )}
          {/* Mounted only while the tab is open, so leaving it always re-locks it. */}
          {tab === "developers" && <DevPanel />}
        </div>
      </div>
    </>
  );
}
