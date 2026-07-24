// app/(student)/payments/page.tsx
/**
 * Payment History page — server component.
 *
 * Fetches all payment records for the current student, including
 * linked booking details and Razorpay transaction IDs.
 *
 * PaymentsClient handles:
 *  - Payment cards with status badges (paid / pending / failed)
 *  - Booking details (library, seat, time)
 *  - Copy Razorpay payment ID and order ID to clipboard
 *  - Total amount paid summary
 *
 * NOTE: PaymentRecord type is defined in lib/actions/student.ts
 *       (not in this file) so PaymentsClient can import it without
 *       crossing the app/ → components/ boundary.
 *
 * Route: /payments
 */
import { redirect }         from 'next/navigation'
import { getSupabaseUser }  from '@/lib/supabase/server'
import { getMyPayments }    from '@/lib/actions/students/student-profile'
import PaymentsClient       from '@/components/student/PaymentsClient'

export const dynamic   = 'force-dynamic'
export const revalidate = 0

export default async function PaymentsPage() {
  const { user } = await getSupabaseUser()
  if (!user) redirect('/login?redirect=/payments')

  const payments = await getMyPayments()

  return <PaymentsClient payments={payments} />
}