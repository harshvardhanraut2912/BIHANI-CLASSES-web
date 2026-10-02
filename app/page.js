import { Bricolage_Grotesque, DM_Sans } from 'next/font/google';
import HomeNavbar from '@/components/home/HomeNavbar';
import { Photo, LegacyScripts, ToolTabs } from '@/components/home/HomeWidgets';
import { PeriodicTable } from '@/components/home/PeriodicTable';
import ChemScene from '@/components/home/ChemScene';
import styles from '@/components/home/home.module.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = DM_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata = {
  title: 'Bihani Chemistry Classes, Sangamner | MHT-CET, JEE, Class 11 & 12 Chemistry',
  description: 'Chemistry classes in Sangamner for MHT-CET Chemistry, JEE, Class 11, Class 12 and NEET. Concept-first teaching, regular practice and tests at Bihani Chemistry Classes.',
  keywords: ['Bihani Chemistry Classes', 'Chemistry Classes in Sangamner', 'MHT-CET Chemistry', 'Class 11 Chemistry', 'Class 12 Chemistry', 'NEET Chemistry', 'JEE Chemistry', 'Sangamner coaching'],
  openGraph: { title: 'Bihani Chemistry Classes, Sangamner', description: 'Chemistry coaching for MHT-CET, JEE, Class 11, Class 12 and NEET.', type: 'website', locale: 'en_IN', siteName: 'Bihani Chemistry Classes' },
};

/* ===== EDIT HERE: contact details. Replace each [ADD ...] with the real value. ===== */
const CONTACT = {
  address: '[ADD FULL ADDRESS]', landmark: '[ADD LANDMARK]', phone: '[ADD PHONE NUMBER]',
  whatsapp: '[ADD WHATSAPP NUMBER]', email: '[ADD EMAIL]', timings: '[ADD TIMINGS]',
};
const TEACHER = { qualification: '[ADD QUALIFICATION]', experience: '[ADD EXPERIENCE]' };
const SHOW_TESTIMONIALS = false; // set to true once real testimonials are filled in below
const MAP_EMBED = 'https://www.google.com/maps?q=Bihani+Chemistry+Classes+Sangamner&z=16&output=embed';
// For the exact pin: Google Maps > Share > Embed a map > copy the src="..." URL into MAP_EMBED.
const MAP_LINK = 'https://maps.app.goo.gl/7RY146xRVNLHtB4w8';
const DIRECTIONS = 'https://www.google.com/maps/dir/?api=1&destination=Bihani+Chemistry+Classes+Sangamner';

const INTRO = [
  { h: 'Concept First', p: 'Understand the reason behind every formula, reaction and concept.' },
  { h: 'Regular Practice', p: 'Solve questions progressively from basic to exam level.' },
  { h: 'Weekly Tests', p: 'Regular tests help identify weak chapters and improve exam readiness.' },
  { h: 'Doubt Solving', p: 'Get your chemistry doubts clarified during dedicated doubt-solving sessions.' },
];

const COURSES = [
  { icon: 'benzene', name: 'MHT-CET Chemistry', main: true, text: 'Chapter-wise preparation, MCQ practice, timed tests and previous-year question practice for MHT-CET.' },
  { icon: 'atom', name: 'JEE Chemistry', text: 'Strengthen concepts and develop problem-solving ability across physical, organic and inorganic chemistry.' },
  { icon: 'flask', name: 'Class 12 Chemistry', main: true, text: 'Complete your board chemistry preparation with focused theory, reactions, numericals and exam-oriented practice.' },
  { icon: 'tubes', name: 'Class 11 Chemistry', main: true, text: 'Build your foundation in physical, organic and inorganic chemistry while developing the problem-solving skills needed for Class 12 and entrance exams.' },
  { icon: 'beaker', name: 'NEET Chemistry', text: 'NCERT-focused preparation combined with MCQs, assertion-reasoning practice, numerical solving and regular tests.' },
  { icon: 'molecule', name: 'Foundation Chemistry', text: 'Build strong science and chemistry fundamentals before entering higher classes.' },
];

