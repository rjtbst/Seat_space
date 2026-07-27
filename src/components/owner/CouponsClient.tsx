'use client'
import { useState, useTransition } from 'react'
import type { OwnerCoupon } from '@/lib/actions/owner/coupons'
import { createCoupon, toggleCouponActive } from '@/lib/actions/owner/coupons'
import type { PlanWithStats } from '@/lib/actions/owner'
import { useToast } from '@/hooks/useToast'
import {
  ACCENT, ACCENT_LIGHT, RED, BORDER, BG_CARD, FONT_DISPLAY, FONT_BODY,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, INP_STYLE,
} from '@/lib/constants/theme'
import { Card, PageHeader, EmptyState, Toast, Toggle, ErrorBanner } from '@/components/owner/ui'

const EMPTY_FORM = {
  code:                  '',
  planId:                '',   // '' = any plan
  discountType:          'percent' as 'percent' | 'flat',
  discountValue:         '',
  maxRedemptions:        '',   // '' = unlimited
  maxRedemptionsPerUser: '1',
  expiresAt:             '',   // '' = never
}

export default function CouponsClient({
  coupons: initialCoupons, plans,
}: {
  coupons: OwnerCoupon[]
  plans:   PlanWithStats[]
}) {
  const [coupons, setCoupons] = useState(initialCoupons)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const { toast, showToast } = useToast()

  function handleCreate() {
    setFormError(null)

    const discountValue = Number(form.discountValue)
    if (!form.code.trim())            return setFormError('Enter a coupon code')
    if (!discountValue || discountValue <= 0) return setFormError('Enter a valid discount value')
    if (form.discountType === 'percent' && discountValue > 100)
      return setFormError('Percent discount cannot exceed 100')

    startTransition(async () => {
      const res = await createCoupon({
        code:                  form.code,
        planId:                form.planId || undefined,
        discountType:          form.discountType,
        discountValue,
        maxRedemptions:        form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
        maxRedemptionsPerUser: Number(form.maxRedemptionsPerUser) || 1,
        // Plain wall-clock string, end of the selected day — matches this
        // app's IST-plain-string convention for timestamp (no timezone)
        // columns (see lib/ist.ts). Deliberately NOT new Date(...).toISOString():
        // that round-trips through the browser's local timezone and would
        // store the wrong wall-clock time, and using midnight (the date
        // string alone) would expire the coupon at the START of the
        // selected day instead of letting it be used all day through.
        expiresAt:             form.expiresAt ? `${form.expiresAt}T23:59:59` : undefined,
      })

      if (res.success === false) return setFormError(res.error)

      showToast(`Coupon ${form.code.toUpperCase()} created`)
      setForm(EMPTY_FORM)
      setFormOpen(false)
      // Optimistic prepend — good enough here since the created row's shape
      // is fully known from the form; a full refetch would just add a
      // network round-trip for no visible benefit.
      setCoupons(prev => [{
        id:                    res.data.couponId,
        code:                  form.code.toUpperCase(),
        planId:                form.planId || null,
        planName:              plans.find(p => p.id === form.planId)?.name ?? null,
        discountType:          form.discountType,
        discountValue,
        maxRedemptions:        form.maxRedemptions ? Number(form.maxRedemptions) : null,
        maxRedemptionsPerUser: Number(form.maxRedemptionsPerUser) || 1,
        timesRedeemed:         0,
        isActive:              true,
        expiresAt:             form.expiresAt ? `${form.expiresAt}T23:59:59` : null,
        createdAt:             new Date().toISOString(),
      }, ...prev])
    })
  }

  function handleToggle(coupon: OwnerCoupon) {
    setTogglingId(coupon.id)
    startTransition(async () => {
      const res = await toggleCouponActive(coupon.id, !coupon.isActive)
      setTogglingId(null)
      if (res.success === false) return showToast(res.error, false)
      setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, isActive: !c.isActive } : c))
    })
  }

  return (
    <div>
      <Toast toast={toast} />
      <PageHeader
        title="Coupons"
        subtitle="Create discount codes for your membership plans — share manually over WhatsApp or email with loyal students."
        action={
          <button className="press"
            onClick={() => setFormOpen(o => !o)}
            style={{
              padding: '9px 16px', borderRadius: 9, border: 'none',
              background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: FONT_BODY,
            }}
          >
            {formOpen ? 'Cancel' : '+ New Coupon'}
          </button>
        }
      />

      {formOpen && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 14 }}>New coupon</div>

          {formError && <ErrorBanner error={formError} />}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Field label="Code">
              <input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') }))}
                placeholder="WELCOME10"
                maxLength={40}
                style={INP_STYLE as React.CSSProperties}
              />
            </Field>

            <Field label="Applies to">
              <select
                value={form.planId}
                onChange={e => setForm(f => ({ ...f, planId: e.target.value }))}
                style={INP_STYLE as React.CSSProperties}
              >
                <option value="">Any plan</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>

            <Field label="Discount type">
              <select
                value={form.discountType}
                onChange={e => setForm(f => ({ ...f, discountType: e.target.value as 'percent' | 'flat' }))}
                style={INP_STYLE as React.CSSProperties}
              >
                <option value="percent">Percent off</option>
                <option value="flat">Flat amount off (₹)</option>
              </select>
            </Field>

            <Field label={form.discountType === 'percent' ? 'Discount (%)' : 'Discount (₹)'}>
              <input
                type="number"
                min={1}
                max={form.discountType === 'percent' ? 100 : undefined}
                value={form.discountValue}
                onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                placeholder={form.discountType === 'percent' ? '10' : '100'}
                style={INP_STYLE as React.CSSProperties}
              />
            </Field>

            <Field label="Max total uses">
              <input
                type="number"
                min={1}
                value={form.maxRedemptions}
                onChange={e => setForm(f => ({ ...f, maxRedemptions: e.target.value }))}
                placeholder="Unlimited"
                style={INP_STYLE as React.CSSProperties}
              />
            </Field>

            <Field label="Max uses per student">
              <input
                type="number"
                min={1}
                value={form.maxRedemptionsPerUser}
                onChange={e => setForm(f => ({ ...f, maxRedemptionsPerUser: e.target.value }))}
                style={INP_STYLE as React.CSSProperties}
              />
            </Field>

            <Field label="Expires">
              <input
                type="date"
                value={form.expiresAt}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                style={INP_STYLE as React.CSSProperties}
              />
            </Field>
          </div>

          <button className="press"
            onClick={handleCreate}
            disabled={pending}
            style={{
              marginTop: 16, padding: '10px 20px', borderRadius: 9, border: 'none',
              background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.7 : 1,
              fontFamily: FONT_BODY,
            }}
          >
            {pending ? 'Creating…' : 'Create coupon'}
          </button>
        </Card>
      )}

      {coupons.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title="No coupons yet"
          subtitle="Create a code to offer loyal students a discount on membership plans."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {coupons.map(c => (
            <Card key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 15, color: TEXT_PRIMARY, letterSpacing: '0.02em' }}>
                    {c.code}
                  </span>
                  <span style={{
                    padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                    background: ACCENT_LIGHT, color: ACCENT,
                  }}>
                    {c.discountType === 'percent' ? `${c.discountValue}% off` : `₹${c.discountValue} off`}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginTop: 4 }}>
                  {c.planName ?? 'Any plan'} · {c.timesRedeemed}{c.maxRedemptions ? `/${c.maxRedemptions}` : ''} used
                  {c.maxRedemptionsPerUser > 1 ? ` · up to ${c.maxRedemptionsPerUser}/student` : ' · once per student'}
                  {c.expiresAt ? ` · expires ${new Date(c.expiresAt).toLocaleDateString('en-IN')}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: c.isActive ? ACCENT : TEXT_MUTED, fontWeight: 600 }}>
                  {c.isActive ? 'Active' : 'Inactive'}
                </span>
                <Toggle on={c.isActive} onChange={() => handleToggle(c)} disabled={togglingId === c.id} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
