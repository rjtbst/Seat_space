// src/app/(pages)/refunds/page.tsx
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import { LegalPageShell, type LegalSection } from '@/components/legal/LegalPageShell'
import { SITE } from '@/lib/config'

export const metadata = {
  title: 'Refund & Cancellation Policy',
  description: `How cancellations and refunds work on ${SITE.name} for seat bookings and membership plans.`,
  alternates: { canonical: '/refunds' },
}

const sections: LegalSection[] = [
  {
    id: 'seat-bookings',
    title: '1. Cancelling a paid seat booking',
    body: (
      <>
        <p>
          You can cancel a confirmed booking yourself, instantly, any time up until{' '}
          <strong>20 minutes before</strong> its start time. Doing so refunds{' '}
          <strong>95% of what you paid</strong> — the remaining 5% covers the
          platform fee already processed for that booking, and isn't refundable on
          a self-cancellation.
        </p>
        <p>
          Refunds are raised automatically the moment you cancel, then reviewed and
          released by our team back to your original payment method via Razorpay.
          This usually takes a few business days, depending on your bank or payment
          provider.
        </p>
      </>
    ),
  },
  {
    id: 'late-cancel',
    title: '2. Cancelling within 20 minutes, or after check-in',
    body: (
      <>
        <p>
          Once you're inside the 20-minute window, or if you've already checked in
          with your QR code, self-cancellation is turned off. Instead, you can submit
          a <strong>cancellation request</strong> with a reason from your bookings
          page — our team reviews these individually, since a genuine emergency after
          check-in is treated differently from a routine change of plan.
        </p>
        <p>
          Approved late-cancellation refunds are typically for a smaller portion of
          the booking than the standard 95%, reflecting the seat time already reserved
          or used. You'll see the outcome and amount in your bookings page once it's
          reviewed.
        </p>
      </>
    ),
  },
  {
    id: 'no-show',
    title: '3. No-shows',
    body: (
      <p>
        If you don't check in and don't cancel, the booking is treated as a no-show
        and isn't eligible for a refund. If something came up, cancelling — even late —
        is always better than not showing up, since a cancellation request can still
        be reviewed.
      </p>
    ),
  },
  {
    id: 'subscriptions',
    title: '4. Membership plan subscriptions',
    body: (
      <>
        <p>
          Membership plans are billed once, up front, for the full plan duration.
          Because a plan gives you booking access (and, on capped plans, a session
          allowance) from the moment it activates, plan payments are{' '}
          <strong>generally non-refundable</strong> once the subscription is active —
          the same way most prepaid membership products work.
        </p>
        <p>
          If you believe your situation is an exception — for example the plan was
          purchased in error, or the library closed shortly after you subscribed —{' '}
          <a href="/contact">contact us</a> and we'll review it individually.
        </p>
      </>
    ),
  },
  {
    id: 'owner-cancel',
    title: '5. If a library cancels on you',
    body: (
      <p>
        If a library owner or staff member cancels your confirmed booking (for
        example, the seat becomes unavailable), you'll receive a{' '}
        <strong>full refund</strong> regardless of timing — this isn't a
        self-cancellation and the 5% fee retention in Section 1 doesn't apply.
      </p>
    ),
  },
  {
    id: 'owner-subscription-refunds',
    title: '6. Library owner platform subscription',
    body: (
      <>
        <p>
          The ₹399/month per-library platform subscription fee (see our{' '}
          <a href="/terms">Terms of Service</a>, Section 5) is billed via UPI AutoPay
          and is <strong>non-refundable</strong> once a monthly charge succeeds — the
          same way most SaaS/subscription products work, since it covers listing
          access for that billing period regardless of how much you use it.
        </p>
        <p>
          You can cancel your AutoPay mandate at any time; this stops future charges,
          but doesn't refund the current period, which runs to its end. Your{' '}
          <strong>free trial itself is never charged</strong>, so there's nothing to
          refund if you decide not to continue after it — your library is simply
          taken offline.
        </p>
      </>
    ),
  },
  {
    id: 'coupons',
    title: '7. Discounted purchases',
    body: (
      <p>
        If you subscribed using a coupon code, any approved refund is calculated on
        the amount you actually paid (after the discount), not the plan's original
        listed price.
      </p>
    ),
  },
  {
    id: 'how-refunds-arrive',
    title: '8. How refunds are paid',
    body: (
      <p>
        All refunds are returned to your original payment method through Razorpay —
        we can't redirect a refund to a different card, UPI ID, or bank account.
        Processing time after approval is generally a few business days and depends
        on your bank or payment provider, not on {SITE.name}.
      </p>
    ),
  },
  {
    id: 'contact',
    title: '9. Contact',
    body: (
      <p>
        Questions about a specific booking or refund? Reach us at{' '}
        <a href={`mailto:${SITE.contact.email}`}>{SITE.contact.email}</a> with your
        booking details, or visit our <a href="/contact">Contact page</a>.
      </p>
    ),
  },
]

export default function RefundsPage() {
  return (
    <>
      <Navbar />
      <LegalPageShell
        eyebrow="Legal"
        title="Refund & Cancellation Policy"
        lastUpdated="20 July 2026"
        intro="How cancellations and refunds work for seat bookings and membership plans on StudySpace."
        sections={sections}
      />
      <Footer />
    </>
  )
}
