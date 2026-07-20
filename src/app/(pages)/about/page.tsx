// src/app/(pages)/about/page.tsx
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import Link from 'next/link'
import { SITE, STATS, ROLES } from '@/lib/config'

export const metadata = {
  title: 'About',
  description: `Why ${SITE.name} exists, and who it's built for.`,
  alternates: { canonical: '/about' },
}

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main className="bg-surface">

        {/* Hero */}
        <section style={{ paddingTop: 140, paddingBottom: 80 }} className="px-6 md:px-10">
          <div className="max-w-[760px] mx-auto text-center">
            <div className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue mb-4">
              About {SITE.name}
            </div>
            <h1 className="font-syne text-[38px] md:text-[52px] font-extrabold text-ink leading-[1.08] mb-6">
              We got tired of showing up to a "full" library
              <span className="text-blue">.</span>
            </h1>
            <p className="text-[16px] md:text-[17px] text-muted leading-relaxed max-w-[560px] mx-auto">
              {SITE.name} started with a simple, annoying problem: walking to a study
              library in {SITE.location}, only to find every seat taken — no way to
              know beforehand. So we built the thing we wished existed: a live seat map,
              online booking, and a QR code at the door.
            </p>
          </div>
        </section>

        {/* Stats band */}
        <section className="border-y border-divider bg-cream/40 py-14 px-6 md:px-10">
          <div className="max-w-[900px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {STATS.map(s => (
              <div key={s.label}>
                <div className="font-syne text-[28px] md:text-[34px] font-extrabold text-ink">
                  {s.value.toLocaleString('en-IN')}{s.suffix}
                </div>
                <div className="text-[12px] text-muted mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* What we believe */}
        <section className="py-20 px-6 md:px-10">
          <div className="max-w-[760px] mx-auto">
            <h2 className="font-syne text-[26px] font-bold text-ink mb-8">
              What we're building toward
            </h2>
            <div className="space-y-8">
              <div className="flex gap-5">
                <div className="w-9 h-9 rounded-lg bg-blue-lt flex items-center justify-center flex-shrink-0 text-[16px]">🗺️</div>
                <div>
                  <div className="font-syne text-[15px] font-bold text-ink mb-1">Certainty before you leave home</div>
                  <p className="text-[14px] text-muted leading-relaxed">
                    No student should waste a commute finding out a library is full. If
                    a seat shows as available, it's available.
                  </p>
                </div>
              </div>
              <div className="flex gap-5">
                <div className="w-9 h-9 rounded-lg bg-green-lt flex items-center justify-center flex-shrink-0 text-[16px]">🏛️</div>
                <div>
                  <div className="font-syne text-[15px] font-bold text-ink mb-1">Fair economics for owners</div>
                  <p className="text-[14px] text-muted leading-relaxed">
                    Library owners set their own prices and keep the full amount they
                    list — our fee is added on top for the student to see, never
                    deducted from what an owner earns.
                  </p>
                </div>
              </div>
              <div className="flex gap-5">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[16px]" style={{ background: '#FBF3E0' }}>📚</div>
                <div>
                  <div className="font-syne text-[15px] font-bold text-ink mb-1">A quiet place to actually study</div>
                  <p className="text-[14px] text-muted leading-relaxed">
                    Seat booking, memberships, and book lending in one place — so
                    running a study library doesn't mean juggling paper registers and
                    phone calls.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Who it's for */}
        <section className="py-20 px-6 md:px-10 bg-cream/40 border-t border-divider">
          <div className="max-w-[1000px] mx-auto">
            <h2 className="font-syne text-[26px] font-bold text-ink mb-10 text-center">
              Built for three kinds of people
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ROLES.map(r => (
                <div key={r.title} className="bg-surface rounded-2xl border border-divider p-7">
                  <div className="text-[28px] mb-3">{r.emoji}</div>
                  <div className="font-syne text-[17px] font-bold text-ink mb-2">{r.title}</div>
                  <p className="text-[13.5px] text-muted leading-relaxed">{r.subtitle}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-6 md:px-10 text-center">
          <h2 className="font-syne text-[24px] font-bold text-ink mb-4">
            Have a library you'd like to list?
          </h2>
          <p className="text-[14px] text-muted mb-7">
            Get set up in minutes — no upfront cost to list your first library.
          </p>
          <Link
            href="/login?mode=signup&role=owner"
            className="inline-block px-7 py-3.5 rounded-xl bg-blue text-white text-[14px] font-bold hover:bg-blue-dk transition-colors"
          >
            List your library
          </Link>
        </section>
      </main>
      <Footer />
    </>
  )
}
