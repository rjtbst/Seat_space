import { IndianRupee, Settings2, Bell } from 'lucide-react'

// Every bullet below maps to a real, implemented capability — checked
// against src/lib/actions/owner/{coupons,plans,subscribers}.ts,
// src/lib/booking/slotConfigService.ts (per-slot pricing & discounts),
// src/app/(owner)/dashboard/my-libraries, and src/components/student/
// NotificationBell.tsx. WhatsApp is only used for OTP verification in this
// codebase, never automated reminders — so notifications are described as
// in-app, not WhatsApp, to avoid a claim the product doesn't back up.
const GROUPS = [
  {
    icon: IndianRupee,
    color: 'text-green',
    bg: 'bg-green/10',
    title: 'Fill more seats, earn more',
    items: [
      'Time-slot pricing — charge differently for morning, evening or full-day slots',
      'Coupon codes for promotions and referrals',
      'Membership plans students subscribe to, not just single bookings',
      'A revenue and occupancy view across every library you run',
    ],
  },
  {
    icon: Settings2,
    color: 'text-blue',
    bg: 'bg-blue-lt',
    title: 'Simplify daily operations',
    items: [
      'Walk-ins and online bookings land on one seat map, not two systems',
      'QR check-in at the front desk',
      'Staff accounts with their own dashboard for the floor',
      'Book issue and return tracking alongside seats',
      'Every library you run, managed from a single login',
    ],
  },
  {
    icon: Bell,
    color: 'text-gold',
    bg: 'bg-gold/10',
    title: 'Keep students coming back',
    items: [
      'In-app alerts for bookings and book due-dates',
      'WhatsApp-verified sign-ups, so accounts are real people',
      'Self-service booking management and renewals',
      'Live availability so students never travel to a full library',
    ],
  },
] as const

export default function OutcomeGroups() {
  return (
    <section className="py-20 md:pt-4 md:pb-20 px-6 md:px-10 bg-warm/40">
      <div className="max-w-[1100px] mx-auto">
        <div className="reveal text-center max-w-[600px] mx-auto mb-12">
          <span className="chip chip-blue mb-4">For library owners</span>
          <h2 className="font-syne font-extrabold text-display-md text-ink mb-4">
            What running your library on seatspace actually changes
          </h2>
          <p className="text-[15px] text-muted">
            Not a feature list — the three things owners consistently get out
            of it.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {GROUPS.map((group, i) => (
            <div
              key={group.title}
              className="reveal card p-6"
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className={`w-10 h-10 rounded-[11px] ${group.bg} flex items-center justify-center mb-4`}>
                <group.icon size={18} className={group.color} />
              </div>
              <h3 className="font-syne font-bold text-[16px] text-ink mb-3">
                {group.title}
              </h3>
              <ul className="space-y-2.5">
                {group.items.map((item) => (
                  <li key={item} className="text-[13px] text-muted leading-snug flex gap-2">
                    <span className="text-pale mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
