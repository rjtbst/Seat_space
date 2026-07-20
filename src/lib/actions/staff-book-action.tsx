'use server'
 
// src/lib/actions/staff-book-actions.ts
 
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/actions/auth'
import { nowIST } from '@/lib/ist'
import { log, logError } from '@/lib/logger'
 
/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════════════ */
 
/** A book in the library catalog with aggregated copy counts */
export type CatalogBook = {
  bookId:          string
  title:           string
  author:          string | null
  isbn:            string | null
  totalCopies:     number
  availableCopies: number
  issuedCopies:    number
  copies:          CatalogCopy[]
}
 
export type CatalogCopy = {
  copyId: string
  status: 'available' | 'issued'
}
 
/** A currently active (not returned) book issue */
export type BookIssue = {
  issueId:    string
  bookId:     string
  copyId:     string
  title:      string
  author:     string | null
  issuedTo:   string           // guest_name or user full_name
  phone:      string | null    // guest_phone or user phone
  isGuest:    boolean
  userId:     string | null
  issuedAt:   string
  dueDate:    string | null
  isOverdue:  boolean
  daysOverdue: number
}
 
/** A student book request (pending/approved/rejected) */
export type BookRequest = {
  requestId:   string
  bookId:      string
  title:       string
  author:      string | null
  userId:      string
  userName:    string
  userPhone:   string | null
  message:     string | null
  status:      'pending' | 'approved' | 'rejected' | 'cancelled'
  createdAt:   string
}
 
