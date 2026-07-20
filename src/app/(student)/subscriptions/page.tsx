// app/(student)/subscriptions/page.tsx
/**
 * Membership Plans page — server component.
 *
 * Fetches all subscriptions for the current student.
 * SubscriptionsClient handles:
 *  - Active plans with days-left progress bar
 *  - Pending plans (payment awaiting confirmation)
 *  - Past / expired plans
 *  - "Browse Plans" button → navigates to /explore
 *
 * Route: /subscriptions
 */
import { redirect }            from 'next/navigation'
import { getSupabaseUser }     from '@/lib/supabase/server'
import { getMySubscriptions }  from '@/lib/actions/students/student-subscriptions'
import SubscriptionsClient     from '@/components/student/SubscriptionsClient'

export const dynamic   = 'force-dynamic'
export const revalidate = 0

export default async function SubscriptionsPage() {
  const { user } = await getSupabaseUser()
  if (!user) redirect('/auth/login?next=/subscriptions')

  const subscriptions = await getMySubscriptions()

  return <SubscriptionsClient subscriptions={subscriptions} />
}