// src/app/(owner)/dashboard/staff/page.tsx
import { getOwnerStaff, getPendingRequests } from '@/lib/actions/owner-staff'
import StaffManagementClient from '@/components/owner/Staffmanagementclient'

export const dynamic = 'force-dynamic'

export default async function StaffManagementPage() {
  const [staffMembers, pendingRequests] = await Promise.all([
    getOwnerStaff(),
    getPendingRequests(),
  ])

  return (
    <StaffManagementClient
      staffMembers={staffMembers}
      pendingRequests={pendingRequests}
    />
  )
}