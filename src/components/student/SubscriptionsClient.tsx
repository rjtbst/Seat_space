// components/student/SubscriptionsClient.tsx
'use client'

import { useRouter } from 'next/navigation'
import type { StudentSubscription } from '@/lib/actions/students/student-subscriptions'
import { CreditCard, MapPin, Armchair, AlertCircle, Plus, QrCode } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtIST } from '@/lib/ist'
import { describeDaysOfWeek } from '@/lib/booking/subscriptionEntitlement'

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  active:    { label: 'Active',    cls: 'bg-[#D1FAE5] text-[#0D7C54]' },
  pending:   { label: 'Pending Payment', cls: 'bg-[#FEF3C7] text-[#B45309]' },
  expired:   { label: 'Expired',   cls: 'bg-[#F4F7FB] text-[#9AACBE]' },
  cancelled: { label: 'Cancelled', cls: 'bg-[#FEE2E2] text-[#C5282C]' },
}

function SubCard({ sub }: { sub: StudentSubscription }) {
  const cfg     = STATUS_CFG[sub.status] ?? STATUS_CFG.expired
  const isActive = sub.status === 'active'

  const progressPct = isActive && sub.duration_days > 0
    ? Math.round((sub.days_left / sub.duration_days) * 100)
    : 0

  return (
    <div className={cn(
      'bg-white rounded-xl border overflow-hidden',
      isActive ? 'border-[#1246FF]' : 'border-[#E4EAF2]',
    )}>
      {isActive && (
        <div className="h-1 bg-[#E8EFFE]">
          <div className="h-full bg-[#1246FF] transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
              isActive ? 'bg-[#E8EFFE]' : 'bg-[#F4F7FB]',
            )}>
              <CreditCard className={cn('w-[18px] h-[18px]', isActive ? 'text-[#1246FF]' : 'text-[#9AACBE]')} />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-[#0D1117]">{sub.plan_name}</h3>
              {sub.seat && (
                <p className="text-[11px] text-[#9AACBE] flex items-center gap-1">
                  <Armchair className="w-3 h-3" /> Seat {sub.seat.label}
                </p>
              )}
              {(sub.time_window_start && sub.time_window_end) || describeDaysOfWeek(sub.days_of_week) ? (
                <p className="text-[10.5px] text-[#92400E] font-semibold mt-0.5">
                  🕐 {[
                    sub.time_window_start && sub.time_window_end ? `${sub.time_window_start.slice(0, 5)}–${sub.time_window_end.slice(0, 5)}` : null,
                    describeDaysOfWeek(sub.days_of_week),
                  ].filter(Boolean).join(' · ')} only
                </p>
              ) : null}
            </div>
          </div>
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0', cfg.cls)}>
            {cfg.label}
          </span>
        </div>

        {sub.library && (
          <div className="flex items-start gap-1.5 mb-3">
            <MapPin className="w-3 h-3 text-[#9AACBE] mt-0.5 flex-shrink-0" />
            <span className="text-[10px] bg-[#F4F7FB] px-2 py-0.5 rounded-full text-[#6E7F94]">
              {sub.library.name}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#F4F7FB] rounded-xl p-2.5">
            <p className="text-[9px] text-[#9AACBE] mb-0.5 uppercase tracking-wide">Valid till</p>
            <p className="text-[11px] font-semibold text-[#0D1117] leading-snug">
              {sub.end_date ? fmtIST(sub.end_date).split(',').slice(0, 2).join(',') : '—'}
            </p>
          </div>
          <div className={cn('rounded-xl p-2.5', isActive ? 'bg-[#E8EFFE]' : 'bg-[#F4F7FB]')}>
            <p className="text-[9px] text-[#9AACBE] mb-0.5 uppercase tracking-wide">
              {isActive ? 'Days Left' : 'Duration'}
            </p>
            <p className={cn(
              'text-[11px] font-semibold leading-snug',
              isActive
                ? sub.days_left <= 7 ? 'text-[#C5282C]' : 'text-[#1246FF]'
                : 'text-[#6E7F94]',
            )}>
              {isActive ? `${sub.days_left} days` : `${sub.duration_days} days`}
            </p>
          </div>
        </div>

        {sub.status === 'pending' && (
          <div className="mt-3 flex items-start gap-2 bg-[#FEF3C7] rounded-xl p-3">
            <AlertCircle className="w-3.5 h-3.5 text-[#B45309] flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-[#92400E] leading-relaxed">
              Payment is pending verification. Plan activates automatically once payment is confirmed.
            </p>
          </div>
        )}

        {isActive && sub.qrSvg && (
          <div className="mt-3 flex flex-col items-center gap-2 bg-[#F4F7FB] rounded-xl p-4">
            <p className="text-[10px] font-bold text-[#6E7F94] uppercase tracking-wide flex items-center gap-1">
              <QrCode className="w-3 h-3" /> Your Digital Pass
            </p>
            <div className="w-32 h-32 bg-white p-2 rounded-lg" dangerouslySetInnerHTML={{ __html: sub.qrSvg }} />
            <p className="text-[10px] text-[#9AACBE] text-center">Show this at the library — staff will scan you in and out.</p>
          </div>
        )}
      </div>

      <div className="border-t border-[#F4F7FB] px-4 py-2.5 flex items-center justify-between">
        <span className="text-[13px] font-bold text-[#0D1117]">₹{sub.plan_price}</span>
        <span className="text-[11px] text-[#9AACBE]">for {sub.duration_days} days</span>
      </div>
    </div>
  )
}

export default function SubscriptionsClient({
  subscriptions,
}: {
  subscriptions: StudentSubscription[]
}) {
  const router = useRouter()
  const active = subscriptions.filter((s) => s.status === 'active' || s.status === 'pending')
  const past   = subscriptions.filter((s) => s.status !== 'active' && s.status !== 'pending')

  return (
    <div className="p-5 md:p-7 max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-bold text-[#0D1117]">Membership Plans</h1>
          <p className="text-[13px] text-[#9AACBE] mt-0.5">
            {active.length} active plan{active.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => router.push('/explore')}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1246FF] text-white rounded-xl text-[12px] font-semibold hover:bg-[#0E38CC] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Browse Plans
        </button>
      </div>

      {subscriptions.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F4F7FB] flex items-center justify-center mb-4">
            <CreditCard className="w-6 h-6 text-[#C4CDD8]" />
          </div>
          <h3 className="text-[14px] font-semibold text-[#0D1117] mb-1">No Plans Yet</h3>
          <p className="text-[12px] text-[#9AACBE] max-w-xs mb-4">
            Subscribe to a membership plan and save on your daily study sessions.
          </p>
          <button
            onClick={() => router.push('/explore')}
            className="px-5 py-2.5 bg-[#1246FF] text-white rounded-xl text-[13px] font-semibold hover:bg-[#0E38CC] transition-colors"
          >
            Explore Libraries &amp; Plans
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {active.length > 0 && (
            <section>
              <h2 className="text-[11px] font-bold text-[#9AACBE] uppercase tracking-widest mb-3">
                Active Plans
              </h2>
              <div className="space-y-3">
                {active.map((s) => <SubCard key={s.id} sub={s} />)}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="text-[11px] font-bold text-[#9AACBE] uppercase tracking-widest mb-3">
                Past Plans
              </h2>
              <div className="space-y-3">
                {past.map((s) => <SubCard key={s.id} sub={s} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}