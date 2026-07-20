// app/(student)/books/page.tsx
/**
 * City-wide Book Search page — students search for a book title/author
 * across ALL libraries in their city, then send a request to whichever
 * library has available copies.
 *
 * Route: /books
 */
import { redirect }        from 'next/navigation'
import { getSupabaseUser } from '@/lib/supabase/server'
import { getStudentProfile } from '@/lib/actions/students/student-profile'
import CityBookSearchClient  from '@/components/student/CityBookSearchClient'

export const dynamic   = 'force-dynamic'
export const revalidate = 0

export default async function BooksPage() {
  const { user } = await getSupabaseUser()
  if (!user) redirect('/auth/login?next=/books')

  const profile = await getStudentProfile()

  return <CityBookSearchClient city={profile?.city ?? ''} />
}