// src/app/(owner)/dashboard/my-libraries/page.tsx
import { getOwnerLibraries } from '@/lib/actions/owner'
import MyLibrariesClient from '@/components/owner/MyLibrariesClient'

export const dynamic = 'force-dynamic'

export default async function MyLibrariesPage() {
    // getOwnerLibraries() returns [] if user somehow isn't authenticated.
  const libraries = await getOwnerLibraries()
  return <MyLibrariesClient libraries={libraries} />
}