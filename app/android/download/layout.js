export const metadata = {
  title: "YN CLASSES App Download for Android | Official APK",
  description:
    "Download the official YN CLASSES Student App for Android. Access your batches, tests, and dashboard on the go. Free APK download, version 1.5-gamma.",
  keywords: [
    "YN CLASSES app",
    "YN CLASSES app download",
    "YN CLASSES apk",
    "YN CLASSES Android app",
    "YN CLASSES student app",
  ],
  alternates: {
    canonical: "https://ynclasses.in/android/download",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "YN CLASSES App Download for Android",
    description:
      "Get the official YN CLASSES Student App — batches, tests, and your dashboard, right on your phone.",
    url: "https://ynclasses.in/android/download",
    siteName: "YN CLASSES",
    images: [
      {
        url: "https://ynclasses.in/images/other_images/ynclasses-logo.png",
        width: 512,
        height: 512,
        alt: "YN CLASSES App Icon",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "YN CLASSES App Download for Android",
    description:
      "Get the official YN CLASSES Student App — batches, tests, and your dashboard, right on your phone.",
    images: ["https://ynclasses.in/images/other_images/ynclasses-logo.png"],
  },
};

// SoftwareApplication structured data — lets Google show this as a rich
// result (icon, rating, category) similar to a Play Store listing, and
// gives it a stronger signal that this page IS the app's download page.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "YN CLASSES",
  operatingSystem: "ANDROID",
  applicationCategory: "EducationApplication",
  applicationSubCategory: "Student App",
  softwareVersion: "1.5-gamma",
  image: "https://ynclasses.in/images/other_images/ynclasses-logo.png",
  publisher: {
    "@type": "Organization",
    name: "YN CLASSES",
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "INR",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "5",
    ratingCount: "1",
  },
};

export default function DownloadLayout({ children }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
