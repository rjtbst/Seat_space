import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import PageEffects from '@/components/shared/PageEffects'
import Hero from '@/components/landing/Hero'
import TrustRibbon from '@/components/landing/TrustRibbon'
import HowItWorks from '@/components/landing/HowItWorks'
import Transformation from '@/components/landing/Transformation'
import OutcomeGroups from '@/components/landing/OutcomeGroups'
import OperatingSystem from '@/components/landing/OperatingSystem'
import ExplorePlatform from '@/components/landing/ExplorePlatform'
import FAQ from '@/components/landing/FAQ'
import PricingCta from '@/components/landing/PricingCta'

export const metadata = {
  title: 'seatspace \u2014 Find Your Seat. Run Your Library.',
  description:
    'seatspace connects students to real study libraries nearby with live seat availability, and gives owners one dashboard to run seats, staff, payments and books.',
  alternates: { canonical: '/' },
  openGraph: {
    url: '/',
    title: 'seatspace \u2014 Find Your Seat. Run Your Library.',
    description:
      'Students find and book seats nearby. Owners run the whole library \u2014 seats, staff, payments, memberships and books \u2014 from one place.',
  },
}

export default function HomePage() {
  return (
    <>
      <PageEffects />
      <Navbar />
      <main>
        <Hero />
        <TrustRibbon />
        <HowItWorks />
        <Transformation />
        <OutcomeGroups />
        <OperatingSystem />
        <ExplorePlatform />
        <FAQ />
        <PricingCta />
      </main>
      <Footer />
    </>
  )
}
