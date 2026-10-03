import HomeNavbar from '@/components/home/HomeNavbar';
import home from '@/components/home/home.module.css';
import SiteFooter from './SiteFooter';
import CookieBanner from './CookieBanner';
import { fontVars } from './fonts';
import s from './site.module.css';

// Same frame as the homepage / courses page: `.home` supplies the colour
// tokens + dark mode, HomeNavbar is the shared navbar. Children (<main>) and
// the footer are direct children of `.home`, so the site's 80% mobile scale
// applies to them exactly as it does on the homepage.
export default function SiteShell({ children }) {
  return (
    <div className={`${home.home} ${s.root} ${fontVars}`}>
      <HomeNavbar fontClass={fontVars} />
      {children}
      <SiteFooter />
      <CookieBanner />
    </div>
  );
}
