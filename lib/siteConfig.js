// lib/siteConfig.js
//
// ONE place for the brand + contact details used by the Privacy Policy,
// Terms of Use, Refund Policy, Contact page, Login page and shared footer.
//
// >>> Everything under CONTACT is DUMMY data. Replace it before launch. <<<
// The policy text reads its numbers (refund window, admin fee ...) from
// POLICY below, so changing a number here updates the policy text too.

export const SITE = {
  name: 'Bihani Chemistry Classes',
  short: 'Bihani Classes',
  tagline: 'Chemistry · Sangamner',
  teacher: 'Prof. Bihani',
  city: 'Sangamner, Maharashtra',
  logo: '/images/other_images/bihaniclasses-logo.png',
  policiesUpdated: 'October 2026',
};

export const CONTACT = {
  phone: '+91 98765 43210',
  phoneHref: 'tel:+919876543210',
  whatsapp: '+91 98765 43210',
  whatsappHref: 'https://wa.me/919876543210',
  email: 'hello@bihaniclasses.in',
  privacyEmail: 'privacy@bihaniclasses.in',
  addressLines: ['Shop No. 12, Bihani Complex', 'Near Bus Stand, Sangamner', 'Maharashtra 422605'],
  addressOneLine: 'Shop No. 12, Bihani Complex, Near Bus Stand, Sangamner, Maharashtra 422605',
  landmark: 'Opposite the bus stand',
  timings: [
    { days: 'Monday to Saturday', hours: '8:00 AM – 7:00 PM' },
    { days: 'Sunday', hours: '9:00 AM – 1:00 PM' },
  ],
  grievanceOfficer: 'Prof. Bihani (Grievance Officer)',
};

export const MAP = {
  embed: 'https://www.google.com/maps?q=Bihani+Chemistry+Classes+Sangamner&z=16&output=embed',
  link: 'https://maps.app.goo.gl/7RY146xRVNLHtB4w8',
  directions: 'https://www.google.com/maps/dir/?api=1&destination=Bihani+Chemistry+Classes+Sangamner',
};

// Business terms quoted in the Refund Policy / Terms. Dummy defaults -- edit to match your real rules.
export const POLICY = {
  onlineRefundDays: 3,          // cooling-off window for online batches (days after purchase)
  classroomAdminFeePct: 10,     // % kept as admin charge when a classroom seat is cancelled before day 1
  ackHours: 48,                 // we acknowledge a refund request within this many hours
  decisionDays: 5,              // working days to review + decide
  initiateDays: '3–5',          // business days to push an approved refund to Razorpay
  failedReversalDays: '5–7',    // business days for auto-reversal of failed payments
  escalateDays: 10,             // business days after approval before the student should escalate
  dataRequestDays: 30,          // days to respond to a privacy request
  accessSession: 'one active session at a time',
};