/** Full data bundle for the books page */
export type StaffBooksPageData = {
  libraryId:   string
  libraryName: string
  isSenior:    boolean
  catalog:     CatalogBook[]
  activeIssues: BookIssue[]
  requests:    BookRequest[]
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════════════ */
 
/** Verify the current user is staff at this library. Returns staffRow or null. */
async function verifyStaff(supabase: any, libraryId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('staff')
    .select('id, role, library_id')
    .eq('user_id', user.id)
    .eq('library_id', libraryId)
    .maybeSingle()
  return data ? { ...data, userId: user.id } : null
}
 
/** Verify the current user is senior_staff at this library. */
async function verifySeniorStaff(supabase: any, libraryId: string) {
  const staffRow = await verifyStaff(supabase, libraryId)
  if (!staffRow) return null
  if (staffRow.role !== 'senior_staff') return null
  return staffRow
}
 
/** Build CatalogBook[] from raw books + copies data */
function buildCatalog(books: any[], copies: any[]): CatalogBook[] {
  const copyMap = new Map<string, CatalogCopy[]>()
  for (const c of copies) {
    if (!copyMap.has(c.book_id)) copyMap.set(c.book_id, [])
    copyMap.get(c.book_id)!.push({ copyId: c.id, status: c.status })
  }
 
  return books.map(b => {
    const bCopies  = copyMap.get(b.id) ?? []
    const available = bCopies.filter(c => c.status === 'available').length
    const issued    = bCopies.filter(c => c.status === 'issued').length
    return {
      bookId:          b.id,
      title:           b.title  ?? 'Unknown',
      author:          b.author ?? null,
      isbn:            b.isbn   ?? null,
      totalCopies:     bCopies.length,
      availableCopies: available,
      issuedCopies:    issued,
      copies:          bCopies,
    }
  })
}
 
/** Compute overdue info from a dueDate ISO string */
function overdueInfo(dueDate: string | null): { isOverdue: boolean; daysOverdue: number } {
  if (!dueDate) return { isOverdue: false, daysOverdue: 0 }
  const now  = new Date()
  const due  = new Date(dueDate)
  const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
  return { isOverdue: diff > 0, daysOverdue: Math.max(0, diff) }
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   PAGE DATA LOADER
   Single server call used by page.tsx — fetches everything in parallel.
═══════════════════════════════════════════════════════════════════════════ */
 
export async function getStaffBooksPageData(libraryId: string): Promise<StaffBooksPageData | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
 
  // Verify staff membership + get role
  const { data: staffRow } = await supabase
    .from('staff')
    .select('role')
    .eq('user_id', user.id)
    .eq('library_id', libraryId)
    .maybeSingle()
  if (!staffRow) return null
 
  const isSenior = staffRow.role === 'senior_staff'
 
  // Fetch library name
  const { data: lib } = await supabase
    .from('libraries')
    .select('name')
    .eq('id', libraryId)
    .maybeSingle()
 
  // Books and issues fetched in parallel.
  // Copies fetched after books resolve (we need book IDs first).
  // Both issues AND requests fetched WITHOUT a nested users(...) join — the
  // "users_select_own" RLS policy makes Supabase silently return the WHOLE
  // ROW as null when it can't resolve a joined users row for someone other
  // than the current staff member. This previously caused two separate
  // bugs from the same root cause: approveBookRequest failing with
  // "Request not found" (fixed there by dropping the same join), and any
  // non-guest book issue belonging to another student silently vanishing
  // from this Active Issues list with no visible error at all — worse,
  // since it failed silently instead of surfacing. We fetch user details
  // for both in a single separate query below using the collected user_ids.
  const [booksRes, issuesRes, requestsRes] = await Promise.all([
    // All books for this library
    supabase
      .from('books')
      .select('id, title, author, isbn')
      .eq('library_id', libraryId)
      .order('title'),

    // All active issues for this library
    supabase
      .from('book_issues')
      .select(`
        id, issued_at, due_date, guest_name, guest_phone, user_id,
        book_copies!inner(
          id, book_id,
          books!inner( id, title, author, library_id )
        )
      `)
      .is('returned_at', null)
      .eq('book_copies.books.library_id' as never, libraryId)
      .order('issued_at', { ascending: false }),

    // Book requests — user_id only; full_name/phone fetched separately below
    supabase
      .from('book_requests')
      .select('id, user_id, status, message, created_at, book_id, books( title, author )')
      .eq('library_id', libraryId)
      .in('status', ['pending', 'approved', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(50),
  ])
 
  // Fetch books first properly
  const books = booksRes.data ?? []
  const bookIds = books.map((b: any) => b.id)
 
  // Fetch copies for real now that we have bookIds
  const { data: copies } = bookIds.length
    ? await supabase
        .from('book_copies')
        .select('id, book_id, status')
        .in('book_id', bookIds)
    : { data: [] }
 
  const catalog = buildCatalog(books, copies ?? [])
 
  // Fetch user details for all issue-holders AND requestors in one shared
  // query. Done separately instead of a nested join because the users
  // table's "users_select_own" RLS policy makes Supabase silently return
  // the WHOLE ROW as null for any issue/request belonging to someone other
  // than the currently authenticated staff member when resolved via a join.
  const rawIssues = issuesRes.data ?? []
  const rawRequests = requestsRes.data ?? []
  const allUserIds = [...new Set([
    ...rawIssues.map((i: any) => i.user_id).filter(Boolean),
    ...rawRequests.map((r: any) => r.user_id).filter(Boolean),
  ])] as string[]

  const userMap = new Map<string, { full_name: string | null; phone: string | null }>()
  if (allUserIds.length > 0) {
    const { data: userRows } = await supabase
      .from('users')
      .select('id, full_name, phone')
      .in('id', allUserIds)
    for (const u of (userRows ?? []) as any[]) {
      userMap.set(u.id, { full_name: u.full_name ?? null, phone: u.phone ?? null })
    }
  }

  // Build active issues — filter by library_id via the nested books join
  const activeIssues: BookIssue[] = rawIssues
    .filter((i: any) => i.book_copies?.books?.library_id === libraryId)
    .map((i: any) => {
      const isGuest  = !i.user_id
      const holder   = i.user_id ? userMap.get(i.user_id) : undefined
      const issuedTo = isGuest ? (i.guest_name ?? 'Walk-in') : (holder?.full_name ?? 'Unknown')
      const phone    = isGuest ? (i.guest_phone ?? null) : (holder?.phone ?? null)
      const { isOverdue, daysOverdue } = overdueInfo(i.due_date)
      return {
        issueId:     i.id,
        bookId:      i.book_copies.books.id,
        copyId:      i.book_copies.id,
        title:       i.book_copies.books.title ?? 'Unknown',
        author:      i.book_copies.books.author ?? null,
        issuedTo,
        phone,
        isGuest,
        userId:      i.user_id ?? null,
        issuedAt:    i.issued_at,
        dueDate:     i.due_date ?? null,
        isOverdue,
        daysOverdue,
      }
    })
 
  const requests: BookRequest[] = rawRequests.map((r: any) => {
    const u = userMap.get(r.user_id) ?? { full_name: null, phone: null }
    return {
      requestId:  r.id,
      bookId:     r.book_id,
      title:      r.books?.title  ?? 'Unknown',
      author:     r.books?.author ?? null,
      userId:     r.user_id       ?? '',
      userName:   u.full_name     ?? 'Unknown',
      userPhone:  u.phone         ?? null,
      message:    r.message       ?? null,
      status:     r.status,
      createdAt:  r.created_at,
    }
  })
 
  return {
    libraryId,
    libraryName: lib?.name ?? '',
    isSenior,
    catalog,
    activeIssues,
    requests,
  }
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   SEARCH BOOKS  (debounced, called from IssueTab)
═══════════════════════════════════════════════════════════════════════════ */
 
export async function searchBooks(
  libraryId: string,
  query: string,
): Promise<CatalogBook[]> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
 
  const q = query.trim()
  if (q.length < 2) return []
 
  // Search books in this library
  const { data: books } = await supabase
    .from('books')
    .select('id, title, author, isbn')
    .eq('library_id', libraryId)
    .or(`title.ilike.%${q}%,author.ilike.%${q}%,isbn.ilike.%${q}%`)
    .limit(10)
 
  if (!books?.length) return []
 
  const bookIds = books.map((b: any) => b.id)
  const { data: copies } = await supabase
    .from('book_copies')
    .select('id, book_id, status')
    .in('book_id', bookIds)
 
  return buildCatalog(books, copies ?? [])
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   ISSUE BOOK
   Works for both registered users and walk-in guests.
   If userId is provided → link to user; else store guest_name + guest_phone.
═══════════════════════════════════════════════════════════════════════════ */
 
export async function issueBook(input: {
  libraryId:  string
  copyId:     string
  guestName:  string
  guestPhone: string
  userId?:    string | null   // if looked up via phone — optional
  dueDate:    string          // ISO date string e.g. "2025-06-01"
}): Promise<ActionResult<{ issueId: string }>> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
 
  // Verify staff at this library
  const staffRow = await verifyStaff(supabase, input.libraryId)
  if (!staffRow) return { success: false, error: 'Access denied — not assigned to this library' }
 
  // Verify copy exists + belongs to this library's book
  const { data: copy } = await supabase
    .from('book_copies')
    .select('id, status, book_id, books!inner( library_id )')
    .eq('id', input.copyId)
    .maybeSingle()
 
  if (!copy)                       return { success: false, error: 'Copy not found' }
  if ((copy as any).books?.library_id !== input.libraryId)
                                   return { success: false, error: 'Copy does not belong to this library' }
  if (copy.status !== 'available') return { success: false, error: `Copy is not available (status: ${copy.status})` }
 
  // Insert issue record
  const { data: issue, error: issueErr } = await supabase
    .from('book_issues')
    .insert({
      copy_id:     input.copyId,
      user_id:     input.userId ?? null,
      guest_name:  input.guestName.trim() || null,
      guest_phone: input.guestPhone.trim() || null,
      issued_at:   nowIST(),
      due_date:    input.dueDate,
    } as never)
    .select('id')
    .single()
 
  if (issueErr || !issue) {
    logError('issueBook', 'Insert failed', issueErr)
    return { success: false, error: issueErr?.message ?? 'Failed to issue book' }
  }
 
  // Mark copy as issued
  await supabase.from('book_copies').update({ status: 'issued' as never }).eq('id', input.copyId)
 
  log('issueBook', `issue=${issue.id} copy=${input.copyId} to=${input.guestName} staff=${user.id}`)
  revalidatePath('/staff/books')
  return { success: true, data: { issueId: issue.id } }
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   RETURN BOOK
═══════════════════════════════════════════════════════════════════════════ */
 
export async function returnBook(
  issueId:   string,
  libraryId: string,
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
 
  // Verify staff at this library
  const staffRow = await verifyStaff(supabase, libraryId)
  if (!staffRow) return { success: false, error: 'Access denied' }
 
  // Fetch issue — verify it belongs to this library
  const { data: issue } = await supabase
    .from('book_issues')
    .select('id, copy_id, returned_at, book_copies!inner( book_id, books!inner( library_id ) )')
    .eq('id', issueId)
    .maybeSingle()
 
  if (!issue) return { success: false, error: 'Issue record not found' }
  if ((issue as any).book_copies?.books?.library_id !== libraryId)
    return { success: false, error: 'Issue does not belong to this library' }
  if (issue.returned_at) return { success: false, error: 'Book already returned' }
 
  const { error } = await supabase
    .from('book_issues')
    .update({ returned_at: nowIST() } as never)
    .eq('id', issueId)
 
  if (error) { logError('returnBook', 'Update failed', error); return { success: false, error: error.message } }
 
  if (issue.copy_id) {
    await supabase.from('book_copies').update({ status: 'available' as never }).eq('id', issue.copy_id)
  }
 
  log('returnBook', `issue=${issueId} returned by staff=${user.id}`)
  revalidatePath('/staff/books')
  return { success: true, data: undefined }
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   BOOK REQUESTS — Staff reviews pending requests from students
═══════════════════════════════════════════════════════════════════════════ */
 
/**
 * Approve a book request.
 * Finds an available copy → issues it to the user → marks request approved.
 */
export async function approveBookRequest(
  requestId: string,
  libraryId: string,
  dueDate:   string,
): Promise<ActionResult<{ issueId: string }>> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
 
  const staffRow = await verifyStaff(supabase, libraryId)
  if (!staffRow) return { success: false, error: 'Access denied' }
 
  // Fetch the request — deliberately WITHOUT a nested users(...) join. Same
  // RLS behavior documented in getStaffBooksPageData above: the
  // "users_select_own" policy makes PostgREST return the entire row as
  // null when it can't resolve a joined users row for someone other than
  // the caller, which is exactly why every approval was failing with
  // "Request not found" even though the request was visible in the list
  // (whose query already avoids this join for the same reason). The
  // requester's name/phone weren't even used after being fetched here.
  const { data: req } = await supabase
    .from('book_requests')
    .select('id, book_id, user_id, status')
    .eq('id', requestId)
    .eq('library_id', libraryId)
    .maybeSingle()
 
  if (!req)                      return { success: false, error: 'Request not found' }
  if (req.status !== 'pending')  return { success: false, error: `Request is already ${req.status}` }
  if (!req.book_id)              return { success: false, error: 'Request is missing a book reference' }
 
  // Find an available copy of this book
  const { data: copies } = await supabase
    .from('book_copies')
    .select('id')
    .eq('book_id', req.book_id)
    .eq('status', 'available')
    .limit(1)
 
  if (!copies?.length) return { success: false, error: 'No available copies — mark some returned first' }
 
  const copyId = copies[0].id
 
  // Issue the book
  const { data: issue, error: issueErr } = await supabase
    .from('book_issues')
    .insert({
      copy_id:   copyId,
      user_id:   req.user_id,
      issued_at: nowIST(),
      due_date:  dueDate,
    } as never)
    .select('id')
    .single()
 
  if (issueErr || !issue) {
    logError('approveBookRequest', 'Issue insert failed', issueErr)
    return { success: false, error: issueErr?.message ?? 'Failed to issue book' }
  }
 
  // Mark copy as issued
  await supabase.from('book_copies').update({ status: 'issued' as never }).eq('id', copyId)
 
  // Update request status
  await supabase
    .from('book_requests')
    .update({
      status:      'approved',
      reviewed_at: nowIST(),
      reviewed_by: user.id,
    } as never)
    .eq('id', requestId)
 
  log('approveBookRequest', `request=${requestId} issue=${issue.id} copy=${copyId} staff=${user.id}`)
  revalidatePath('/staff/books')
  return { success: true, data: { issueId: issue.id } }
}
 
/** Reject a book request. */
export async function rejectBookRequest(
  requestId: string,
  libraryId: string,
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
 
  const staffRow = await verifyStaff(supabase, libraryId)
  if (!staffRow) return { success: false, error: 'Access denied' }
 
  const { data: req } = await supabase
    .from('book_requests')
    .select('id, status')
    .eq('id', requestId)
    .eq('library_id', libraryId)
    .maybeSingle()
 
  if (!req)                     return { success: false, error: 'Request not found' }
  if (req.status !== 'pending') return { success: false, error: `Request is already ${req.status}` }
 
  const { error } = await supabase
    .from('book_requests')
    .update({
      status:      'rejected',
      reviewed_at: nowIST(),
      reviewed_by: user.id,
    } as never)
    .eq('id', requestId)
 
  if (error) { logError('rejectBookRequest', 'Update failed', error); return { success: false, error: error.message } }
 
  log('rejectBookRequest', `request=${requestId} rejected by staff=${user.id}`)
  revalidatePath('/staff/books')
  return { success: true, data: undefined }
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   CATALOG MANAGEMENT — Senior staff only
═══════════════════════════════════════════════════════════════════════════ */
 
/** Add a new book with N copies. Senior staff only. */
export async function addBook(input: {
  libraryId:  string
  title:      string
  author?:    string
  isbn?:      string
  copyCount:  number          // 1–20
}): Promise<ActionResult<{ bookId: string }>> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
 
  const staffRow = await verifySeniorStaff(supabase, input.libraryId)
  if (!staffRow) return { success: false, error: 'Senior staff access required' }
 
  if (!input.title.trim()) return { success: false, error: 'Title is required' }
  const count = Math.min(Math.max(1, input.copyCount), 20)
 
  const { data: book, error: bookErr } = await supabase
    .from('books')
    .insert({
      library_id: input.libraryId,
      title:      input.title.trim(),
      author:     input.author?.trim() ?? null,
      isbn:       input.isbn?.trim()   ?? null,
    } as never)
    .select('id')
    .single()
 
  if (bookErr || !book) {
    logError('addBook', 'Insert failed', bookErr)
    return { success: false, error: bookErr?.message ?? 'Failed to add book' }
  }
 
  // Insert N copies
  const copiesPayload = Array.from({ length: count }, () => ({
    book_id: book.id,
    status:  'available',
  }))
 
  const { error: copiesErr } = await supabase.from('book_copies').insert(copiesPayload as never)
  if (copiesErr) logError('addBook', `Copies insert failed for book=${book.id}`, copiesErr)
 
  log('addBook', `book=${book.id} copies=${count} staff=${user.id}`)
  revalidatePath('/staff/books')
  return { success: true, data: { bookId: book.id } }
}
 
/** Add a single copy to an existing book. Senior staff only. */
export async function addCopy(
  bookId:    string,
  libraryId: string,
): Promise<ActionResult<{ copyId: string }>> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
 
  const staffRow = await verifySeniorStaff(supabase, libraryId)
  if (!staffRow) return { success: false, error: 'Senior staff access required' }
 
  // Verify book belongs to this library
  const { data: book } = await supabase
    .from('books')
    .select('id, library_id')
    .eq('id', bookId)
    .maybeSingle()
  if (!book || book.library_id !== libraryId) return { success: false, error: 'Book not found in this library' }
 
  const { data: copy, error } = await supabase
    .from('book_copies')
    .insert({ book_id: bookId, status: 'available' } as never)
    .select('id')
    .single()
 
  if (error || !copy) { logError('addCopy', 'Insert failed', error); return { success: false, error: error?.message ?? 'Failed to add copy' } }
 
  log('addCopy', `copy=${copy.id} book=${bookId} staff=${user.id}`)
  revalidatePath('/staff/books')
  return { success: true, data: { copyId: copy.id } }
}
 
/** Delete a book (and its copies) only if no active issues exist. Senior staff only. */
export async function deleteBook(
  bookId:    string,
  libraryId: string,
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
 
  const staffRow = await verifySeniorStaff(supabase, libraryId)
  if (!staffRow) return { success: false, error: 'Senior staff access required' }
 
  // Verify book belongs to this library
  const { data: book } = await supabase
    .from('books')
    .select('id, library_id')
    .eq('id', bookId)
    .maybeSingle()
  if (!book || book.library_id !== libraryId) return { success: false, error: 'Book not found in this library' }
 
  // Check for active issues on any copy of this book
  const { data: copies } = await supabase
    .from('book_copies')
    .select('id')
    .eq('book_id', bookId)
 
  if (copies?.length) {
    const copyIds = copies.map((c: any) => c.id)
    const { data: activeIssues } = await supabase
      .from('book_issues')
      .select('id')
      .in('copy_id', copyIds)
      .is('returned_at', null)
 
    if (activeIssues?.length) {
      return { success: false, error: `Cannot delete — ${activeIssues.length} active issue(s) on this book` }
    }
 
    // Delete copies first
    await supabase.from('book_copies').delete().in('id', copyIds)
  }
 
  // Delete any requests for this book
  await supabase.from('book_requests').delete().eq('book_id', bookId)
 
  // Delete the book
  const { error } = await supabase.from('books').delete().eq('id', bookId)
  if (error) { logError('deleteBook', 'Delete failed', error); return { success: false, error: error.message } }
 
  log('deleteBook', `book=${bookId} staff=${user.id}`)
  revalidatePath('/staff/books')
  return { success: true, data: undefined }
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   LOOKUP REGISTERED USER BY PHONE
   Staff can search for an existing library member by phone number before
   issuing a book, so the issue is linked to their account.
═══════════════════════════════════════════════════════════════════════════ */

export type UserLookup = {
  id:       string
  fullName: string
  phone:    string | null
}

export async function lookupMemberByPhone(
  phone:     string,
  libraryId: string,
): Promise<ActionResult<UserLookup | null>> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Must be staff of this library
  const staffRow = await verifyStaff(supabase, libraryId)
  if (!staffRow) return { success: false, error: 'Access denied' }

  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length < 10) return { success: true, data: null }

  const { data } = await supabase
    .from('users')
    .select('id, full_name, phone')
    .ilike('phone', `%${cleaned.slice(-10)}`)
    .maybeSingle()

  if (!data) return { success: true, data: null }

  return {
    success: true,
    data: { id: data.id, fullName: data.full_name ?? '', phone: data.phone ?? null },
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CANCEL BOOK REQUEST  (by the student who made it)
═══════════════════════════════════════════════════════════════════════════ */

export async function cancelBookRequest(
  requestId: string,
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: req } = await supabase
    .from('book_requests')
    .select('id, user_id, status')
    .eq('id', requestId)
    .maybeSingle()

  if (!req)                                 return { success: false, error: 'Request not found' }
  if (req.user_id !== user.id)              return { success: false, error: 'Not your request' }
  if (!['pending'].includes(req.status))    return { success: false, error: `Cannot cancel a ${req.status} request` }

  const { error } = await supabase
    .from('book_requests')
    .update({ status: 'cancelled' } as never)
    .eq('id', requestId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/library')
  return { success: true, data: undefined }
}