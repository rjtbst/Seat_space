// src/app/(owner)/dashboard/plan-builder/page.tsx
import { getOwnerPlans } from '@/lib/actions/owner'
import PlanBuilderClient from '@/components/owner/PlanBuilderClient'

export const dynamic = 'force-dynamic'

export default async function PlanBuilderPage() {
  const plans = await getOwnerPlans()
  return <PlanBuilderClient plans={plans} />
  // libraries come from useOwner() context inside the component
}