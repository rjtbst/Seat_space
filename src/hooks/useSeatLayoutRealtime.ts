// src/hooks/useSeatLayoutRealtime.ts
'use client'

/**
 * Subscribes to live changes on the `bookings` table for one library, and
 * calls `onChange` whenever a row is inserted/updated/deleted for that
 * library — so the seat manager can re-fetch the current seat layout and
 * reflect what just happened (a student booking online, another staff
 * terminal checking someone in, an owner force-freeing a seat, etc.)
 * without the viewer needing to manually refresh the page.
 *
 * WHY RE-FETCH INSTEAD OF PATCHING THE CHANGED ROW DIRECTLY:
 * A seat's displayed `live_status` ('free' | 'booked' | 'held' | 'inactive')
 * depends on whether a booking's time window contains the CURRENT moment
 * (see getSeatLayout / getSeniorSeatLayout in lib/actions/owner.ts and
 * lib/actions/staff-seat-actions.ts) — not just the booking's `status`
 * column alone. A changed bookings row by itself doesn't tell us whether
 * that booking's window is currently active, already past, or not yet
 * started. Re-deriving that correctly on the client would mean duplicating
 * business logic that already lives server-side, which is a common way
 * for these two copies to quietly drift out of sync over time. Calling the
 * same server action again keeps ONE source of truth for "what does this
 * seat's status mean right now."
 *
 * This does mean each realtime event costs one extra request rather than
 * being a pure client-side patch — an acceptable tradeoff given how
 * infrequently a single library's bookings actually change (a handful of
 * times a minute even for a busy library), and far simpler/safer than
 * re-implementing the status-derivation logic twice.
 *
 * Debounced: if several booking changes land within a short window (e.g.
 * a burst of staff check-ins), this coalesces them into one re-fetch
 * instead of one per event.
 */

import { useEffect, useRef } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

const DEBOUNCE_MS = 400

export function useSeatLayoutRealtime(libraryId: string, onChange: () => void) {
  // Keep the latest onChange in a ref so the effect below doesn't need to
  // re-subscribe every time the caller passes a new function reference
  // (e.g. a new closure created on every render).
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!libraryId) return

    const supabase = createBrowserSupabaseClient()
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        onChangeRef.current()
      }, DEBOUNCE_MS)
    }

    // Channel name must be unique per library so two seat-manager views for
    // different libraries (unlikely in one browser tab, but possible across
    // tabs) don't collide.
    const channel = supabase
      .channel(`seat-layout-${libraryId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'bookings',
          filter: `library_id=eq.${libraryId}`,
        },
        scheduleRefetch,
      )
      .subscribe()

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
    }
  }, [libraryId])
}