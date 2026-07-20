import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import PageEffects from '@/components/shared/PageEffects'
import Hero from '@/components/landing/Hero'
import TrustRibbon from '@/components/landing/TrustRibbon'
import Transformation from '@/components/landing/Transformation'
import ExplorePlatform from '@/components/landing/ExplorePlatform'
import PricingCta from '@/components/landing/PricingCta'

export const metadata = {
  title: 'seatspace \u2014 Fill Every Seat. Run the Whole Library.',
  description:
    'seatspace helps students discover and book study library seats nearby, and gives owners one place to run seats, staff, payments, memberships and books.',
  alternates: { canonical: '/' },
  openGraph: {
    url: '/',
    title: 'seatspace \u2014 Fill Every Seat. Run the Whole Library.',
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
        <Transformation />
        <ExplorePlatform />
        <PricingCta />
      </main>
      <Footer />
    </>
  )
}
