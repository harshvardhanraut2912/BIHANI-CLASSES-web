import SiteShell from '@/components/site/SiteShell';
import ContactForm from '@/components/site/ContactForm';
import { Ico, RingArt } from '@/components/site/icons';
import home from '@/components/home/home.module.css';
import { SITE, CONTACT, MAP } from '@/lib/siteConfig';
import s from '@/components/site/site.module.css';

export const metadata = {
  title: 'Contact Us | Bihani Chemistry Classes, Sangamner',
  description: 'Contact Bihani Chemistry Classes in Sangamner: call, WhatsApp, email or visit us. Send an enquiry or book a demo lecture for MHT-CET, JEE, NEET, Class 11 and Class 12 chemistry.',
  alternates: { canonical: '/contact' },
};

const CHECKLIST = [
  'A demo lecture is available on request before you enrol.',
  'Batch timings and the fee structure are shared during counselling.',
  'Please bring the latest marksheet when you visit.',
  'Seats per batch are limited, so an early enquiry helps.',
  'We reply fastest during class hours.',
];

export default function ContactPage() {
  return (
    <SiteShell>
      <main className={s.main}>
        <header className={`${s.hero} ${s.heroNoTabs}`}>
          <RingArt className={s.ringArt} />
          <div className={s.heroIn}>
            <p className={s.eyebrow}>Contact · {SITE.name}</p>
            <h1 className={s.h1}>Let&apos;s talk chemistry.</h1>
            <p className={s.lede}>Questions about batches, timings or fees? Want to sit in on a demo lecture first? Call us, message us or drop in, and we will guide you step by step.</p>
            <div className={s.heroBtns}>
              <a href={CONTACT.phoneHref} className={home.btnPrimary}>Call {CONTACT.phone}</a>
              <a href={CONTACT.whatsappHref} target="_blank" rel="noopener noreferrer" className={home.btnGhost}>WhatsApp us</a>
            </div>
          </div>
        </header>

        <section className={s.contactGrid}>
          <div className={s.infoCol}>
            <a className={s.infoCard} href={CONTACT.phoneHref}>
              <span className={s.infoIcon}><Ico name="phone" /></span>
              <span><span className={s.infoLabel}>Call us</span><span className={s.infoVal}>{CONTACT.phone}</span><span className={s.infoHint}>Best for quick admission queries</span></span>
            </a>
            <a className={s.infoCard} href={CONTACT.whatsappHref} target="_blank" rel="noopener noreferrer">
              <span className={`${s.infoIcon} ${s.infoWa}`}><Ico name="whatsapp" /></span>
              <span><span className={s.infoLabel}>WhatsApp</span><span className={s.infoVal}>{CONTACT.whatsapp}</span><span className={s.infoHint}>Message us, we reply in class hours</span></span>
            </a>
            <a className={s.infoCard} href={`mailto:${CONTACT.email}`}>
              <span className={s.infoIcon}><Ico name="mail" /></span>
              <span><span className={s.infoLabel}>Email</span><span className={s.infoVal}>{CONTACT.email}</span><span className={s.infoHint}>For detailed questions and documents</span></span>
            </a>
            <div className={s.infoCard}>
              <span className={s.infoIcon}><Ico name="pin" /></span>
              <span>
                <span className={s.infoLabel}>Visit us</span>
                <span className={s.infoVal}>{CONTACT.addressLines.join(', ')}</span>
                <span className={s.infoHint}>{CONTACT.landmark}</span>
                <a href={MAP.directions} target="_blank" rel="noopener noreferrer" className={s.infoLink}>Get directions <Ico name="arrow" size={14} /></a>
              </span>
            </div>
            <div className={s.infoCard}>
              <span className={s.infoIcon}><Ico name="clock" /></span>
              <span>
                <span className={s.infoLabel}>Class hours</span>
                {CONTACT.timings.map((t) => (<span key={t.days} className={s.hoursRow}><span>{t.days}</span><b>{t.hours}</b></span>))}
              </span>
            </div>
          </div>
          <ContactForm />
        </section>

        <section className={s.mapSection}>
          <div className={s.mapGrid}>
            <div className={s.mapCard}>
              <iframe title="Bihani Chemistry Classes on Google Maps" src={MAP.embed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
            </div>
            <div className={s.checkCard}>
              <h2 className={s.checkH}>Before you reach out</h2>
              <ul className={s.ul}>{CHECKLIST.map((c) => <li key={c}>{c}</li>)}</ul>
              <div className={s.checkBtns}>
                <a href={MAP.link} target="_blank" rel="noopener noreferrer" className={home.btnPrimary}>Open in Google Maps</a>
                <a href="/cources" className={home.btnGhost}>Browse courses</a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
