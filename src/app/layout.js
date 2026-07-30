// src/app/layout.tsx

import { Syne, Instrument_Serif, DM_Sans } from 'next/font/google'
import ChatWidget from '@/components/chat/ChatWidget'
import './globals.css'

const syne = Syne({ subsets: ['latin'], weight: ['400','500','600','700','800'], variable: '--font-syne', display: 'swap' })
const instrumentSerif = Instrument_Serif({ subsets: ['latin'], weight: ['400'], style: ['normal','italic'], variable: '--font-instrument', display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300','400','500','600','700'], variable: '--font-dm', display: 'swap' })

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://seatspace.in'

export const metadata = {
  metadataBase: new URL(BASE_URL),
  title: { default: 'seatspace — Book Study Seats Online | Haldwani Study Libraries', template: '%s | seatspace' },
  description: 'Find and book study seats at top libraries near you in Haldwani, UP. Check live seat availability, reserve online, pay via UPI, and get instant WhatsApp confirmation. Perfect for UPSC, SSC, bank exam aspirants.',
  keywords: ['library seat booking','study library near me','book study seat online','Haldwani study library','UPSC library Haldwani','library management software','seat reservation library','online library booking','study room booking','library seat availability','competitive exam library','SSC library Haldwani','bank exam library','reading room booking','study space near me','Uttar Pradesh study library','library membership online'],
  authors: [{ name: 'seatspace', url: BASE_URL }],
  creator: 'seatspace',
  publisher: 'seatspace',
  openGraph: {
    type: 'website', locale: 'en_IN', url: BASE_URL, siteName: 'seatspace',
    title: 'seatspace — Book Study Seats Online | Haldwani',
    description: 'Find the perfect study library near you, see live seat availability, and reserve your spot in 60 seconds. WhatsApp confirmation included.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'seatspace — Book Your Study Seat Online' }],
  },
  twitter: {
    card: 'summary_large_image', site: '@seatspace_in',
    title: 'seatspace — Book Study Seats Online',
    description: 'Find libraries near you, see live seat availability, book in 60 seconds. Now live in Haldwani, UP.',
    images: ['/og-image.png'],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 } },
  alternates: { canonical: BASE_URL },
  // manifest: '/site.webmanifest',
  verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '' },
  applicationName: 'seatspace',
  formatDetection: { telephone: false },
}

export const viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 4,
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#FDFCF9' }, { media: '(prefers-color-scheme: dark)', color: '#0A0D12' }],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${BASE_URL}/#website`, url: BASE_URL, name: 'seatspace', description: 'Book study seats at libraries near you', potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${BASE_URL}/search?q={search_term_string}` }, 'query-input': 'required name=search_term_string' } },
    { '@type': 'Organization', '@id': `${BASE_URL}/#organization`, name: 'seatspace', url: BASE_URL, logo: { '@type': 'ImageObject', url: `${BASE_URL}/logo.png`, width: 512, height: 512 }, address: { '@type': 'PostalAddress', addressLocality: 'Haldwani', addressRegion: 'UP', addressCountry: 'IN' }, contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: 'support@seatspace.in', availableLanguage: ['English', 'Hindi'] } },
    { '@type': 'SoftwareApplication', '@id': `${BASE_URL}/#app`, name: 'seatspace', applicationCategory: 'EducationApplication', operatingSystem: 'Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' }, aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', ratingCount: '2400', bestRating: '5' } },
    { '@type': 'FAQPage', '@id': `${BASE_URL}/#faq`, mainEntity: [
      { '@type': 'Question', name: 'How do I book a study seat at a library near me?', acceptedAnswer: { '@type': 'Answer', text: 'Search for libraries near you on seatspace, check live seat availability on the interactive seat map, select your seat and time slot, pay via UPI or card, and get instant WhatsApp confirmation — all in under 60 seconds.' } },
      { '@type': 'Question', name: 'Which libraries in Haldwani are on seatspace?', acceptedAnswer: { '@type': 'Answer', text: 'seatspace currently has 48+ study libraries in Haldwani, UP including Civil Lines, Shastri Nagar, Cantonment and more.' } },
      { '@type': 'Question', name: 'Can I book a study library seat for UPSC preparation?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. seatspace is built for UPSC, SSC, and bank exam students. Find quiet libraries, book daily or monthly seats, and access book lending.' } },
      { '@type': 'Question', name: 'How do I list my library on seatspace?', acceptedAnswer: { '@type': 'Answer', text: 'Library owners can sign up free, add library details, configure seats and pricing, and start accepting online bookings within minutes.' } },
    ]},
  ],
}



export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${syne.variable} ${instrumentSerif.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        <meta name="facebook-domain-verification" content="ki8f1mqw361b1dpdgh404oz9c9rk4y" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body className="font-dm bg-surface text-ink antialiased overflow-x-hidden">
        {children}
        <ChatWidget />
      </body>
    </html>
  )
}