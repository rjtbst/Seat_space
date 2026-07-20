// src/app/(staff)/staff/seat-manager/page.tsx
import { redirect } from 'next/navigation'
import { getStaffLibrary } from '@/lib/actions/staff'
import { getSeniorSeatLayout } from '@/lib/actions/staff-seat-actions'
import StaffSeatManagerClient from '@/components/staff/StaffSeatManagerClient'

export const dynamic = 'force-dynamic'

export default async function StaffSeatManagerPage() {
  const staffLib = await getStaffLibrary()

  // Not a staff member at all
  if (!staffLib) redirect('/staff')

  // Only senior_staff may access this page
  if (staffLib.role !== 'senior_staff') redirect('/staff')

  const seats = await getSeniorSeatLayout(staffLib.libraryId)

  return (
    <StaffSeatManagerClient
      seats={seats}
      libraryId={staffLib.libraryId}
      libraryName={staffLib.libraryName}
    />
  )
}