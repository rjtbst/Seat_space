// src/app/(staff)/staff/books/page.tsx
import { redirect } from 'next/navigation'
import { getStaffLibrary } from '@/lib/actions/staff'
import { getStaffBooksPageData } from '@/lib/actions/staff-book-action'
import StaffBooksClient from '@/components/staff/Staffbooksclient'

export const dynamic = 'force-dynamic'

export default async function StaffBooksPage() {
  const staffLib = await getStaffLibrary()
  if (!staffLib) redirect('/staff')

  const data = await getStaffBooksPageData(staffLib.libraryId)
  if (!data) redirect('/staff')

  return <StaffBooksClient data={data} />
}