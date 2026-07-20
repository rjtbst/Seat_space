// src/app/(staff)/staff/request/page.tsx
import { redirect } from 'next/navigation'
import { getStaffLibrary, getMyStaffRequest } from '@/lib/actions/staff'
import LibraryRequestClient from '@/components/staff/LibraryRequestClient'

export const dynamic = 'force-dynamic'

export default async function StaffRequestPage() {
  // Already an active staff member — no need to request
  const staffLib = await getStaffLibrary()
  if (staffLib) redirect('/staff')

  // Already has a pending request — show pending screen
  const myRequest = await getMyStaffRequest()
  if (myRequest?.status === 'pending') redirect('/staff')

  return (
    <LibraryRequestClient
      wasRejected={myRequest?.status === 'rejected'}
      previousLibraryName={myRequest?.libraryName ?? null}
    />
  )
}