const SUBJECTS = [
  { name: 'Physical Chemistry', text: 'Understand the mathematics behind chemistry through concepts, formulas and systematic numerical practice.',
    items: ['Mole Concept', 'Atomic Structure', 'Thermodynamics', 'Chemical Equilibrium', 'Ionic Equilibrium', 'Electrochemistry', 'Chemical Kinetics', 'Solutions', 'Other syllabus topics'] },
  { name: 'Organic Chemistry', text: 'Learn reactions through concepts and mechanisms instead of memorising isolated reactions.',
    items: ['General Organic Chemistry', 'Hydrocarbons', 'Haloalkanes and Haloarenes', 'Alcohols, Phenols and Ethers', 'Aldehydes and Ketones', 'Carboxylic Acids', 'Amines', 'Biomolecules', 'Other syllabus topics'] },
  { name: 'Inorganic Chemistry', text: 'Build your understanding of periodic trends, chemical properties and important reactions.',
    items: ['Periodic Table', 'Chemical Bonding', 'Coordination Compounds', 'p-Block Elements', 'd- and f-Block Elements', 'Metallurgy', 'Qualitative concepts', 'Other syllabus topics'] },
];

const STEPS = [
  { n: '01', name: 'Concept', text: 'Understand the idea before memorising the formula.' },
  { n: '02', name: 'Explanation', text: 'Learn reactions, mechanisms and problem-solving methods step by step.' },
  { n: '03', name: 'Practice', text: 'Apply the concept through graded questions and numericals.' },
  { n: '04', name: 'Test & Analyse', text: 'Regular tests identify mistakes and show which topics need more attention.' },
];

const WHY = [
  { h: 'Chemistry-Focused Teaching', p: 'The institute focuses specifically on chemistry.' },
  { h: 'Concept-Oriented Learning', p: 'Focus on understanding concepts rather than relying only on memorisation.' },
  { h: 'Regular Tests', p: 'Frequent tests provide a consistent way to track preparation.' },
  { h: 'Doubt Solving', p: 'Students can discuss questions and clarify concepts during doubt-solving sessions.' },
  { h: 'Notes & Practice Material', p: 'Structured notes and practice questions are provided for revision.' },
  { h: 'Exam-Oriented Preparation', p: 'Preparation can be aligned with board exams, MHT-CET, JEE and NEET requirements.' },
];

const RESULTS = [{ y: '2026', e: 'MHT-CET' }, { y: '2026', e: 'JEE / NEET' }, { y: '2025', e: 'Class 12 Board' }];

const VOICES = [
  { q: '[ADD VERIFIED STUDENT TESTIMONIAL]', n: '[STUDENT NAME], [CLASS/EXAM]' },
  { q: '[ADD VERIFIED STUDENT TESTIMONIAL]', n: '[STUDENT NAME], [CLASS/EXAM]' },
  { q: '[ADD VERIFIED PARENT TESTIMONIAL]', n: '[PARENT NAME]' },
];

const FAQ = [
  ['Which classes do you teach?', 'Bihani Chemistry Classes provides chemistry coaching for Class 11, Class 12 and entrance-exam preparation including MHT-CET, JEE and NEET.'],
  ['Do you provide a demo lecture?', 'Yes. Students can contact the institute to enquire about available demo lectures.'],
  ['Do you provide notes and practice material?', '[ADD ACTUAL INFORMATION ABOUT NOTES/DPPs/STUDY MATERIAL]'],
  ['How often are tests conducted?', '[ADD ACTUAL TEST FREQUENCY]'],
  ['Can I join after the academic year has started?', '[ADD ACTUAL ADMISSION POLICY]'],
  ['Where are the classes located?', 'Bihani Chemistry Classes is located in Sangamner, Maharashtra. See the map and contact details above.'],
];

