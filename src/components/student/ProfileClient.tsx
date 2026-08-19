// components/student/ProfileClient.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateStudentProfile } from '@/lib/actions/students/student-profile'
import type { StudentStats, StudentProfile } from '@/lib/actions/students/student-profile'
import type { StudentBooking } from '@/lib/actions/students/student-bookings'
import {
  Edit3, Check, X, LogOut, ChevronRight,
  Calendar, CreditCard, BookOpen, TrendingUp,
  MapPin, Phone, Mail, User, Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { fmtIST, fmtISTTime } from '@/lib/ist'
import { getInitials, avatarGradient } from '@/lib/utils'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClayCard, ClayChip, ClayIconBadge, ClaySelect, ClayInput } from '@/components/ui/Clay'

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa',
  'Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
  'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
  'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
  'Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Jammu & Kashmir','Ladakh',
]

export default function ProfileClient({
  profile,
  stats,
  upcomingBookings,
}: {
  profile:           StudentProfile
  stats:             StudentStats | null
  upcomingBookings:  StudentBooking[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)

  const [fullName, setFullName] = useState(profile.full_name ?? profile.name ?? '')
  const [city,     setCity]     = useState(profile.city  ?? '')
  const [state,    setState]    = useState(profile.state ?? '')

  const displayName = profile.full_name ?? profile.name ?? 'Student'
  const initials    = getInitials(displayName)
  const gradient    = avatarGradient(profile.id)

  function cancelEdit() {
    setEditing(false)
    setFullName(profile.full_name ?? profile.name ?? '')
    setCity(profile.city   ?? '')
    setState(profile.state ?? '')
  }

  function handleSave() {
    const trimmedName = fullName.trim()
    if (trimmedName.length < 2) {
      toast.error('Name must be at least 2 characters')
      return
    }
    startTransition(async () => {
      const result = await updateStudentProfile({
        full_name: trimmedName,
        city:      city.trim() || undefined,
        state:     state       || undefined,
      })
      if (result.success === false) { toast.error(result.error); return }
      toast.success('Profile updated!')
      setEditing(false)
      router.refresh()
    })
  }

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  const statCards = [
    {
      label: 'Total Sessions',
      value: stats?.total_bookings ?? 0,
      icon:  BookOpen,
      bg:    'bg-[#E8EFFE]',
      color: 'text-[#1246FF]',
    },
    {
      label: 'This Month',
      value: stats?.month_sessions ?? 0,
      icon:  TrendingUp,
      bg:    'bg-[#D1FAE5]',
      color: 'text-[#0D7C54]',
    },
    {
      label: 'Upcoming',
      value: stats?.upcoming_bookings ?? 0,
      icon:  Calendar,
      bg:    'bg-[#FEF3C7]',
      color: 'text-[#B45309]',
    },
    {
      label: 'Active Plans',
      value: stats?.active_subs ?? 0,
      icon:  CreditCard,
      bg:    'bg-[#F3E8FF]',
      color: 'text-[#6B3FD4]',
    },
  ]

  return (
    <div className="p-5 md:p-7 max-w-2xl mx-auto space-y-5">
      {/* ── Profile header ───────────────────────────────── */}
      <ClayCard interactive={false} className="p-5">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-[20px] font-bold text-[#0D1117]">My Profile</h1>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-[12px] text-[#9AACBE] hover:text-[#C5282C] px-2 py-1.5 rounded-lg hover:bg-[#FEE2E2] transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>

        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-white text-[20px] font-bold"
            style={{ background: gradient, boxShadow: '3px 3px 8px rgba(163,177,198,.4), -2px -2px 6px rgba(255,255,255,.5)' }}
          >
            {initials}
          </div>

          {/* Fields */}
          <div className="flex-1 min-w-0">
            {!editing ? (
              <div className="space-y-1.5">
                <h2 className="text-[17px] font-bold text-[#0D1117]">{displayName}</h2>
                {profile.phone && (
                  <div className="flex items-center gap-1.5 text-[12px] text-[#6E7F94]">
                    <Phone className="w-3 h-3" />
                    {profile.phone}
                  </div>
                )}
                {profile.email && (
                  <div className="flex items-center gap-1.5 text-[12px] text-[#6E7F94]">
                    <Mail className="w-3 h-3" />
                    <span className="truncate">{profile.email}</span>
                  </div>
                )}
                {(profile.city || profile.state) && (
                  <div className="flex items-center gap-1.5 text-[12px] text-[#6E7F94]">
                    <MapPin className="w-3 h-3" />
                    {[profile.city, profile.state].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-semibold text-[#9AACBE] uppercase tracking-wide block mb-1">
                    Full Name *
                  </label>
                  <ClayInput
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-[#9AACBE] uppercase tracking-wide block mb-1">
                      City
                    </label>
                    <ClayInput
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Your city"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-[#9AACBE] uppercase tracking-wide block mb-1">
                      State
                    </label>
                    <ClaySelect
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    >
                      <option value="">State</option>
                      {INDIAN_STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </ClaySelect>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Edit / Save / Cancel buttons */}
          <div className="flex gap-1.5 flex-shrink-0">
            {!editing ? (
              <button onClick={() => setEditing(true)}>
                <ClayIconBadge interactive size="sm">
                  <Edit3 className="w-3.5 h-3.5 text-[#6E7F94]" />
                </ClayIconBadge>
              </button>
            ) : (
              <>
                <button onClick={cancelEdit}>
                  <ClayIconBadge interactive size="sm">
                    <X className="w-3.5 h-3.5 text-[#C5282C]" />
                  </ClayIconBadge>
                </button>
                <button
                  onClick={handleSave}
                  disabled={isPending}
                  className="clay-btn-primary w-8 h-8 flex items-center justify-center disabled:opacity-50"
                >
                  {isPending
                    ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Check className="w-3.5 h-3.5 text-white" />
                  }
                </button>
              </>
            )}
          </div>
        </div>

        {profile.created_at && (
          <p className="text-[10px] text-[#9AACBE] mt-4 pt-3" style={{ boxShadow: 'inset 0 1px 0 rgba(163,177,198,.25)' }}>
            Member since{' '}
            {new Date((profile.created_at) + '+05:30').toLocaleDateString('en-IN', {
              month: 'long', year: 'numeric',
            })}
          </p>
        )}
      </ClayCard>

      {/* ── Stats grid ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map(({ label, value, icon: Icon, bg, color }) => (
          <ClayCard key={label} interactive={false} className="p-4">
            <ClayIconBadge size="md" className={cn('mb-2.5', bg)}>
              <Icon className={cn('w-4 h-4', color)} />
            </ClayIconBadge>
            <div className="text-[22px] font-extrabold text-[#0D1117]">{value}</div>
            <div className="text-[11px] text-[#9AACBE] mt-0.5">{label}</div>
          </ClayCard>
        ))}
      </div>

      {/* ── Next sessions ────────────────────────────────── */}
      {upcomingBookings.length > 0 && (
        <ClayCard interactive={false} className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3" style={{ boxShadow: 'inset 0 -1px 0 rgba(163,177,198,.2)' }}>
            <h3 className="text-[13px] font-semibold text-[#0D1117]">Next Sessions</h3>
            <button
              onClick={() => router.push('/bookings')}
              className="flex items-center gap-0.5 text-[11px] text-[#1246FF] font-medium hover:underline"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div>
            {upcomingBookings.map((b, i) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3" style={i < upcomingBookings.length - 1 ? { boxShadow: 'inset 0 -1px 0 rgba(163,177,198,.15)' } : undefined}>
                <ClayIconBadge size="md" className="bg-[#E8EFFE]">
                  <Calendar className="w-4 h-4 text-[#1246FF]" />
                </ClayIconBadge>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#0D1117] truncate">{b.library_name}</p>
                  <p className="text-[11px] text-[#9AACBE]">
                    Seat {b.seat_label} · {fmtIST(b.start_time).split(',').slice(0, 2).join(',')}
                  </p>
                </div>
                <ClayChip tone="success" className="flex-shrink-0">Confirmed</ClayChip>
              </div>
            ))}
          </div>
        </ClayCard>
      )}

      {/* ── Quick links ──────────────────────────────────── */}
      <ClayCard interactive={false} className="overflow-hidden">
        {[
          { label: 'My Bookings',        desc: 'View all sessions',        icon: Calendar,  href: '/bookings'      },
          { label: 'Membership Plans',   desc: 'Manage subscriptions',     icon: CreditCard, href: '/subscriptions' },
          { label: 'Borrowed Books',     desc: 'Track your book issues',   icon: BookOpen,   href: '/my-books'      },
          { label: 'Explore Libraries',  desc: 'Find & book a seat',       icon: MapPin,     href: '/explore'       },
        ].map(({ label, desc, icon: Icon, href }, i) => (
          <button
            key={href}
            onClick={() => router.push(href)}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-black/[0.02] transition-colors text-left"
            style={i > 0 ? { boxShadow: 'inset 0 1px 0 rgba(163,177,198,.2)' } : undefined}
          >
            <ClayIconBadge size="md">
              <Icon className="w-4 h-4 text-[#6E7F94]" />
            </ClayIconBadge>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#0D1117]">{label}</p>
              <p className="text-[11px] text-[#9AACBE]">{desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#C4CDD8]" />
          </button>
        ))}
      </ClayCard>
    </div>
  )
}