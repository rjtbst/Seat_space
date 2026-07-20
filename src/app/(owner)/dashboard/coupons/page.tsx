// src/app/(owner)/dashboard/coupons/page.tsx
import { getOwnerCoupons } from '@/lib/actions/owner/coupons'
import { getOwnerPlans } from '@/lib/actions/owner'
import CouponsClient from '@/components/owner/CouponsClient'

export const dynamic = 'force-dynamic'

export default async function CouponsPage() {
  const [coupons, plans] = await Promise.all([
    getOwnerCoupons(),
    getOwnerPlans(),
  ])
  return <CouponsClient coupons={coupons} plans={plans} />
}
