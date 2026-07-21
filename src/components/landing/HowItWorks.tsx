import { Search, CalendarCheck, LayoutDashboard } from 'lucide-react'

// Each step reflects an actual implemented flow — not aspirational copy:
// discovery = src/app/(student)/explore (city/GPS/amenity search), booking =
// the seat-hold-then-pay flow, management = the owner dashboard + staff
// check-in that reads/writes the same seat records.
const STEPS = [
  {
    icon: Search,
    audience: 'Students',
    title: 'Discover',
    body: 'Search libraries near you by city, distance or open-now status, filter by amenities, and see real seat availability before you leave home.',
  },
  {
    icon: CalendarCheck,
    audience: 'Students',
    title: 'Book',
    body: 'Reserve a seat or subscribe to a membership plan in a few taps, and pay online — no calls, no walking in to check first.',
  },
  {
    icon: LayoutDashboard,
    audience: 'Owners & staff',
    title: 'Manage',
    body: "The booking lands straight on the owner's dashboard and the front-desk view staff use to check students in — filled instantly, tracked automatically.",
  },
] as const

export default function HowItWorks() {
  return (
    <section className="py-16 md:py-20 px-6 md:px-10 border-b border-divider">
      <div className="max-w-[1000px] mx-auto">
        <div className="reveal text-center max-w-[560px] mx-auto mb-12">
          <h2 className="font-syne font-extrabold text-display-md text-ink mb-3">
            One seat map, from search to check-in
          </h2>
          <p className="text-[15px] text-muted">
            Every booking moves through the same three steps — whichever
            side of it you're on.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {STEPS.map((step, i) => (
            <div key={step.title} className="reveal relative" style={{ transitionDelay: `${i * 100}ms` }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-[10px] bg-blue-lt flex items-center justify-center flex-shrink-0">
                  <step.icon size={17} className="text-blue-dk" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-pale">
                  {step.audience}
                </span>
              </div>
              <h3 className="font-syne font-bold text-[17px] text-ink mb-2">
                {i + 1}. {step.title}
              </h3>
              <p className="text-[13.5px] text-muted leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
