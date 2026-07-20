// app/(student)/my-books/page.tsx
/**
 * My Borrowed Books page — server component.
 *
 * Fetches all book issues for the current student.
 * MyBooksClient handles:
 *  - Currently issued books section
 *  - Overdue books highlighted in red with alert banner
 *  - Returned books section
 *  - Due date countdown for books near deadline
 * -- request a book
 *
 * Route: /my-books
 */
import { redirect }           from 'next/navigation'
import { getSupabaseUser }    from '@/lib/supabase/server'
import { getMyBookIssues }    from '@/lib/actions/students/student-books'
import MyBooksClient          from '@/components/student/MyBooksClient'

export const dynamic   = 'force-dynamic'
export const revalidate = 0

export default async function MyBooksPage() {
  const { user } = await getSupabaseUser()
  if (!user) redirect('/auth/login?next=/my-books')

  const issues = await getMyBookIssues()

  return <MyBooksClient issues={issues} />
}