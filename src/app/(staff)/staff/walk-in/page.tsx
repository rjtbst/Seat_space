// src/app/(staff)/staff/walk-in/page.tsx
import { redirect } from 'next/navigation'
import { getStaffLibrary, getStaffSeatLayout } from '@/lib/actions/staff'
import WalkInClient from '@/components/staff/Walkinclient'

export const dynamic = 'force-dynamic'

export default async function WalkInPage() {
  const staffLib = await getStaffLibrary()
  if (!staffLib) redirect('/staff')

  const seats = await getStaffSeatLayout(staffLib.libraryId)

  return (
    <WalkInClient
      seats={seats}
      libraryId={staffLib.libraryId}
      libraryName={staffLib.libraryName}
    />
  )
}