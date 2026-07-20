// src/app/(admin)/admin/page.tsx
import {
  getPlatformOverview,
  getBookingTrend,
  getRevenueTrend,
  getUserGrowthTrend,
} from '@/lib/actions/admin-dashboard'
import AdminDashboardClient from '@/components/admin/AdminDashboardClient'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const [overviewRes, bookingTrendRes, revenueTrendRes, userGrowthRes] = await Promise.all([
    getPlatformOverview(),
    getBookingTrend(),
    getRevenueTrend(),
    getUserGrowthTrend(),
  ])

  const overview = overviewRes.success ? overviewRes.data : null
  const bookingTrend = bookingTrendRes.success ? bookingTrendRes.data : []
  const revenueTrend = revenueTrendRes.success ? revenueTrendRes.data : []
  const userGrowth = userGrowthRes.success ? userGrowthRes.data : []

  return (
    <AdminDashboardClient
      overview={overview}
      bookingTrend={bookingTrend}
      revenueTrend={revenueTrend}
      userGrowth={userGrowth}
      loadError={!overviewRes.success ? overviewRes.error : null}
    />
  )
}
