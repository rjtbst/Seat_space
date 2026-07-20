// src/app/(auth)/contact/page.tsx
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import { SITE } from '@/lib/config'

export const metadata = {
  title: 'Contact',
  description: `Get in touch with the ${SITE.name} team.`,
  alternates: { canonical: '/contact' },
}

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <main className="bg-surface min-h-screen" style={{ paddingTop: 120, paddingBottom: 100 }}>
        <div className="max-w-[720px] mx-auto px-6 md:px-10">

          <div className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue mb-3">
            Get in touch
          </div>
          <h1 className="font-syne text-[36px] md:text-[44px] font-extrabold text-ink leading-[1.1] mb-4">
            We usually reply within a day
          </h1>
          <p className="text-[15px] text-muted leading-relaxed max-w-[520px] mb-12">
            Whether it's a question about a booking, help getting your library set up,
            or something that just isn't working right — email is the fastest way to
            reach us.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-14">

            {/* Email */}
            <a
              href={`mailto:${SITE.contact.email}`}
              className="group block rounded-2xl border border-divider bg-cream/30 p-6 hover:border-blue hover:bg-blue-lt/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-lt flex items-center justify-center text-[18px] mb-4">
                ✉️
              </div>
              <div className="font-syne text-[15px] font-bold text-ink mb-1">Email us</div>
              <div className="text-[13.5px] text-blue font-medium">{SITE.contact.email}</div>
              <div className="text-[12.5px] text-pale mt-2">For students, owners, and everything else</div>
            </a>

            {/* Booking support */}
            <div className="rounded-2xl border border-divider bg-cream/30 p-6">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[18px] mb-4" style={{ background: '#D1FAE5' }}>
                📅
              </div>
              <div className="font-syne text-[15px] font-bold text-ink mb-1">Booking issue?</div>
              <div className="text-[13.5px] text-ink-2">
                Include your booking reference from the app — it's the fastest way for
                us to look into it.
              </div>
            </div>
          </div>

          {/* For owners */}
          <div className="rounded-2xl border border-divider p-7 mb-14">
            <div className="font-syne text-[16px] font-bold text-ink mb-2">
              Want to list your library?
            </div>
            <p className="text-[13.5px] text-muted leading-relaxed mb-4">
              Sign up as an owner and you can add your library, configure seats and
              pricing, and start accepting bookings the same day.
            </p>
            <a
              href="/login?mode=signup&role=owner"
              className="inline-block px-5 py-2.5 rounded-lg bg-blue text-white text-[13px] font-bold hover:bg-blue-dk transition-colors"
            >
              Get started
            </a>
          </div>

          {/* Company details */}
          <div className="pt-8 border-t border-divider text-[13px] text-pale leading-relaxed">
            <div className="font-semibold text-muted mb-1">{SITE.name}</div>
            <div>{SITE.location}, India</div>
            <div className="mt-3 text-[12px]">
              For legal or policy questions, see our{' '}
              <a href="/terms" className="text-blue underline">Terms</a>,{' '}
              <a href="/privacy" className="text-blue underline">Privacy Policy</a>, and{' '}
              <a href="/refunds" className="text-blue underline">Refund Policy</a>.
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
