// src/lib/chat/tools/staff.tools.ts
//
// A staff member's library is fixed by their `staff` table row, not
// something they (or the model) should ever get to choose per-call — every
// handler here resolves it itself via getStaffLibrary() and ignores any
// libraryId-shaped argument the model might invent.

import { getStaffLibrary, getStaffDashboardStats, getStaffTodayBookings, getStaffSeatLayout } from '@/lib/actions/staff'
import { lookupMemberByPhone, getStaffBooksPageData } from '@/lib/actions/staff-book-action'
import type { ToolDefinition } from './types'

async function requireStaffLibrary(): Promise<{ ok: true; libraryId: string } | { ok: false; error: string }> {
  const staffLib = await getStaffLibrary()
  if (!staffLib) return { ok: false, error: 'No library assignment found for this staff account.' }
  return { ok: true, libraryId: staffLib.libraryId }
}

export const staffTools: ToolDefinition[] = [
  {
    name: 'getTodaysBookingsStaff',
    description: "Get today's bookings at the current staff member's assigned library.",
    parameters: { type: 'object', properties: {} },
    roles: ['staff'],
    handler: async () => {
      const gate = await requireStaffLibrary()
      if (!gate.ok) return gate
      const bookings = await getStaffTodayBookings(gate.libraryId)
      return { bookings: bookings.slice(0, 30) }
    },
  },
  {
    name: 'getCheckInStatus',
    description: "Get today's check-in status breakdown (checked in / confirmed / cancelled) at the staff member's library.",
    parameters: { type: 'object', properties: {} },
    roles: ['staff'],
    handler: async () => {
      const gate = await requireStaffLibrary()
      if (!gate.ok) return gate
      const bookings = await getStaffTodayBookings(gate.libraryId)
      const byStatus: Record<string, number> = {}
      for (const b of bookings as any[]) {
        byStatus[b.status] = (byStatus[b.status] ?? 0) + 1
      }
      return { total_today: bookings.length, by_status: byStatus }
    },
  },
  {
    name: 'lookupStudent',
    description: "Look up a member/student by phone number at the staff member's library.",
    parameters: {
      type: 'object',
      properties: { phone: { type: 'string', description: 'Phone number, any format.' } },
      required: ['phone'],
    },
    roles: ['staff'],
    handler: async (args: { phone: string }) => {
      const gate = await requireStaffLibrary()
      if (!gate.ok) return gate
      const result = await lookupMemberByPhone(args.phone, gate.libraryId)
      if (!result.success) return { error: result.error }
      return { student: result.data }
    },
  },
  {
    name: 'lookupSeat',
    description: "Get the seat layout and availability at the staff member's assigned library.",
    parameters: { type: 'object', properties: {} },
    roles: ['staff'],
    handler: async () => {
      const gate = await requireStaffLibrary()
      if (!gate.ok) return gate
      const seats = await getStaffSeatLayout(gate.libraryId)
      const occupied = seats.filter((s) => s.liveStatus === 'booked' || s.liveStatus === 'held')
      return {
        total_seats: seats.length,
        occupied_seats: occupied.length,
        sample: seats.slice(0, 15).map((s) => ({ label: `${s.rowLabel}${s.colNumber}`, status: s.liveStatus })),
      }
    },
  },
  {
    name: 'getStaffDashboardSummary',
    description: "Get today's summary stats (bookings, check-ins, occupancy) at the staff member's assigned library.",
    parameters: { type: 'object', properties: {} },
    roles: ['staff'],
    handler: async () => {
      const gate = await requireStaffLibrary()
      if (!gate.ok) return gate
      return await getStaffDashboardStats(gate.libraryId)
    },
  },
  {
    name: 'getLibraryBooksSummary',
    description: "Get the book catalog, currently issued books, and pending book requests at the staff member's assigned library.",
    parameters: { type: 'object', properties: {} },
    roles: ['staff'],
    handler: async () => {
      const gate = await requireStaffLibrary()
      if (!gate.ok) return gate
      const data = await getStaffBooksPageData(gate.libraryId)
      if (!data) return { error: 'Could not load book data.' }
      return {
        catalog_count: data.catalog.length,
        catalog_sample: data.catalog.slice(0, 15),
        active_issues: data.activeIssues.slice(0, 15),
        pending_requests: data.requests.filter((r: any) => r.status === 'pending').slice(0, 15),
      }
    },
  },
]
