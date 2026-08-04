// components/student/SubscriptionsClient.tsx
'use client'

import { useRouter } from 'next/navigation'
import type { StudentSubscription } from '@/lib/actions/students/student-subscriptions'
import { CreditCard, MapPin, Armchair, AlertCircle, Plus, QrCode } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtIST } from '@/lib/ist'
import { describeDaysOfWeek } from '@/lib/booking/subscriptionEntitlement'
import { ClayCard, ClayChip, ClayIconBadge, ClayButton } from '@/components/ui/Clay'

const STATUS_CFG: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  active:    { label: 'Active',    tone: 'success' },
  pending:   { label: 'Pending Payment', tone: 'warning' },
  expired:   { label: 'Expired',   tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
}

function SubCard({ sub }: { sub: StudentSubscription }) {
  const cfg     = STATUS_CFG[sub.status] ?? STATUS_CFG.expired
  const isActive = sub.status === 'active'

  const progressPct = isActive && sub.duration_days > 0
    ? Math.round((sub.days_left / sub.duration_days) * 100)
    : 0

  return (
    <ClayCard interactive={false}>
      {isActive && (
        <div className="h-1 bg-[#E8EFFE]">
          <div className="h-full bg-[#1246FF] transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <ClayIconBadge size="md" className={isActive ? 'bg-[#E8EFFE]' : undefined}>
              <CreditCard className={cn('w-[18px] h-[18px]', isActive ? 'text-[#1246FF]' : 'text-[#9AACBE]')} />
            </ClayIconBadge>
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
          <ClayChip tone={cfg.tone} className="flex-shrink-0">{cfg.label}</ClayChip>
        </div>

        {sub.library && (
          <div className="flex items-start gap-1.5 mb-3">
            <MapPin className="w-3 h-3 text-[#9AACBE] mt-0.5 flex-shrink-0" />
            <ClayChip tone="neutral" className="text-[#6E7F94]">{sub.library.name}</ClayChip>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="clay-pressed p-2.5">
            <p className="text-[9px] text-[#9AACBE] mb-0.5 uppercase tracking-wide">Valid till</p>
            <p className="text-[11px] font-semibold text-[#0D1117] leading-snug">
              {sub.end_date ? fmtIST(sub.end_date).split(',').slice(0, 2).join(',') : '—'}
            </p>
          </div>
          <div className={cn('clay-pressed p-2.5', isActive && 'bg-[#E8EFFE]')}>
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
          <div className="clay-pressed mt-3 flex items-start gap-2 p-3">
            <AlertCircle className="w-3.5 h-3.5 text-[#B45309] flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-[#92400E] leading-relaxed">
              Payment is pending verification. Plan activates automatically once payment is confirmed.
            </p>
          </div>
        )}

        {isActive && sub.qrSvg && (
          <div className="clay-pressed mt-3 flex flex-col items-center gap-2 p-4">
            <p className="text-[10px] font-bold text-[#6E7F94] uppercase tracking-wide flex items-center gap-1">
              <QrCode className="w-3 h-3" /> Your Digital Pass
            </p>
            <div className="clay-raised w-32 h-32 p-2" dangerouslySetInnerHTML={{ __html: sub.qrSvg }} />
            <p className="text-[10px] text-[#9AACBE] text-center">Show this at the library — staff will scan you in and out.</p>
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 flex items-center justify-between" style={{ boxShadow: 'inset 0 1px 0 rgba(163,177,198,.25)' }}>
        <span className="text-[13px] font-bold text-[#0D1117]">₹{sub.plan_price}</span>
        <span className="text-[11px] text-[#9AACBE]">for {sub.duration_days} days</span>
      </div>
    </ClayCard>
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
        <ClayButton size="sm" onClick={() => router.push('/explore')}>
          <Plus className="w-3.5 h-3.5" />
          Browse Plans
        </ClayButton>
      </div>

      {subscriptions.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <ClayIconBadge size="lg" className="mb-4">
            <CreditCard className="w-6 h-6 text-[#C4CDD8]" />
          </ClayIconBadge>
          <h3 className="text-[14px] font-semibold text-[#0D1117] mb-1">No Plans Yet</h3>
          <p className="text-[12px] text-[#9AACBE] max-w-xs mb-4">
            Subscribe to a membership plan and save on your daily study sessions.
          </p>
          <ClayButton onClick={() => router.push('/explore')}>
            Explore Libraries &amp; Plans
          </ClayButton>
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