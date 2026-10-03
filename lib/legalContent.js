// lib/legalContent.js
//
// The text of the three policies, as data. Numbers come from lib/siteConfig.js
// (POLICY) so they stay consistent across Terms / Refund Policy.
//
// Inline markup inside any string:  **bold**   and   [[link label|/path]]
// Block types: p, list, defs, callout, table, steps.
//
// NOTE: dummy business terms + generic legal wording. Have a lawyer review
// before launch.

import { SITE, CONTACT, POLICY as P } from './siteConfig';

const N = SITE.name;

/* ============================== PRIVACY ============================== */
export const PRIVACY = {
  slug: 'privacypolicy',
  eyebrow: 'Legal',
  title: 'Privacy Policy',
  lede: `How ${N} collects, uses and protects the information you share when you study with us, sign in to the student dashboard, or send us an enquiry.`,
  tldr: [
    { h: 'We collect what we need', p: 'Your Google sign-in details, class and exam target, test activity and payment references. Nothing more.' },
    { h: 'We never sell your data', p: 'Your details are used to run your preparation. They are not sold or rented to marketers.' },
    { h: 'You stay in control', p: 'Ask us to correct or delete your data, or stop non-essential messages, at any time.' },
  ],
  sections: [
    {
      id: 'about', title: 'About this policy',
      blocks: [
        { type: 'p', text: `${N} ("we", "us") runs chemistry coaching in ${SITE.city} for Class 11, Class 12, MHT-CET, JEE and NEET, led by ${SITE.teacher}. This policy covers our website, the student dashboard, the online test engine and our mobile app (together, the "Platform").` },
        { type: 'p', text: 'By using the Platform you agree to the practices described here. If you do not agree, please do not sign in or submit your details. This policy should be read with our [[Terms of Use|/termsofuse]] and [[Refund Policy|/refundpolicy]].' },
      ],
    },
    {
      id: 'collect', title: 'Information we collect',
      blocks: [
        { type: 'defs', items: [
          { t: 'Google sign-in details', d: 'Your name, email address and profile photo, shared by Google when you choose "Continue with Google". We never see or store your Google password.' },
          { t: 'Student profile', d: 'Details you enter during onboarding or on your profile page: full name, mobile number, current class and target exam (for example MHT-CET or HSC Boards).' },
          { t: 'Learning activity', d: 'Tests you attempt, your answers, scores, time spent per question, chapters you open and notes you make. We use this to build your reports and progress tracking.' },
          { t: 'Enquiry details', d: 'Name, phone number, email, class, target exam and message you send through the Contact form.' },
          { t: 'Payment records', d: 'Order ID, payment ID, amount, status and any coupon used. Your card, UPI or net-banking credentials are handled by Razorpay and never reach our servers.' },
          { t: 'Device and session data', d: 'IP address, browser and device type, session identifiers and an online / last-seen status, used to keep accounts secure and tests fair.' },
        ] },
      ],
    },
    {
      id: 'use', title: 'How we use it',
      blocks: [
        { type: 'list', items: [
          'To create your account and give you access to the batches, tests and study material you enrolled in.',
          'To score tests, generate rank and accuracy reports and show your progress by chapter.',
          'To confirm payments, issue receipts and handle refund requests.',
          'To reply to enquiries and book demo lectures.',
          'To send batch timings, test schedules and important announcements by email, WhatsApp, SMS or app notification.',
          'To protect the Platform and keep mock-test rankings fair (see Test integrity below).',
          'To improve our notes and test papers using anonymised, combined statistics such as average chapter scores.',
        ] },
        { type: 'callout', text: `**We do not sell your personal data**, phone number or email address to any third party or marketing company.` },
      ],
    },
    {
      id: 'google', title: 'Google sign-in',
      blocks: [
        { type: 'p', text: 'Students sign in with their Google account. Google tells us who you are (name, email, photo) and that you have authenticated; it does not give us your password. Google handles your sign-in under its own privacy policy. You can revoke our access at any time from your Google account settings.' },
      ],
    },
    {
      id: 'cookies', title: 'Cookies and browser storage',
      blocks: [
        { type: 'p', text: 'We use a small number of cookies and browser-storage items. None are used for advertising.' },
        { type: 'table', head: ['Item', 'Why we use it', 'How long it lasts'], rows: [
          ['Session cookie', 'Keeps you signed in while you move between pages and during a test.', '7 days if you accept cookies; otherwise only until you close the browser.'],
          ['Cookie choice', 'Remembers whether you accepted or declined cookies.', 'Accepted: remembered. Declined: asked again on your next visit.'],
          ['Theme setting', 'Remembers light or dark mode on your device.', 'Until you clear your browser storage.'],
        ] },
        { type: 'p', text: 'If you decline cookies, you can still use the Platform, but you will need to sign in again each time you reopen your browser, and automatic progress saving may be affected.' },
      ],
    },
    {
      id: 'integrity', title: 'Test integrity monitoring',
      blocks: [
        { type: 'p', text: 'To keep rankings fair, our test engine records signals that help us detect misuse during a test session, such as tab switches, multiple simultaneous logins and attempts to tamper with the test interface or extract question papers. Flagged sessions may be reviewed by our team. Confirmed misuse can lead to action under our [[Terms of Use|/termsofuse]].' },
      ],
    },
    {
      id: 'sharing', title: 'Who we share it with',
      blocks: [
        { type: 'p', text: 'We share information only with the service providers who help us run the Platform, and only as much as they need:' },
        { type: 'list', items: [
          '**Supabase**: database and sign-in services. Data may be stored on servers outside India, including in Singapore.',
          '**Razorpay**: payment processing, under its own security and privacy practices.',
          '**Google**: sign-in.',
          '**Vercel and Render**: hosting and server infrastructure.',
          '**Messaging and notification tools** that alert our team to new enquiries or payments, and let us send you announcements.',
        ] },
        { type: 'p', text: 'We may also disclose information when the law requires it, for example to answer a court order or a lawful government request, or to protect the rights and safety of our students and staff.' },
      ],
    },
    {
      id: 'retention', title: 'How long we keep it',
      blocks: [
        { type: 'p', text: 'We keep your account and learning data while your account is active and for a reasonable period afterwards so you can return to your records. Payment records are kept for as long as tax and accounting rules require. Enquiries are kept for a reasonable period so we can follow up. When data is no longer needed, we delete it or anonymise it.' },
      ],
    },
    {
      id: 'security', title: 'How we protect it',
      blocks: [
        { type: 'p', text: 'Data travels over encrypted connections, access to student records is restricted to authorised staff, and test content is protected on the server. No online service can promise perfect security, so please protect your own account too: do not share your login, and sign out on shared devices.' },
      ],
    },
    {
      id: 'rights', title: 'Your choices and rights',
      blocks: [
        { type: 'p', text: 'In line with applicable Indian law, including the Digital Personal Data Protection Act, 2023, you can ask us to:' },
        { type: 'list', items: [
          'Show you the personal data we hold about you.',
          'Correct anything that is wrong or out of date (you can also edit most details on your profile page).',
          'Delete your account and associated data, subject to records we must legally keep.',
          'Stop non-essential messages such as promotional announcements.',
          'Withdraw consent you have given us.',
        ] },
        { type: 'p', text: `Write to us using the details below. We aim to respond within ${P.dataRequestDays} days.` },
      ],
    },
    {
      id: 'children', title: 'Students under 18',
      blocks: [
        { type: 'p', text: 'Many of our students are under 18. Younger students should use the Platform with the knowledge and consent of a parent or guardian. A parent or guardian may contact us at any time to review, correct or delete their child\'s information.' },
      ],
    },
    {
      id: 'changes', title: 'Changes to this policy',
      blocks: [
        { type: 'p', text: `We may update this policy as the Platform grows. The "Last updated" date above always shows the current version, and continuing to use the Platform after a change means you accept it.` },
      ],
    },
    {
      id: 'contact', title: 'Contact and grievances',
      blocks: [
        { type: 'p', text: `For privacy questions, data requests or complaints, contact our ${CONTACT.grievanceOfficer}:` },
        { type: 'list', items: [
          `Email: **${CONTACT.privacyEmail}**`,
          `Phone / WhatsApp: **${CONTACT.phone}**`,
          `Address: ${CONTACT.addressOneLine}`,
        ] },
      ],
    },
  ],
};

