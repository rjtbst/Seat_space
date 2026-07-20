// src/app/(pages)/privacy/page.tsx
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import { LegalPageShell, type LegalSection } from '@/components/legal/LegalPageShell'
import { SITE } from '@/lib/config'

export const metadata = {
  title: 'Privacy Policy',
  description: `How ${SITE.name} collects, uses, and protects your personal information.`,
  alternates: { canonical: '/privacy' },
}

const sections: LegalSection[] = [
  {
    id: 'what-we-collect',
    title: '1. Information we collect',
    body: (
      <>
        <p><strong>Account information</strong> — you sign up with Google or an email and password, then provide your name, city/state, and a role (student, library owner, or staff). Every account also requires a verified WhatsApp number, collected and confirmed by OTP during setup — we use it for booking reminders, payment receipts, and updates from your library, not for signing in.</p>
        <p><strong>Booking activity</strong> — the libraries, seats, time slots, and books you book or reserve, so we can show you your history and let libraries confirm your visit.</p>
        <p><strong>Location</strong> — if you allow it, your device's approximate location, used only to show nearby libraries. You can search by city/area instead if you'd rather not share it.</p>
        <p><strong>Payment information</strong> — we do <strong>not</strong> collect or store your card, UPI, or net banking details. Payments are handled entirely by Razorpay; we only receive confirmation that a payment succeeded, its amount, and a transaction reference.</p>
        <p><strong>Payout details (library owners only)</strong> — if you're a library owner, we collect the bank account or UPI VPA you provide to receive payouts, and pass it to Razorpay to set up the payout on our behalf.</p>
      </>
    ),
  },
  {
    id: 'how-we-use-it',
    title: '2. How we use your information',
    body: (
      <ul>
        <li>To create and secure your account, and identify you when you book or check in.</li>
        <li>To process payments and, for library owners, payouts — via Razorpay.</li>
        <li>To send booking confirmations, payment receipts, and updates via WhatsApp, using the number you verified during setup.</li>
        <li>To show you relevant libraries based on your location or search.</li>
        <li>To detect and prevent fraud, abuse, or policy violations.</li>
        <li>To improve the platform — we look at aggregate usage patterns, not individual browsing behavior, for this.</li>
      </ul>
    ),
  },
  {
    id: 'sharing',
    title: '3. Who we share it with',
    body: (
      <>
        <p>We share information only where it's needed to run the platform:</p>
        <ul>
          <li><strong>Library owners and staff</strong> see your name, phone number, and booking details for bookings made at their library — so they can identify you at check-in and reach you if needed.</li>
          <li><strong>Razorpay</strong> processes payments and payouts on our behalf, under its own privacy and security obligations as an RBI-licensed payment aggregator.</li>
          <li><strong>Meta / WhatsApp</strong> delivers the booking, payment, and account messages we send you — your WhatsApp number and message content pass through Meta's WhatsApp Business Platform for that purpose, under Meta's own privacy policy.</li>
          <li>We don't sell your personal information to advertisers or third parties.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'retention',
    title: '4. How long we keep it',
    body: (
      <p>
        We keep account and booking data for as long as your account is active, and
        for a reasonable period afterward to meet legal, tax, and dispute-resolution
        obligations (payment records in particular are kept as required by Indian
        financial regulations). You can request account deletion at any time — see
        Section 6.
      </p>
    ),
  },
  {
    id: 'security',
    title: '5. Security',
    body: (
      <p>
        Access to personal data is scoped by role — a student can't see another
        student's bookings, and staff/owner access is limited to their own library.
        Payment credentials never pass through our servers. No system is perfectly
        secure, but we take reasonable technical and organizational measures to
        protect your information from unauthorized access.
      </p>
    ),
  },
  {
    id: 'your-rights',
    title: '6. Your choices',
    body: (
      <ul>
        <li>You can view and update most of your profile information from your account settings.</li>
        <li>You can disable location access at any time in your browser or device settings — the platform still works via search.</li>
        <li>You can request a copy of your data, or ask us to delete your account, by <a href="/contact">contacting us</a>.</li>
      </ul>
    ),
  },
  {
    id: 'children',
    title: "7. Children's privacy",
    body: (
      <p>
        {SITE.name} is intended for students old enough to independently book and pay
        for study spaces. We don't knowingly collect information from children under
        13. If you believe a child has created an account, contact us and we'll
        remove it.
      </p>
    ),
  },
  {
    id: 'changes',
    title: '8. Changes to this policy',
    body: (
      <p>
        We may update this Privacy Policy from time to time. Material changes will be
        reflected by an updated "Last updated" date above.
      </p>
    ),
  },
  {
    id: 'contact',
    title: '9. Contact',
    body: (
      <p>
        Questions about your data or this policy? Reach us at{' '}
        <a href={`mailto:${SITE.contact.email}`}>{SITE.contact.email}</a>, or visit
        our <a href="/contact">Contact page</a>.
      </p>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <LegalPageShell
        eyebrow="Legal"
        title="Privacy Policy"
        lastUpdated="20 July 2026"
        intro="This explains what personal information seatspace collects, why, and how it's protected — for students, library owners, and staff alike."
        sections={sections}
      />
      <Footer />
    </>
  )
}
