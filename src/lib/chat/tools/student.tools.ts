// src/lib/chat/tools/student.tools.ts
//
// Every handler here calls a server action that internally calls
// getSupabaseUser() and scopes its own query by `.eq('user_id', user.id)` —
// see student-bookings.ts / student-subscriptions.ts / student-profile.ts /
// student-discovery.ts. That means these handlers can't be tricked into
// returning another student's data even if the LLM is somehow made to pass
// a different id — there's no id parameter to pass in the first place.

import { getMyBookings } from '@/lib/actions/students/student-bookings'
import { getMySubscriptions } from '@/lib/actions/students/student-subscriptions'
import { getMyPayments } from '@/lib/actions/students/student-profile'
import { getSeatAvailability } from '@/lib/actions/students/student-discovery'
import { getMyBookIssues, getLibraryBooks, searchBooksInCity } from '@/lib/actions/students/student-books'
import { getSupabaseUser } from '@/lib/supabase/server'
import type { ToolDefinition } from './types'

export const studentTools: ToolDefinition[] = [
  {
    name: 'getMyBookings',
    description: "Get the current student's own seat bookings — upcoming, past, or all.",
    parameters: {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: ['upcoming', 'past', 'all'], description: 'Defaults to "all" if omitted.' },
      },
    },
    roles: ['student'],
    handler: async (args: { filter?: 'upcoming' | 'past' | 'all' }) => {
      const bookings = await getMyBookings(args.filter ?? 'all')
      return { bookings: bookings.slice(0, 15) }
    },
  },
  {
    name: 'getMyActiveSubscription',
    description: "Get the current student's active/past membership plan subscriptions.",
    parameters: { type: 'object', properties: {} },
    roles: ['student'],
    handler: async () => {
      const subs = await getMySubscriptions()
      return { subscriptions: subs.slice(0, 10) }
    },
  },
  {
    name: 'getAvailableSeats',
    description: 'Check seat availability at a specific library for a given time window.',
    parameters: {
      type: 'object',
      properties: {
        libraryId: { type: 'string', description: 'The library UUID (from a prior searchLibraries call).' },
        startTime: { type: 'string', description: 'IST wall-clock start time, e.g. "2026-07-14 09:00:00".' },
        endTime: { type: 'string', description: 'IST wall-clock end time, e.g. "2026-07-14 13:00:00".' },
      },
      required: ['libraryId', 'startTime', 'endTime'],
    },
    roles: ['student'],
    handler: async (args: { libraryId: string; startTime: string; endTime: string }) => {
      const seats = await getSeatAvailability(args.libraryId, args.startTime, args.endTime)
      const available = seats.filter((s) => s.is_available)
      return { available_count: available.length, total_count: seats.length, sample_labels: available.slice(0, 10).map((s) => s.label) }
    },
  },
  {
    name: 'getMyPaymentHistory',
    description: "Get the current student's own payment history for bookings and subscriptions.",
    parameters: { type: 'object', properties: {} },
    roles: ['student'],
    handler: async () => {
      const payments = await getMyPayments()
      return { payments: payments.slice(0, 15) }
    },
  },
  {
    name: 'getMyNotifications',
    description: "Get the current student's recent in-app notifications.",
    parameters: { type: 'object', properties: {} },
    roles: ['student'],
    // No dedicated server action for this exists yet (useNotifications() is a
    // client hook) — mirrors its query exactly rather than duplicating logic
    // under a different shape. If a server action for notifications is added
    // later, swap this handler to call it instead.
    handler: async () => {
      const { supabase, user } = await getSupabaseUser()
      if (!user) return { notifications: [] }

      const { data } = await supabase
        .from('notifications')
        .select('event, title, body, read_at, created_at')
        .eq('user_id', user.id)
        .eq('channel', 'in_app')
        .order('created_at', { ascending: false })
        .limit(10)

      return { notifications: data ?? [] }
    },
  },
  {
    name: 'getMyBorrowedBooks',
    description: "Get the current student's book borrowing history — currently issued books, due dates, overdue status, and returned books.",
    parameters: { type: 'object', properties: {} },
    roles: ['student'],
    handler: async () => {
      const issues = await getMyBookIssues()
      return { issues: issues.slice(0, 20) }
    },
  },
  {
    name: 'getLibraryBookCatalog',
    description: 'Get the book catalog (title, author, available copies) at a specific library.',
    parameters: {
      type: 'object',
      properties: {
        libraryId: { type: 'string', description: 'The library UUID (from a prior searchLibraries call).' },
      },
      required: ['libraryId'],
    },
    roles: ['student'],
    handler: async (args: { libraryId: string }) => {
      const books = await getLibraryBooks(args.libraryId)
      return { books: books.slice(0, 20) }
    },
  },
  {
    name: 'searchBooksInCity',
    description: 'Search for a book by title, author, or ISBN across all libraries in a given city, to find which library has a copy.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Book title, author, or ISBN to search for.' },
        city: { type: 'string', description: 'City to search within.' },
      },
      required: ['query', 'city'],
    },
    roles: ['student'],
    handler: async (args: { query: string; city: string }) => {
      const results = await searchBooksInCity(args.query, args.city)
      return { results: results.slice(0, 15) }
    },
  },
]
