import SiteShell from './SiteShell';
import LegalToc from './LegalToc';
import { Ico, RingArt } from './icons';
import home from '@/components/home/home.module.css';
import { SITE, CONTACT } from '@/lib/siteConfig';
import s from './site.module.css';

const POLICIES = [
  { href: '/privacypolicy', label: 'Privacy Policy', slug: 'privacypolicy' },
  { href: '/termsofuse', label: 'Terms of Use', slug: 'termsofuse' },
  { href: '/refundpolicy', label: 'Refund Policy', slug: 'refundpolicy' },
];
const TLDR_ICONS = ['shield', 'lock', 'check'];

/* **bold** and [[label|/path]] inside any string */
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/g).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('[[')) {
      const [label, href] = part.slice(2, -2).split('|');
      return <a key={i} href={href} className={s.inlineLink}>{label}</a>;
    }
    return part;
  });
}

function Block({ b }) {
  switch (b.type) {
    case 'p':
      return <p className={s.p}>{inline(b.text)}</p>;
    case 'list':
      return <ul className={s.ul}>{b.items.map((t, i) => <li key={i}>{inline(t)}</li>)}</ul>;
    case 'defs':
      return (
        <div className={s.defs}>
          {b.items.map((d) => (<div key={d.t} className={s.def}><p className={s.defT}>{d.t}</p><p className={s.defD}>{inline(d.d)}</p></div>))}
        </div>
      );
    case 'callout':
      return <div className={s.callout}>{inline(b.text)}</div>;
    case 'table':
      return (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, i) => (<tr key={i}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>))}</tbody>
          </table>
        </div>
      );
    case 'steps':
      return (
        <ol className={s.stepsList}>
          {b.items.map((it) => (<li key={it.t}><div><strong>{it.t}</strong><span>{inline(it.d)}</span></div></li>))}
        </ol>
      );
    default:
      return null;
  }
}

export default function LegalPage({ doc }) {
  return (
    <SiteShell>
      <main className={s.main}>
        <header className={s.hero}>
          <RingArt className={s.ringArt} />
          <div className={s.heroIn}>
            <p className={s.eyebrow}>{doc.eyebrow} · {SITE.name}</p>
            <h1 className={s.h1}>{doc.title}</h1>
            <p className={s.lede}>{doc.lede}</p>
            <div className={s.metaRow}>
              <span className={s.chip}><Ico name="file" size={15} /> Last updated {SITE.policiesUpdated}</span>
              <span className={s.chip}><Ico name="pin" size={15} /> {SITE.city}</span>
            </div>
            <nav className={s.policyTabs} aria-label="Legal pages">
              {POLICIES.map((p) => (
                <a key={p.slug} href={p.href} className={`${s.policyTab} ${p.slug === doc.slug ? s.policyTabOn : ''}`} aria-current={p.slug === doc.slug ? 'page' : undefined}>{p.label}</a>
              ))}
            </nav>
          </div>
        </header>

        <div className={s.legal}>
          <aside className={s.legalSide}>
            <LegalToc items={doc.sections.map(({ id, title }) => ({ id, title }))} />
            <div className={s.helpCard}>
              <strong>Need a hand?</strong>
              <span>Our team replies during class hours.</span>
              <a href="/contact" className={s.helpLink}>Contact us <Ico name="arrow" size={15} /></a>
            </div>
          </aside>

          <div className={s.legalBody}>
            <section className={s.tldr} aria-label="Summary">
              {doc.tldr.map((t, i) => (
                <div key={t.h} className={s.tldrCard}>
                  <span className={s.tldrIcon}><Ico name={TLDR_ICONS[i % 3]} size={20} /></span>
                  <h2 className={s.tldrH}>{t.h}</h2>
                  <p>{t.p}</p>
                </div>
              ))}
            </section>

            {doc.sections.map((sec, n) => (
              <section key={sec.id} id={sec.id} className={s.sec}>
                <div className={s.secHead}>
                  <span className={s.hex}>{String(n + 1).padStart(2, '0')}</span>
                  <h2 className={s.secTitle}>{sec.title}</h2>
                </div>
                {sec.blocks.map((b, i) => <Block key={i} b={b} />)}
              </section>
            ))}

            <div className={s.endCard}>
              <div>
                <h2 className={s.endTitle}>Still have a question?</h2>
                <p>Call {CONTACT.phone} or send us an enquiry. We are happy to explain anything in plain words.</p>
              </div>
              <div className={s.endBtns}>
                <a href="/contact" className={home.btnLight}>Contact us</a>
                <a href={CONTACT.whatsappHref} className={home.btnLine} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
