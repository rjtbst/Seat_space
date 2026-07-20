// src/app/(owner)/dashboard/billing/page.tsx
import { requireRole } from '@/lib/auth/guards'
import { getOwnerLibraries } from '@/lib/actions/owner'
import { getPayoutSetup } from '@/lib/actions/payout-setup'
import BillingClient from '@/components/owner/BillingClient'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  await requireRole('owner')

  const [libraries, payoutSetup] = await Promise.all([
    getOwnerLibraries(),
    getPayoutSetup(),
  ])

  return <BillingClient libraries={libraries} payoutSetup={payoutSetup} />
}
