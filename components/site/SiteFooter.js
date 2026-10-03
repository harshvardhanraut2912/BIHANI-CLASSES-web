import { SITE, CONTACT } from '@/lib/siteConfig';
import s from './site.module.css';

export default function SiteFooter() {
  return (
    <footer className={s.foot}>
      <div className={s.footCols}>
        <div>
          <div className={s.footBrand}>
            <img src={SITE.logo} alt="" width="44" height="44" />
            <strong>{SITE.name}</strong>
          </div>
          <p>Concept-first chemistry coaching for Class 11, Class 12, MHT-CET, JEE and NEET in {SITE.city}.</p>
        </div>
        <div>
          <h3>Explore</h3>
          <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/cources">Courses</a></li>
            <li><a href="/gallery">Gallery</a></li>
            <li><a href="/contact">Contact</a></li>
            <li><a href="/login">Student Login</a></li>
          </ul>
        </div>
        <div>
          <h3>Legal</h3>
          <ul>
            <li><a href="/privacypolicy">Privacy Policy</a></li>
            <li><a href="/termsofuse">Terms of Use</a></li>
            <li><a href="/refundpolicy">Refund Policy</a></li>
          </ul>
        </div>
        <div>
          <h3>Reach us</h3>
          <ul>
            <li><a href={CONTACT.phoneHref}>{CONTACT.phone}</a></li>
            <li><a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></li>
            <li>{CONTACT.addressLines[1]}</li>
          </ul>
        </div>
      </div>
      <p className={s.footCopy}>© 2026 {SITE.name}. All rights reserved.</p>
    </footer>
  );
}
