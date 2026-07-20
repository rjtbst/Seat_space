// components/student/NotificationBell.tsx
'use client'

/**
 * Notification bell icon + dropdown for the student top header.
 *
 * - Red dot badge when there are unread notifications.
 * - Dropdown lists the 20 most recent notifications.
 * - Each notification auto-marks as read when the dropdown opens.
 * - "booking_expiring" notifications show an "Extend →" button that
 *   opens the ExtendBookingModal inline.
 * - "Mark all read" clears all at once.
 */

import { useState, useRef, useEffect } from 'react'
import { Bell, X, Clock, CheckCheck, ChevronRight } from 'lucide-react'
import { useNotifications, type AppNotification } from '@/hooks/useNotifications'
import ExtendBookingModal from './ExtendBookingModal'

function timeAgo(iso: string): string {
  // The DB stores created_at as a plain IST wall-clock string without any
  // timezone marker (e.g. "2026-06-25T14:30:00").  If we pass it raw to
  // new Date() the JS engine treats it as UTC — making it appear 5h 30m
  // older than it really is.  Appending '+05:30' tells the parser the
  // correct timezone so diffMs is always correct.
  const ts = iso.endsWith('Z') || iso.includes('+') ? iso : iso + '+05:30'
  const diffMs  = Date.now() - new Date(ts).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)  return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)   return `${diffH}h ago`
  return `${Math.floor(diffH / 24)}d ago`
}

function eventIcon(event: string): string {
  const map: Record<string, string> = {
    booking_expiring:  '🕐',
    booking_confirmed: '✅',
    booking_cancelled: '❌',
    booking_extended:  '⏰',
    checkin:           '📍',
  }
  return map[event] ?? '🔔'
}

export default function NotificationBell() {
  const { notifications, loading, unreadCount, markAsRead, markAllRead } =
    useNotifications()

  const [open, setOpen]                       = useState(false)
  const [extendBookingId, setExtendBookingId] = useState<string | null>(null)
  const dropdownRef                           = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Mark all visible unread as read when dropdown opens
  function handleOpen() {
    setOpen((prev) => {
      if (!prev) {
        // Small delay so the badge disappears after the dropdown is visible
        setTimeout(() => markAllRead(), 1500)
      }
      return !prev
    })
  }

  function handleNotificationClick(n: AppNotification) {
    if (!n.read_at) markAsRead(n.id)
    if (n.event === 'booking_expiring' && n.booking_id) {
      setExtendBookingId(n.booking_id)
      setOpen(false)
    }
  }

  return (
    <>
      {/* Bell button */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={handleOpen}
          className="relative w-9 h-9 rounded-[9px] bg-[#F4F7FB] border-[1.5px] border-[#E4EAF2] flex items-center justify-center text-[#6E7F94] hover:bg-[#E8EDF5] hover:border-[#B8C4D4] transition-all"
          aria-label="Notifications"
        >
          <Bell className="w-[15px] h-[15px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-red-500 border-2 border-white flex items-center justify-center text-white text-[9px] font-bold px-0.5">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute right-0 top-11 w-[340px] max-h-[480px] bg-white border border-[#E4EAF2] rounded-2xl shadow-[0_8px_40px_rgba(13,17,23,.14)] z-[300] flex flex-col overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0F4F8]">
              <span className="text-[13px] font-bold text-[#0D1117]">Notifications</span>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-[11px] text-[#1E5CFF] font-medium hover:underline"
                  >
                    <CheckCheck className="w-3 h-3" />
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-[#9AACBE] hover:text-[#6E7F94]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {loading && (
                <div className="px-4 py-8 text-center text-[12px] text-[#9AACBE]">
                  Loading…
                </div>
              )}

              {!loading && notifications.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <Bell className="w-8 h-8 text-[#DDE4EE] mx-auto mb-2" />
                  <div className="text-[12px] text-[#9AACBE]">No notifications yet</div>
                </div>
              )}

              {!loading && notifications.map((n) => {
                const isUnread  = !n.read_at
                const isExpiring = n.event === 'booking_expiring'

                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={[
                      'flex gap-3 px-4 py-3 border-b border-[#F8FAFB] cursor-pointer transition-colors',
                      isUnread
                        ? 'bg-[#F0F5FF] hover:bg-[#E8EFFE]'
                        : 'hover:bg-[#F8FAFB]',
                    ].join(' ')}
                  >
                    {/* Icon */}
                    <div className="w-8 h-8 rounded-full bg-white border border-[#E4EAF2] flex items-center justify-center text-base flex-shrink-0 mt-0.5">
                      {eventIcon(n.event)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <span className={[
                          'text-[12px] leading-snug',
                          isUnread ? 'font-semibold text-[#0D1117]' : 'font-medium text-[#3A4A5C]',
                        ].join(' ')}>
                          {n.title}
                        </span>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-[#1E5CFF] flex-shrink-0 mt-1" />
                        )}
                      </div>
                      <div className="text-[11px] text-[#6E7F94] mt-0.5 leading-relaxed">
                        {n.body}
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-[#9AACBE] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {timeAgo(n.created_at)}
                        </span>
                        {isExpiring && n.booking_id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setExtendBookingId(n.booking_id!)
                              setOpen(false)
                            }}
                            className="flex items-center gap-0.5 text-[11px] font-bold text-[#1E5CFF] hover:underline"
                          >
                            Extend <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-2.5 border-t border-[#F0F4F8] text-center">
                <span className="text-[11px] text-[#9AACBE]">
                  Showing last {notifications.length} notifications
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Extend booking modal — mounts outside the dropdown */}
      {extendBookingId && (
        <ExtendBookingModal
          bookingId={extendBookingId}
          onClose={() => setExtendBookingId(null)}
        />
      )}
    </>
  )
}