/* ================================ TERMS ================================ */
export const TERMS = {
  slug: 'termsofuse',
  eyebrow: 'Legal',
  title: 'Terms of Use',
  lede: `The ground rules for studying with ${N}: your account, your course access, fair use of our material and tests, and what you can expect from us.`,
  tldr: [
    { h: 'Your account is yours alone', p: 'One student, one account. Sharing logins or running several sessions at once is not allowed.' },
    { h: 'Study material is for you', p: 'Notes, tests and videos are licensed for your personal use. Please do not forward or resell them.' },
    { h: 'Play fair in tests', p: 'Tampering with the test engine can lead to suspension, with no refund.' },
  ],
  sections: [
    {
      id: 'acceptance', title: 'Acceptance and eligibility',
      blocks: [
        { type: 'p', text: `These Terms apply whenever you use the ${N} website, student dashboard, test engine or mobile app (the "Platform"). By signing in, enrolling or making a payment, you agree to them together with our [[Privacy Policy|/privacypolicy]] and [[Refund Policy|/refundpolicy]].` },
        { type: 'defs', items: [
          { t: 'Age', d: 'If you are under 18, a parent or legal guardian must be aware of and agree to your enrolment and use of the Platform.' },
          { t: 'Accurate details', d: 'The information you give us (name, mobile number, class, target exam) must be true and kept up to date.' },
        ] },
      ],
    },
    {
      id: 'account', title: 'Your account',
      blocks: [
        { type: 'list', items: [
          'You sign in with Google. You are responsible for keeping your Google account secure.',
          'An account belongs to one student. Do not share your login, session or purchased access with anyone else.',
          `For fairness and security we may allow ${P.accessSession}. Signing in on a new device may sign you out of the old one.`,
          'Tell us right away if you think someone else has used your account.',
        ] },
      ],
    },
    {
      id: 'access', title: 'Courses and access',
      blocks: [
        { type: 'p', text: 'Enrolling in a batch gives you a personal, non-transferable right to use that batch\'s content on the Platform for the access period shown on its course page.' },
        { type: 'list', items: [
          'We may reorganise, improve or update chapters, notes and tests during the batch.',
          'Free batches and free material may be changed or withdrawn at any time.',
          'Classroom batch timings and venues can change; we will inform enrolled students in advance wherever possible.',
        ] },
      ],
    },
    {
      id: 'license', title: 'Our content and your licence',
      blocks: [
        { type: 'p', text: `All notes, question banks, tests, solutions, videos, designs and software on the Platform belong to ${N} and ${SITE.teacher}. You receive a limited, non-exclusive licence for personal, non-commercial study. You may not:` },
        { type: 'list', items: [
          'Copy, redistribute, sell or create new material from anything on the Platform.',
          'Post notes, tests, PDFs or videos on Telegram, WhatsApp groups, social media or file-sharing sites.',
          'Scrape, decompile or reverse-engineer any part of the Platform.',
          'Remove copyright notices or mirror our content elsewhere.',
        ] },
      ],
    },
    {
      id: 'tests', title: 'Fair use of tests',
      blocks: [
        { type: 'p', text: 'Our mock tests are built to feel like the real exam and to rank students honestly. The following are strictly prohibited:' },
        { type: 'list', items: [
          'Extracting questions, answer keys or hidden server data using developer tools or network inspection.',
          'Using bots, scripts or auto-clickers, or changing test timing.',
          'Bypassing the test interface or injecting your own code into it.',
          'Taking a test using another person\'s account, or letting someone else take yours.',
        ] },
        { type: 'callout', text: '**Consequences:** suspension or permanent closure of your account and loss of access to enrolled content, **with no refund** for the affected purchase.' },
      ],
    },
    {
      id: 'conduct', title: 'Respectful conduct',
      blocks: [
        { type: 'p', text: 'In doubt-solving chats, batch groups or any feedback form, please do not:' },
        { type: 'list', items: [
          'Harass, bully or abuse other students or staff, or share someone\'s private information.',
          'Pretend to be someone else.',
          'Post spam, scams or links to unrelated sites.',
          'Upload malware or try to disrupt or overload our systems.',
        ] },
      ],
    },
    {
      id: 'payments', title: 'Payments and coupons',
      blocks: [
        { type: 'p', text: 'Fees are shown in Indian rupees before you pay and are collected through Razorpay, which supports UPI, cards, net banking and wallets. Your enrolment is confirmed only after the payment succeeds.' },
        { type: 'list', items: [
          'Coupons are single-use unless stated otherwise, cannot be exchanged for cash and cannot be transferred.',
          'We may withdraw a coupon, or cancel an order placed with it, if it was obtained or used improperly.',
          'Refunds and cancellations are covered by our [[Refund Policy|/refundpolicy]].',
        ] },
      ],
    },
    {
      id: 'thirdparty', title: 'Third-party services',
      blocks: [
        { type: 'p', text: 'Sign-in, payments and hosting rely on providers such as Google, Razorpay, Supabase, Vercel and Render. Their services are governed by their own terms, and we are not responsible for outages or changes on their side.' },
      ],
    },
    {
      id: 'disclaimer', title: 'No guarantee of results',
      blocks: [
        { type: 'p', text: 'We teach with care and check our material carefully, but results depend on each student\'s effort and many factors outside our control. We do not guarantee any rank, score or college admission. If you spot a mistake in a question or solution, please use the "report error" option or contact us so we can fix it.' },
        { type: 'p', text: 'The Platform is provided "as is" and "as available". We aim for it to be reliable but cannot promise it will always be uninterrupted or error-free.' },
      ],
    },
    {
      id: 'liability', title: 'Limit of liability',
      blocks: [
        { type: 'p', text: 'To the extent the law allows, we are not liable for indirect or consequential losses arising from use of the Platform, and our total liability for any claim is limited to the fee you paid for the course or product the claim relates to, in the 12 months before the claim.' },
      ],
    },
    {
      id: 'suspension', title: 'Suspension and ending access',
      blocks: [
        { type: 'p', text: 'We may suspend or end access if these Terms are broken, if we suspect misuse of an account, or if the law requires it. You may stop using the Platform at any time and ask us to delete your account.' },
      ],
    },
    {
      id: 'law', title: 'Governing law',
      blocks: [
        { type: 'p', text: 'These Terms are governed by the laws of India. Courts in Maharashtra have jurisdiction over any dispute. We may update these Terms from time to time; using the Platform after an update means you accept the new version.' },
      ],
    },
    {
      id: 'contact', title: 'Contact us',
      blocks: [
        { type: 'p', text: 'Questions about these Terms?' },
        { type: 'list', items: [
          `Email: **${CONTACT.email}**`,
          `Phone / WhatsApp: **${CONTACT.phone}**`,
          `Address: ${CONTACT.addressOneLine}`,
        ] },
      ],
    },
  ],
};

