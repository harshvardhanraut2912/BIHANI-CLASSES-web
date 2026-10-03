// app/admin/page.js  (replace the existing file)
//
// Admin homepage = the "Overview" panel (default screen of the admin panel).
// Served at admin.<your-domain>/ (proxy.js rewrites "/" to this page) and at
// <your-domain>/admin on hosts where a subdomain isn't possible.
// Intentionally empty for now: all old cards / shortcuts were removed while the
// new professional layout is being built. Widgets get added here later.
import s from "./dashboard.module.css";

export const metadata = { title: "Overview | Bihani Classes Admin" };

export default function AdminOverviewPage() {
  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>Overview</h1>
          <p className={s.subtitle}>Summary of your institute at a glance.</p>
        </div>
      </div>
      <p className={s.note}>Overview content will appear here.</p>
    </>
  );
}