function Icon({ k }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const g = {
    flask: <><path d="M22 6h20M26 6v16L10 52a4 4 0 0 0 4 6h36a4 4 0 0 0 4-6L38 22V6" /><path d="M17 42h30" /></>,
    atom: <><ellipse cx="32" cy="32" rx="26" ry="10" /><ellipse cx="32" cy="32" rx="26" ry="10" transform="rotate(60 32 32)" /><ellipse cx="32" cy="32" rx="26" ry="10" transform="rotate(120 32 32)" /><circle cx="32" cy="32" r="3" fill="currentColor" /></>,
    benzene: <><path d="M32 8l20 12v24L32 56 12 44V20z" /><path d="M32 17l12 7v16l-12 7-12-7V24z" /></>,
    tubes: <><path d="M20 8v38a6 6 0 0 0 12 0V8M16 8h20M42 14v32a6 6 0 0 0 12 0V14M38 14h20" /><path d="M20 30h12M42 34h12" /></>,
    beaker: <><path d="M14 8h36M18 8v44a4 4 0 0 0 4 4h20a4 4 0 0 0 4-4V8" /><path d="M18 30h28M18 20h8M18 40h8" /></>,
    molecule: <><circle cx="16" cy="40" r="8" /><circle cx="46" cy="40" r="8" /><circle cx="32" cy="14" r="7" /><path d="M23 36l6-15M39 35l-5-14M24 40h14" /></>,
  };
  return <svg className={styles.cIcon} viewBox="0 0 64 64" aria-hidden="true" {...p}>{g[k]}</svg>;
}

function Contact({ dark }) {
  return (
    <ul className={dark ? undefined : styles.contactList}>
      <li><b>Address:</b> {CONTACT.address}</li>
      <li><b>Landmark:</b> {CONTACT.landmark}</li>
      <li><b>Phone:</b> {CONTACT.phone}</li>
      <li><b>WhatsApp:</b> {CONTACT.whatsapp}</li>
      <li><b>Class Timings:</b> {CONTACT.timings}</li>
    </ul>
  );
}

const jsonLd = {
  '@context': 'https://schema.org', '@type': 'EducationalOrganization', name: 'Bihani Chemistry Classes',
  description: 'Chemistry coaching for Class 11, Class 12, MHT-CET, JEE and NEET in Sangamner, Maharashtra.',
  areaServed: 'Sangamner, Maharashtra, India', address: { '@type': 'PostalAddress', addressLocality: 'Sangamner', addressRegion: 'Maharashtra', addressCountry: 'IN' },
};