/* ================================ REFUND ================================ */
export const REFUND = {
  slug: 'refundpolicy',
  eyebrow: 'Legal',
  title: 'Cancellation & Refund Policy',
  lede: `What you can cancel, what you can get back, and how long it takes. Written plainly, so you know before you pay.`,
  tldr: [
    { h: `${P.onlineRefundDays}-day cooling-off`, p: `Bought an online batch and haven't used it? Ask within ${P.onlineRefundDays} days for a refund.` },
    { h: 'Failed payment? Relax', p: `If money left your account but the order failed, it is usually reversed in ${P.failedReversalDays} business days.` },
    { h: 'Refunds go back to source', p: 'Approved refunds return to the original UPI, card or bank account through Razorpay.' },
  ],
  sections: [
    {
      id: 'glance', title: 'At a glance',
      blocks: [
        { type: 'table', head: ['What you bought', 'Refund?', 'Condition'], rows: [
          ['Online batch / course', 'Yes, within the cooling-off window', `Request within ${P.onlineRefundDays} days of purchase and before attempting any test or downloading material.`],
          ['Test series, question banks', 'No, once access starts', 'Instant digital access. Exceptions: duplicate payment or a technical fault we cannot fix.'],
          ['Notes and downloadable material', 'No, once downloaded', 'Digital goods that cannot be returned.'],
          ['Classroom batch seat', 'Yes, before the first class', `Refund minus a ${P.classroomAdminFeePct}% administrative charge. After the first class, only at our discretion.`],
          ['Failed or duplicate payment', 'Yes, in full', 'The extra or failed amount is returned.'],
          ['Batch cancelled by us', 'Yes', 'Full refund, or pro-rata if the batch had already started.'],
        ] },
      ],
    },
    {
      id: 'digital', title: 'Digital content',
      blocks: [
        { type: 'p', text: 'Test series, question banks, recorded lectures and downloadable notes are delivered to your dashboard the moment payment succeeds. Because you get access immediately and the content cannot be taken back, these purchases are generally **non-refundable** once access has been granted, except in the cases listed in this policy.' },
      ],
    },
    {
      id: 'online', title: 'Online batches: cooling-off window',
      blocks: [
        { type: 'p', text: `Changed your mind about an online batch? You can ask for a full refund within **${P.onlineRefundDays} days** of purchase, as long as you have not attempted any test, downloaded any material or used a large part of the content. After that window, or once substantial use has begun, the fee is non-refundable.` },
      ],
    },
    {
      id: 'classroom', title: 'Classroom batches',
      blocks: [
        { type: 'p', text: 'Your fee reserves a seat and covers teaching time, study material and classroom resources set aside for you.' },
        { type: 'list', items: [
          `**Before the batch starts:** you may cancel for a refund minus a ${P.classroomAdminFeePct}% administrative charge.`,
          '**After attending a class:** fees are non-refundable, except where the law requires or our management approves it case by case (for example a medical emergency).',
        ] },
      ],
    },
    {
      id: 'failed', title: 'Failed or duplicate payments',
      blocks: [
        { type: 'p', text: 'Network issues, bank delays or refreshing the checkout page can sometimes cause a failed or double charge.' },
        { type: 'list', items: [
          `If money was deducted but your enrolment was not confirmed, Razorpay normally reverses it automatically within **${P.failedReversalDays} business days**.`,
          'If you were charged twice for one order, send us the transaction ID or UTR number and we will refund the extra amount after checking.',
          'Keep your payment SMS or email. It speeds things up.',
        ] },
      ],
    },
    {
      id: 'cancelled', title: 'If we cancel or cannot deliver',
      blocks: [
        { type: 'p', text: 'You will get a full refund if we cancel or discontinue a batch or product before delivery, or if a technical fault on our side stops you from accessing what you paid for and we cannot resolve it within a reasonable time. If a batch is cancelled after it has started, the refund is pro-rata for the unused period.' },
      ],
    },
    {
      id: 'notcovered', title: 'What is not refundable',
      blocks: [
        { type: 'list', items: [
          'Change of mind after content has been accessed or downloaded.',
          'Missed classes or tests for personal reasons.',
          'Device or internet problems on your side.',
          'Accounts suspended for breaking our [[Terms of Use|/termsofuse]], including test tampering or sharing logins.',
          'Coupon value. Refunds are for the amount you actually paid.',
        ] },
      ],
    },
    {
      id: 'request', title: 'How to request a refund',
      blocks: [
        { type: 'steps', items: [
          { t: 'Contact us', d: `Email ${CONTACT.email} or message ${CONTACT.whatsapp} on WhatsApp.` },
          { t: 'Share the details', d: 'Your registered name, email and mobile number, the Razorpay payment ID, the batch or product, and the reason.' },
          { t: 'We acknowledge', d: `You will hear back within ${P.ackHours} hours.` },
          { t: 'We decide', d: `We review and reply with a decision within ${P.decisionDays} working days.` },
        ] },
      ],
    },
    {
      id: 'timelines', title: 'Refund timelines',
      blocks: [
        { type: 'p', text: `After approval we start the refund through Razorpay within **${P.initiateDays} business days**. The time to reach you then depends on your bank or payment app:` },
        { type: 'table', head: ['Payment method', 'Usual time after we initiate'], rows: [
          ['UPI', '1–3 business days'],
          ['Debit / credit card', '5–7 business days'],
          ['Net banking', '3–5 business days'],
          ['Wallet', '1–3 business days'],
        ] },
        { type: 'p', text: `Banks and payment apps set these timelines, not us. If your refund has not arrived ${P.escalateDays} business days after approval, send us your transaction ID and we will follow it up with Razorpay.` },
      ],
    },
    {
      id: 'method', title: 'Where the money goes',
      blocks: [
        { type: 'p', text: 'Refunds always return to the **original payment method**. We cannot send them to a different account, a different person or pay them out in cash. If you paid with a coupon or discount, the refund is the amount actually paid.' },
      ],
    },
    {
      id: 'disputes', title: 'Disputes and chargebacks',
      blocks: [
        { type: 'p', text: 'If something looks wrong, please talk to us first. We would rather fix it than have you go through a bank dispute. Raising a chargeback for a purchase that is covered by this policy may delay your refund.' },
      ],
    },
    {
      id: 'changes', title: 'Changes to this policy',
      blocks: [
        { type: 'p', text: 'We may update this policy to reflect changes in our batches, our payment partner or the law. The version in force on the day you pay is the one that applies to your purchase.' },
      ],
    },
    {
      id: 'contact', title: 'Contact us',
      blocks: [
        { type: 'p', text: 'For refund or payment questions:' },
        { type: 'list', items: [
          `Email: **${CONTACT.email}**`,
          `Phone / WhatsApp: **${CONTACT.phone}**`,
          `Address: ${CONTACT.addressOneLine}`,
        ] },
      ],
    },
  ],
};
