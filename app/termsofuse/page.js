import LegalPage from '@/components/site/LegalPage';
import { TERMS } from '@/lib/legalContent';

export const metadata = {
  title: 'Terms of Use | Bihani Chemistry Classes, Sangamner',
  description: 'Terms of Use for Bihani Chemistry Classes, Sangamner: account rules, course access, content licence, fair use of mock tests, payments and liability.',
  alternates: { canonical: '/termsofuse' },
};

export default function Page() {
  return <LegalPage doc={TERMS} />;
}
