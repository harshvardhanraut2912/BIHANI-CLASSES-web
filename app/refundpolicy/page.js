import LegalPage from '@/components/site/LegalPage';
import { REFUND } from '@/lib/legalContent';

export const metadata = {
  title: 'Cancellation & Refund Policy | Bihani Chemistry Classes, Sangamner',
  description: 'Cancellation and refund policy for Bihani Chemistry Classes, Sangamner: online batches, classroom seats, digital content, failed payments and refund timelines.',
  alternates: { canonical: '/refundpolicy' },
};

export default function Page() {
  return <LegalPage doc={REFUND} />;
}
