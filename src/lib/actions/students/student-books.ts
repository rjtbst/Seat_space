// lib/actions/student-books.ts
'use server'

/**
 * Student server actions — library catalog browsing and book issue requests.
 *
 * Split out of the former monolithic lib/actions/student.ts (2,279 lines,
 * 26 exported functions across ~10 unrelated concerns) into focused
 * per-concern files. See lib/actions/student-discovery.ts,
 * student-bookings.ts, student-subscriptions.ts, student-books.ts,
 * student-profile.ts for the full set.
 *
 * All timestamps are plain IST wall-clock strings (no Z / offset suffix).
 * See lib/ist.ts for the convention.
 */

import { revalidatePath } from 'next/cache'
import {
  createServerSupabaseClient,
  getSupabaseUser,
} from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { z } from 'zod'
import {
  nowIST,
  monthRangeIST,
  validateISTRange,
  inputToDB,
} from '@/lib/ist'
import { fetchActiveSlotConfigs, fetchSlotConfigs, fetchActiveSlotConfigsCached } from '@/lib/booking/slotConfigService'
import { getActiveCitiesCached } from '@/lib/booking/citiesCache'
import { calculateBookingAmount }   from '@/lib/booking/pricing'
import { computeEscrowSplit, computeFeeOnTopSplit, DEFAULT_COMMISSION_BPS } from '@/lib/booking/escrow'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { validateBooking } from '@/lib/booking/slotBoundaryValidation'
import { resolveLibraryStatus, type LibraryStatus } from '@/lib/booking/libraryStatus'
import type { SlotConfig }          from '@/lib/booking/types'
// Static import — avoids TypeScript losing track of exported types
// when called via dynamic `await import()` inside server action functions.
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
} from '@/lib/razorpay/server'
import {
  IS_TEST_MODE,
  makeTestOrderId,
  makeTestPaymentId,
  TEST_SIGNATURE,
  isTestPayload,
} from '@/lib/testMode'

/* ─── Shared result type ─────────────────────────────────────────────────── */
import type { ActionResult, ActionOk, ActionErr } from '@/lib/actions/shared/action-result'
export type { ActionResult, ActionOk, ActionErr }

/* ══════════════════════════════════════════════════════════════════════════
   PUBLIC TYPES
══════════════════════════════════════════════════════════════════════════ */

export type LibraryBook = {
  id:               string
  title:            string
  author:           string | null
  isbn:             string | null
  available_copies: number
  total_copies:     number
}

export type BookIssue = {
  id:          string
  book_title:  string
  author:      string | null
  issued_at:   string
  due_date:    string | null
  returned_at: string | null
  is_overdue:  boolean
}

export type CityBookResult = {
  bookId:          string
  title:           string
  author:          string | null
  isbn:            string | null
  libraryId:       string
  libraryName:     string
  city:            string
  area:            string | null
  availableCopies: number
  totalCopies:     number
}


/* ══════════════════════════════════════════════════════════════════════════
   GET LIBRARY BOOKS
══════════════════════════════════════════════════════════════════════════ */

export async function getLibraryBooks(libraryId: string): Promise<LibraryBook[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('books')
    .select('id, title, author, isbn, book_copies(id, status)')
    .eq('library_id', libraryId)
    .order('title')

  if (error || !data) return []

  return (data as any[]).map((b): LibraryBook => {
    const copies = (b.book_copies ?? []) as { id: string; status: string }[]
    return {
      id:               b.id,
      title:            b.title  ?? '',
      author:           b.author ?? null,
      isbn:             b.isbn   ?? null,
      available_copies: copies.filter((c) => c.status === 'available').length,
      total_copies:     copies.length,
    }
  })
}


/* ══════════════════════════════════════════════════════════════════════════
   REQUEST BOOK
══════════════════════════════════════════════════════════════════════════ */

export async function requestBook(input: {
  bookId:    string
  libraryId: string
  message?:  string
}): Promise<ActionResult> {
    const supabase = await createServerSupabaseClient()  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Please sign in to request a book' }

  const { data: existing } = await supabase
    .from('book_requests')
    .select('id')
    .eq('user_id', user.id)
    .eq('book_id', input.bookId)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) return { success: false, error: 'You already have a pending request for this book' }

  const { error } = await supabase.from('book_requests').insert({
    user_id:    user.id,
    library_id: input.libraryId,
    book_id:    input.bookId,
    status:     'pending',
    message:    input.message?.trim() ?? null,
  } as never)

  if (error) return { success: false, error: error.message }

  revalidatePath(`/library/${input.libraryId}`)
  return { success: true, data: undefined }
}


/* ══════════════════════════════════════════════════════════════════════════
   GET MY BOOK ISSUES
══════════════════════════════════════════════════════════════════════════ */

export async function getMyBookIssues(): Promise<BookIssue[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('book_issues')
    .select(`
      id, issued_at, due_date, returned_at,
      book_copies(books(title, author))
    `)
    .eq('user_id', user.id)
    .order('issued_at', { ascending: false })
    .limit(30)

  if (error || !data) return []

  const now = Date.now()

  return (data as any[]).map((i): BookIssue => {
    const book  = (i.book_copies as any)?.books as any
    const dueMs = i.due_date ? new Date((i.due_date as string) + '+05:30').getTime() : null
    return {
      id:          i.id,
      book_title:  book?.title  ?? 'Unknown Book',
      author:      book?.author ?? null,
      issued_at:   i.issued_at   ?? '',
      due_date:    i.due_date    ?? null,
      returned_at: i.returned_at ?? null,
      is_overdue:  !i.returned_at && dueMs != null && dueMs < now,
    }
  })
}


/* ══════════════════════════════════════════════════════════════════════════
   SEARCH BOOKS IN CITY
══════════════════════════════════════════════════════════════════════════ */

export async function searchBooksInCity(
  query:   string,
  city:    string,
): Promise<CityBookResult[]> {
  const supabase = await createServerSupabaseClient()

  const q = query.trim()
  if (q.length < 2) return []

  // Find all live libraries in the city first
  const { data: libs } = await supabase
    .from('libraries')
    .select('id, name, city, area')
    .ilike('city', `%${city}%`)
    .eq('is_active', true)

  if (!libs?.length) return []

  const libIds = libs.map((l: any) => l.id)

  // Search books across all those libraries
  const { data: books } = await supabase
    .from('books')
    .select('id, title, author, isbn, library_id, book_copies(id, status)')
    .in('library_id', libIds)
    .or(`title.ilike.%${q}%,author.ilike.%${q}%,isbn.ilike.%${q}%`)
    .limit(30)

  if (!books?.length) return []

  // Build a library lookup map
  const libMap = new Map(libs.map((l: any) => [l.id, l]))

  return (books as any[])
    .map((b) => {
      const copies         = (b.book_copies ?? []) as { id: string; status: string }[]
      const availableCopies = copies.filter((c) => c.status === 'available').length
      const lib             = libMap.get(b.library_id)
      if (!lib) return null
      return {
        bookId:          b.id,
        title:           b.title  ?? '',
        author:          b.author ?? null,
        isbn:            b.isbn   ?? null,
        libraryId:       b.library_id,
        libraryName:     lib.name,
        city:            lib.city,
        area:            lib.area ?? null,
        availableCopies,
        totalCopies:     copies.length,
      }
    })
    .filter(Boolean) as CityBookResult[]
}

