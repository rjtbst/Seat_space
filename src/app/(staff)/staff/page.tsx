// src/app/(staff)/staff/page.tsx
import { redirect } from 'next/navigation'
import { getStaffLibrary, getStaffDashboardStats, getMyStaffRequest } from '@/lib/actions/staff'

import StaffDashboardClient from '@/components/staff/StaffDashboardClient'
import StaffStateBanner from '@/components/staff/StaffStateBanner'

export const dynamic = 'force-dynamic'

export default async function StaffDashboardPage() {
  const staffLib = await getStaffLibrary()

  // ── Active staff → show dashboard ────────────────────────────────────────
  if (staffLib) {
    const stats = await getStaffDashboardStats(staffLib.libraryId)
    return <StaffDashboardClient staffLib={staffLib} stats={stats} />
  }

  // ── Not yet assigned — check request status ───────────────────────────────
  const myRequest = await getMyStaffRequest()

  // No request at all → go to request page
  if (!myRequest) {
    redirect('/staff/request')
  }

  // Pending or rejected → show status banner
  return <StaffStateBanner request={myRequest} />
}