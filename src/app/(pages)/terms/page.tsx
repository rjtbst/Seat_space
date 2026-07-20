// src/app/(pages)/terms/page.tsx
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import { LegalPageShell, type LegalSection } from '@/components/legal/LegalPageShell'
import { SITE } from '@/lib/config'

export const metadata = {
  title: 'Terms of Service',
  description: `The terms that govern use of ${SITE.name} — for students booking study seats and library owners listing their space.`,
  alternates: { canonical: '/terms' },
}

const sections: LegalSection[] = [
  {
    id: 'overview',
    title: '1. Overview',
    body: (
      <>
        <p>
          {SITE.name} ("we", "us", "the platform") operates a marketplace that connects
          <strong> library owners</strong> who list study seats, membership plans, and
          book-lending catalogs, with <strong>students</strong> who discover, book, and
          pay for them online.
        </p>
        <p>
          By creating an account, booking a seat, subscribing to a plan, or listing a
          library on {SITE.name}, you agree to these Terms. If you're using the
          platform on behalf of a library, you're confirming you have the authority to
          bind that library to these Terms.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: '2. Accounts & roles',
    body: (
      <>
        <p>The platform has three account types, each with different permissions:</p>
        <ul>
          <li><strong>Students</strong> browse libraries, book seats, subscribe to membership plans, and borrow books.</li>
          <li><strong>Library owners</strong> list libraries, configure seats and pricing, manage staff, and receive payouts.</li>
          <li><strong>Staff</strong> are added by an owner to a specific library, with permissions scoped to that library only (check-in, walk-in bookings, book issuing).</li>
        </ul>
        <p>
          You sign up with Google or an email and password, then verify a WhatsApp
          number during setup — required for every account, used for booking and
          payment-related communication, never as a way to sign in. You're
          responsible for keeping your login credentials secure and for all activity
          under your account.
        </p>
      </>
    ),
  },
  {
    id: 'bookings',
    title: '3. Seat bookings',
    body: (
      <>
        <p>
          A booking reserves a specific seat for a specific time window at a specific
          library. Prices are set per-hour by the library owner; the price you see at
          checkout already includes the platform fee described in Section 5 — the
          amount you pay is the final amount, nothing added later.
        </p>
        <p>
          A booking is only confirmed once payment is captured. An unpaid, temporarily
          held seat is released automatically if payment isn't completed within the
          hold window shown at checkout.
        </p>
        <p>
          Cancellation terms are covered separately in our{' '}
          <a href="/refunds">Refund &amp; Cancellation Policy</a>.
        </p>
      </>
    ),
  },
  {
    id: 'subscriptions',
    title: '4. Membership plans',
    body: (
      <>
        <p>
          Library owners may offer subscription plans (e.g. monthly or session-based
          passes) that let you book seats at that library without paying per session,
          up to any session limit stated on the plan. Plan price, duration, and session
          limit are set by the library owner and shown before you pay.
        </p>
        <p>
          Owners may occasionally offer discount codes for their own plans. A code only
          applies to the plan(s) it's configured for, and any redemption limits stated
          by the owner (total uses, uses per student, expiry) are enforced automatically.
        </p>
        <p>
          Subscriptions are billed once, up front, for the full plan duration — there's
          no recurring auto-renewal; you'll subscribe again manually when a plan ends if
          you want to continue.
        </p>
      </>
    ),
  },
  {
    id: 'owner-subscription',
    title: '5. Library owner platform subscription',
    body: (
      <>
        <p>
          Listing a library on {SITE.name} requires an active platform subscription of{' '}
          <strong>₹399 per month, per library</strong>, billed via UPI AutoPay through
          Razorpay. This is separate from, and in addition to, the per-booking and
          per-subscription platform fees described in Section 5, which are only
          deducted from student payments.
        </p>
        <p>
          The <strong>first library</strong> you add gets a{' '}
          <strong>14-day free trial</strong> from the day you create it — no payment
          required, and it can go fully live (pending admin approval) during that
          window. Every library after your first requires an active subscription
          before it can go live; there's no trial on additional libraries.
        </p>
        <p>
          Setting up AutoPay authorizes Razorpay to charge ₹399 automatically each
          month for as long as the library stays listed. If a monthly charge fails,
          you'll get a grace period (shown in your dashboard) to fix your payment
          method before the library is taken offline. If your free trial ends without
          an active subscription in place, the same thing happens automatically —
          your library is taken offline (not deleted; nothing you've set up is lost)
          until a subscription is active.
        </p>
        <p>
          You can cancel your AutoPay mandate at any time from your dashboard billing
          page; your library stays live until the end of the period you've already
          paid for; or, in the case of a lapsed trial, until you cancel intentionally
          if for some reason you don't want to continue at all.
        </p>
      </>
    ),
  },
  {
    id: 'fees',
    title: '6. Transaction fees',
    body: (
      <>
        <p>
          {SITE.name} charges a platform fee on top of the price the library owner
          sets, so the owner always receives the price they listed in full:
        </p>
        <ul>
          <li><strong>7%</strong> on per-seat, per-hour bookings.</li>
          <li><strong>5%</strong> on membership plan subscriptions.</li>
        </ul>
        <p>
          The fee is calculated on the final price after any discount is applied, and
          is always shown as part of the total before you confirm payment — never
          added afterward.
        </p>
      </>
    ),
  },
  {
    id: 'payments',
    title: '7. Payments',
    body: (
      <>
        <p>
          Payments are processed by <strong>Razorpay</strong>, a third-party payment
          gateway licensed by the Reserve Bank of India. {SITE.name} does not store
          your card, UPI, or net banking credentials — Razorpay handles that directly
          and is bound by its own security and compliance obligations.
        </p>
        <p>
          Library owners are paid out for confirmed bookings and subscriptions on the
          payout schedule shown in their dashboard, net of the platform fee.
        </p>
      </>
    ),
  },
  {
    id: 'conduct',
    title: '8. Acceptable use',
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>Book seats you don't intend to use, or repeatedly no-show without cancelling.</li>
          <li>Share your account or QR check-in code with someone else.</li>
          <li>List a library you don't own or don't have authority to list.</li>
          <li>Attempt to bypass the platform fee by arranging payment outside {SITE.name} for a booking made through it.</li>
          <li>Use the platform to harass, threaten, or discriminate against other students, staff, or owners.</li>
        </ul>
        <p>
          We may suspend or terminate accounts that violate these terms, including
          repeated no-shows or fraudulent payment activity.
        </p>
      </>
    ),
  },
  {
    id: 'liability',
    title: '9. Library conditions & liability',
    body: (
      <>
        <p>
          {SITE.name} is a booking platform — we don't own, staff, or operate the
          libraries listed on it. Each library owner is responsible for the condition,
          safety, amenities, and rules of their own premises. Report a problem with a
          specific library through the app or by <a href="/contact">contacting us</a>,
          and we'll follow up with the owner.
        </p>
        <p>
          To the extent permitted by law, {SITE.name} isn't liable for events, losses,
          or disputes arising at a library's physical premises, or for a library's
          failure to honor a booking (though we'll help resolve it and issue a refund
          per our Refund Policy where applicable).
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: '10. Changes to these terms',
    body: (
      <p>
        We may update these Terms as the platform evolves. Material changes will be
        reflected by an updated "Last updated" date above; continued use of the
        platform after a change means you accept the updated Terms.
      </p>
    ),
  },
  {
    id: 'contact',
    title: '11. Contact',
    body: (
      <p>
        Questions about these Terms? Reach us at{' '}
        <a href={`mailto:${SITE.contact.email}`}>{SITE.contact.email}</a>, or visit
        our <a href="/contact">Contact page</a>.
      </p>
    ),
  },
]

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <LegalPageShell
        eyebrow="Legal"
        title="Terms of Service"
        lastUpdated="20 July 2026"
        intro="These Terms govern your use of the seatspace platform, whether you're booking a study seat, subscribing to a membership plan, or listing a library."
        sections={sections}
      />
      <Footer />
    </>
  )
}
