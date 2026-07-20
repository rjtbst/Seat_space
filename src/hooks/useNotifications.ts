// hooks/useNotifications.ts
'use client'

/**
 * Manages in-app notifications for the current student.
 *
 * - Fetches the 20 most recent notifications on mount.
 * - Subscribes to Supabase realtime INSERT on the notifications table,
 *   filtered by the current user's id. New notifications appear instantly
 *   in the bell dropdown without polling.
 * - Exposes markAsRead() and markAllRead() which UPDATE read_at in Supabase.
 * - Unread count is derived from notifications where read_at IS NULL.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

export type AppNotification = {
  id:          string
  event:       string
  title:       string
  body:        string
  read_at:     string | null
  created_at:  string
  booking_id:  string | null
  library_id:  string | null
  payload:     Record<string, any> | null
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading]             = useState(true)
  const userIdRef                         = useRef<string | null>(null)

  // ── Initial fetch ────────────────────────────────────────────
  useEffect(() => {
    const supabase = createBrowserSupabaseClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      userIdRef.current = user.id

      const { data } = await supabase
        .from('notifications')
        .select('id, event, title, body, read_at, created_at, booking_id, library_id, payload')
        .eq('user_id', user.id)
        .eq('channel', 'in_app')
        .order('created_at', { ascending: false })
        .limit(20)

      setNotifications((data as AppNotification[]) ?? [])
      setLoading(false)
    }

    load()
  }, [])

  // ── Realtime subscription ────────────────────────────────────
  // Fires when pg_cron inserts a new notification row for this user.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    let channelReady = false

    async function subscribe() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const channel = supabase
        .channel(`notifications-${user.id}`)
        .on(
          'postgres_changes',
          {
            event:  'INSERT',
            schema: 'public',
            table:  'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const n = payload.new as AppNotification
            // Prepend so newest is first — matches the initial fetch order
            setNotifications((prev) => [n, ...prev].slice(0, 20))
          },
        )
        .subscribe()

      channelReady = true
      return channel
    }

    const channelPromise = subscribe()

    return () => {
      channelPromise.then((ch) => {
        if (ch) supabase.removeChannel(ch)
      })
    }
  }, [])

  // ── Mark one notification as read ────────────────────────────
  const markAsRead = useCallback(async (id: string) => {
    const supabase = createBrowserSupabaseClient()
    // Write plain IST (no Z / no offset) to match the DB column convention
    // of storing timestamp without time zone values in IST wall-clock time.
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 23)

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, read_at: nowIST } : n)
    )

    await supabase
      .from('notifications')
      .update({ read_at: nowIST } as never)
      .eq('id', id)
  }, [])

  // ── Mark all as read ─────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    const supabase = createBrowserSupabaseClient()
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 23)
    const userId   = userIdRef.current
    if (!userId) return

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? nowIST }))
    )

    await supabase
      .from('notifications')
      .update({ read_at: nowIST } as never)
      .eq('user_id', userId)
      .is('read_at', null)
  }, [])

  const unreadCount = notifications.filter((n) => !n.read_at).length

  return { notifications, loading, unreadCount, markAsRead, markAllRead }
}