export default function HomePage() {
  return (
    <div className={`${styles.home} ${display.variable} ${body.variable}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <HomeNavbar fontClass={`${display.variable} ${body.variable}`} />

      <header className={styles.hero}>
        <div className={styles.heroGrid}>
          <div>
            <ChemScene />
            <h1 className={styles.title}>Chemistry Made Clear. Built for MHT-CET, JEE and Boards.</h1>
            <p className={styles.lede}>Bihani Chemistry Classes, Sangamner: focused chemistry coaching for MHT-CET, JEE, Class 11, Class 12 and NEET.</p>
            <p className={styles.support}>Build your concepts first, strengthen them through problem-solving, and test your preparation regularly.</p>
            <div className={styles.ctas}>
              <a href="/cources" className={styles.btnPrimary}>Explore Courses</a>
              <a href="/contact" className={styles.btnGhost}>Book a Demo Lecture</a>
            </div>
            <p className={styles.trust}>Concepts • Problem Solving • Regular Tests • Doubt Solving</p>
          </div>
          <div className={styles.heroTable} aria-label="Interactive periodic table">
            <PeriodicTable />
          </div>
        </div>
      </header>

      <section className={styles.section} id="about">
        <div className={styles.wrap}>
          <h2 className={styles.h2}>Chemistry That You Actually Understand</h2>
          <div className={styles.introText}>
            <p>Chemistry becomes easier when concepts are understood instead of simply memorised. At Bihani Chemistry Classes, topics are taught step by step, followed by numerical practice, reaction-based learning and regular testing.</p>
            <p>Whether you are preparing for board examinations, MHT-CET, JEE or NEET, the goal is the same: build a strong chemistry foundation and learn how to apply it in questions.</p>
          </div>
          <div className={styles.grid4}>
            {INTRO.map((c) => (<div key={c.h} className={styles.card}><h3>{c.h}</h3><p>{c.p}</p></div>))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tint}`} id="courses">
        <div className={styles.wrap}>
          <h2 className={styles.h2}>Courses for Every Stage</h2>
          <p className={styles.sub}>MHT-CET and board chemistry are our main focus. JEE, NEET and foundation batches follow the same concept-first method.</p>
          <div className={styles.grid3}>
            {COURSES.map((c) => (
              <article key={c.name} className={`${styles.card} ${styles.course} ${c.name.startsWith('MHT') ? styles.main : ''}`}>
                {c.name.startsWith('MHT') && <span className={styles.badge}>Main focus</span>}
                <Icon k={c.icon} />
                <h3 className={styles.cName}>{c.name}</h3>
                <p className={styles.cText}>{c.text}</p>
                <a href="/cources" className={styles.cBtn}>View Course</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} id="syllabus">
        <div className={styles.wrap}>
          <h2 className={styles.h2}>Complete Chemistry Preparation</h2>
          <p className={styles.sub}>Physical, organic and inorganic chemistry, taught as connected parts of one subject.</p>
          <div className={styles.grid3}>
            {SUBJECTS.map((s) => (
              <div key={s.name} className={`${styles.card} ${styles.subj}`}>
                <h3>{s.name}</h3><p>{s.text}</p>
                <ul>{s.items.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
          <p className={styles.syllNote}>Topics are indicative and vary by course and exam. Please check the course page for the syllabus covered in each batch.</p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tint}`} id="method">
        <div className={styles.wrap}>
          <h2 className={styles.h2}>How We Teach Chemistry</h2>
          <p className={styles.sub}>Four steps, repeated for every chapter.</p>
          <ol className={styles.steps}>
            {STEPS.map((s) => (<li key={s.n} className={styles.step}><span className={styles.stepNo}>{s.n}</span><div className={styles.stepName}>{s.name}</div><p className={styles.stepText}>{s.text}</p></li>))}
          </ol>
          <p className={styles.note}>Every chapter follows a structured learning process so students know what they are learning, why they are learning it and how it will be tested.</p>
        </div>
      </section>

      <section className={styles.section} id="why">
        <div className={styles.wrap}>
          <h2 className={styles.h2}>Why Students Choose Bihani</h2>
          <p className={styles.sub}>What you can expect from the classroom.</p>
          <div className={styles.why}>
            {WHY.map((w) => (<div key={w.h} className={styles.whyItem}><h3>{w.h}</h3><p>{w.p}</p></div>))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tint}`} id="teacher">
        <div className={`${styles.wrap} ${styles.teacher}`}>
          <div><Photo src="/images/teacher_images/bihani-sir.jpg" alt="Prof. Bihani, chemistry teacher in Sangamner" label="Teacher photo" className={styles.portrait} /></div>
          <div>
            <h2 className={styles.h2}>Learn Chemistry with Prof. Bihani</h2>
            <p className={styles.sub} style={{ marginBottom: 0 }}>Prof. Bihani teaches chemistry with an emphasis on conceptual clarity, problem solving and exam preparation. The aim is to make chemistry easier to understand and easier to apply in questions.</p>
            <ul className={styles.facts}>
              <li><b>Qualification:</b> {TEACHER.qualification}</li>
              <li><b>Teaching Experience:</b> {TEACHER.experience}</li>
              <li><b>Specialisation:</b> Chemistry</li>
              <li><b>Location:</b> Sangamner, Maharashtra</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.section} id="results">
        <div className={styles.wrap}>
          <h2 className={styles.h2}>Student Results</h2>
          <p className={styles.sub}>Preparation is measured through consistent practice, regular testing and examination performance.</p>
          <div className={styles.log}>
            {RESULTS.map((r) => (<div key={r.e} className={styles.logItem}><div className={styles.logYear}>{r.y}</div><div className={styles.logExam}>{r.e}</div><div className={styles.logVal}>[ADD VERIFIED RESULT]</div></div>))}
          </div>
          <p className={styles.fine}>Results shown here will be updated with verified student achievements.</p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tint}`} id="classroom">
        <div className={styles.wrap}>
          <h2 className={styles.h2}>Inside the Classroom</h2>
          <p className={styles.sub}>Take a look at the learning environment at Bihani Chemistry Classes.</p>
          <div className={styles.gallery}>
            {[1, 2, 3].map((n) => (
              <div key={n} className={styles.shotBox}><Photo src={`/images/homepage_images/lab-${n}.jpg`} alt={`Classroom at Bihani Chemistry Classes, photo ${n}`} label="Classroom photo" className={styles.shot} /></div>
            ))}
          </div>
        </div>
      </section>

      {SHOW_TESTIMONIALS && (
        <section className={styles.section} id="voices">
          <div className={styles.wrap}>
            <h2 className={styles.h2}>What Students and Parents Say</h2>
            <div className={styles.grid3} style={{ marginTop: 28 }}>
              {VOICES.map((v, i) => (<figure key={i} className={`${styles.card} ${styles.voice}`}><blockquote>{v.q}</blockquote><figcaption>— {v.n}</figcaption></figure>))}
            </div>
          </div>
        </section>
      )}

      <section className={`${styles.section} ${SHOW_TESTIMONIALS ? styles.tint : ''}`} id="tools">
        <div className={styles.wrap}>
          <h2 className={styles.h2}>Explore Chemistry</h2>
          <p className={styles.sub}>Four free tools for revision. Use them any time.</p>
          <ToolTabs />
        </div>
      </section>

      <section className={`${styles.section} ${SHOW_TESTIMONIALS ? '' : styles.tint}`} id="demo">
        <div className={styles.wrap} style={{ textAlign: 'center' }}>
          <h2 className={styles.h2}>Start Your Chemistry Preparation</h2>
          <p className={styles.sub} style={{ margin: '0 auto 24px' }}>Want to understand how the classes work before joining? Attend a demo lecture and experience the teaching approach yourself.</p>
          <div className={styles.ctas} style={{ justifyContent: 'center', marginTop: 0 }}>
            <a href="/contact" className={styles.btnPrimary}>Book a Demo Lecture</a>
            <a href="/contact" className={styles.btnGhost}>Contact Us</a>
          </div>
          <p className={styles.trust}>Class 11 • Class 12 • MHT-CET • JEE • NEET</p>
        </div>
      </section>

      <section className={styles.section} id="location">
        <div className={`${styles.wrap} ${styles.locGrid}`}>
          <div>
            <h2 className={styles.h2}>Find Bihani Chemistry Classes</h2>
            <p className={styles.sub} style={{ marginBottom: 20 }}>Located in Sangamner, Maharashtra, Bihani Chemistry Classes provides chemistry-focused coaching for school and entrance-exam preparation.</p>
            <Contact />
            <div className={styles.ctas} style={{ marginTop: 0 }}>
              <a href={MAP_LINK} target="_blank" rel="noopener noreferrer" className={styles.btnPrimary}>Open in Google Maps</a>
              <a href="/contact" className={styles.btnGhost}>Contact Us</a>
            </div>
          </div>
          <div className={styles.phoneWrap}>
            <div className={styles.phone}>
              <div className={styles.island} />
              <div className={styles.screen}>
                <iframe className={styles.map} title="Bihani Chemistry Classes on Google Maps" src={MAP_EMBED} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
                <div className={styles.status}>
                  <span>9:41</span>
                  <svg width="62" height="14" viewBox="0 0 62 14" aria-hidden="true"><g fill="#000"><rect x="0" y="9" width="3" height="5" rx="1" /><rect x="5" y="6" width="3" height="8" rx="1" /><rect x="10" y="3" width="3" height="11" rx="1" /><rect x="15" y="0" width="3" height="14" rx="1" /><rect x="26" y="1" width="30" height="12" rx="4" fill="none" stroke="#000" strokeWidth="1.2" /><rect x="28" y="3" width="22" height="8" rx="2.5" /><rect x="57" y="5" width="2" height="4" rx="1" /></g></svg>
                </div>
                <div className={`${styles.search} ${styles.glass}`}><div><b>Bihani Chemistry Classes</b><span>Sangamner, Maharashtra</span></div></div>
                <div className={`${styles.sheet} ${styles.glass}`}>
                  <div><strong>Bihani Chemistry Classes</strong><br /><span>Chemistry coaching · Sangamner</span></div>
                  <div className={styles.sBtns}>
                    <a className={`${styles.sBtn} ${styles.pri}`} href={DIRECTIONS} target="_blank" rel="noopener noreferrer">Directions</a>
                    <a className={styles.sBtn} href={MAP_LINK} target="_blank" rel="noopener noreferrer">Open Maps</a>
                  </div>
                </div>
              </div>
              <div className={styles.homeBar} />
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tint}`} id="faq">
        <div className={`${styles.wrap} ${styles.faq}`}>
          <h2 className={styles.h2}>Frequently Asked Questions</h2>
          <p className={styles.sub}>Quick answers about classes, tests and joining.</p>
          {FAQ.map(([q, a]) => (<details key={q}><summary>{q}</summary><p>{a}</p></details>))}
        </div>
      </section>

      <footer className={styles.cta}>
        <div className={styles.ctaTop}>
          <div>
            <h2 className={styles.ctaTitle}>Make Chemistry Your Strong Subject.</h2>
            <p className={styles.ctaText}>Build your concepts, practise consistently and prepare with a structured approach to chemistry.</p>
          </div>
          <div className={styles.ctas} style={{ marginTop: 0 }}>
            <a href="/contact" className={styles.btnLight}>Book a Demo Lecture</a>
            <a href="/cources" className={styles.btnLine}>Explore Courses</a>
          </div>
        </div>
        <div className={styles.footCols}>
          <div><h3>Bihani Chemistry Classes</h3><p>Sangamner, Maharashtra</p></div>
          <div><h3>Courses</h3><ul>
            {['Class 11', 'Class 12', 'MHT-CET', 'JEE', 'NEET', 'Foundation'].map((c) => <li key={c}><a href="/cources">{c}</a></li>)}
          </ul></div>
          <div><h3>Contact</h3><ul>
            <li>Phone: {CONTACT.phone}</li><li>WhatsApp: {CONTACT.whatsapp}</li><li>Email: {CONTACT.email}</li><li>Address: {CONTACT.address}</li>
          </ul></div>
          <div><h3>Links</h3><ul>
            <li><a href="/">Home</a></li><li><a href="/cources">Courses</a></li><li><a href="#teacher">About</a></li><li><a href="/contact">Contact</a></li>
            <li><a href="/privacypolicy">Privacy Policy</a></li><li><a href="/termsofuse">Terms of Use</a></li><li><a href="/refundpolicy">Refund Policy</a></li>
          </ul></div>
        </div>
        <p className={styles.copy}>© 2026 Bihani Chemistry Classes. All rights reserved.</p>
      </footer>

      <LegacyScripts />
    </div>
  );
}
