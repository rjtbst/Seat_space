// src/app/(staff)/staff/bookings/page.tsx
import { redirect } from 'next/navigation'
import { getStaffLibrary, getStaffTodayBookings } from '@/lib/actions/staff'
import { getStaffLibrarySlots } from '@/lib/actions/staff-seat-actions'
import StaffBookingsClient from '@/components/staff/Staffbookingsclient'

export const dynamic = 'force-dynamic'

export default async function StaffBookingsPage() {
  const staffLib = await getStaffLibrary()
  if (!staffLib) redirect('/staff')

  const [bookings, slots] = await Promise.all([
    getStaffTodayBookings(staffLib.libraryId),
    getStaffLibrarySlots(staffLib.libraryId),
  ])

  return (
    <StaffBookingsClient
      bookings={bookings}
      libraryName={staffLib.libraryName}
      libraryId={staffLib.libraryId}
      slots={slots}
    />
  )
}