import LegalPage from '@/components/site/LegalPage';
import { PRIVACY } from '@/lib/legalContent';

export const metadata = {
  title: 'Privacy Policy | Bihani Chemistry Classes, Sangamner',
  description: 'How Bihani Chemistry Classes, Sangamner collects, uses and protects student and visitor information, including Google sign-in, test data, cookies and payments.',
  alternates: { canonical: '/privacypolicy' },
};

export default function Page() {
  return <LegalPage doc={PRIVACY} />;
}
