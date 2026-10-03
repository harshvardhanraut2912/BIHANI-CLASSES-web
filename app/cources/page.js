// SAVE THIS FILE AT: app/cources/page.js  (new file -- replaces public/cources.html)
//
// /cources is now a real Next.js page instead of a static HTML file. The
// page shell (fonts, SEO metadata, navbar, footer) renders on the server; the
// interactive store (Supabase data, search, enroll buttons) lives in the
// CoursesStore client component. Individual batch pages stay where they were,
// at app/cources/<slug>/page.js.

import { Bricolage_Grotesque, DM_Sans } from 'next/font/google';
import HomeNavbar from '@/components/home/HomeNavbar';
import { LegacyScripts } from '@/components/home/HomeWidgets';
import CoursesStore from '@/components/courses/CoursesStore';
import home from '@/components/home/home.module.css';
import s from '@/components/courses/courses.module.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = DM_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata = {
  title: 'Batches & Courses | Bihani Chemistry Classes, Sangamner',
  description:
    'Explore chemistry batches and test series at Bihani Chemistry Classes, Sangamner: MHT-CET, JEE, NEET, Class 11 and Class 12. Enroll online and study from your dashboard.',
};

export default function CourcesPage() {
  return (
    <div className={`${home.home} ${display.variable} ${body.variable}`}>
      <HomeNavbar fontClass={`${display.variable} ${body.variable}`} />

      <main className={s.page}>
        <CoursesStore />
      </main>

      <footer className={s.footer}>
        <div className={s.footIn}>
          <strong>Bihani Chemistry Classes</strong>
          <span className={s.footLinks}>
            <a href="/">Home</a>
            <a href="/cources">Courses</a>
            <a href="/gallery">Gallery</a>
            <a href="/contact">Contact</a>
          </span>
        </div>
        <p className={s.footCopy}>© 2026 Bihani Chemistry Classes. All rights reserved.</p>
      </footer>

      <LegacyScripts />
    </div>
  );
}
