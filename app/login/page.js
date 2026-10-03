import LoginClient from '@/components/site/LoginClient';
import home from '@/components/home/home.module.css';
import { fontVars } from '@/components/site/fonts';
import s from '@/components/site/site.module.css';

export const metadata = {
  title: 'Student Login | Bihani Chemistry Classes, Sangamner',
  description: 'Sign in to the Bihani Chemistry Classes student portal to access your batches, chapter tests, analytics and notes.',
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <div className={`${home.home} ${s.root} ${fontVars}`}>
      <LoginClient />
    </div>
  );
}
