// app/admin/[panel]/page.js  (new file)
//
// TEMPORARY placeholder for every demo sidebar button (students, exams, ...).
// It only exists so the sidebar buttons switch the URL + right-hand screen today.
// When you build a real page, create app/admin/<slug>/page.js -- a real folder
// automatically takes priority over this file. Delete this file once all demo
// entries have real pages.
import { notFound } from "next/navigation";
import { NAV_ITEMS } from "@/components/admin/adminNav";
import s from "../dashboard.module.css";

export async function generateMetadata({ params }) {
  const { panel } = await params;
  const item = NAV_ITEMS.find((i) => i.slug && i.slug === panel);
  return { title: `${item ? item.label : "Page"} | Bihani Classes Admin` };
}

export default async function AdminDemoPanel({ params }) {
  const { panel } = await params;
  const item = NAV_ITEMS.find((i) => i.slug && i.slug === panel);
  if (!item) notFound();

  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>{item.label}</h1>
          <p className={s.subtitle}>This section is under construction.</p>
        </div>
      </div>
      <p className={s.note}>{item.label} content will appear here.</p>
    </>
  );
}
