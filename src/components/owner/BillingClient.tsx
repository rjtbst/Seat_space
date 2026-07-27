// src/components/owner/BillingClient.tsx
'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { OwnerLibrary } from '@/lib/actions/owner'
import type { PayoutSetupView } from '@/lib/actions/payout-setup'
import {
  getPlatformSubscription, getPlatformSubscriptionPaymentHistory,
  startPlatformSubscription, cancelPlatformSubscription, confirmPlatformSubscriptionCheckout,
} from '@/lib/actions/platform-subscription'
import { useRazorpaySubscriptionCheckout } from '@/hooks/userazorpay'
import { setPayoutBankAccount, setPayoutVpa, setDefaultPayoutMethod } from '@/lib/actions/payout-setup'
import type { PlatformSubscriptionView, PlatformSubscriptionPaymentRow } from '@/lib/actions/platform-subscription'

const ACCENT = '#0D7C54'
const ACCENT_LIGHT = '#D1FAE5'

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  active:        { label: 'Active',          color: '#065F46', bg: '#D1FAE5' },
  authenticated: { label: 'Pending charge',  color: '#065F46', bg: '#D1FAE5' },
  past_due:      { label: 'Past due',         color: '#991B1B', bg: '#FEE2E2' },
  halted:        { label: 'Halted',           color: '#991B1B', bg: '#FEE2E2' },
  pending:       { label: 'Pending',          color: '#92400E', bg: '#FEF3C7' },
  created:       { label: 'Setting up',       color: '#92400E', bg: '#FEF3C7' },
  cancelled:     { label: 'Cancelled',        color: '#6B21A8', bg: '#F3E8FF' },
  expired:       { label: 'Expired',          color: '#6B21A8', bg: '#F3E8FF' },
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1.5px solid #E2DDD4', borderRadius: 16, padding: 24, marginBottom: 20 }}>
      {children}
    </div>
  )
}

function SubscriptionPanel({ library }: { library: OwnerLibrary }) {
  const [sub, setSub] = useState<PlatformSubscriptionView | null>(null)
  const [history, setHistory] = useState<PlatformSubscriptionPaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subMessage, setSubMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const { openSubscriptionCheckout } = useRazorpaySubscriptionCheckout()
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([getPlatformSubscription(library.id), getPlatformSubscriptionPaymentHistory(library.id)])
      .then(([s, h]) => { setSub(s); setHistory(h); setLoading(false) })
    // Stop polling for a subscription that no longer belongs to the
    // library currently shown, and stop it on unmount — previously this
    // interval was never cleared, so navigating away mid-poll (or this
    // component re-rendering for a different library) left it running
    // in the background calling setState on a gone component.
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [library.id])

  function pollSubscription() {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    let attempts = 0
    pollIntervalRef.current = setInterval(async () => {
      attempts++
      const updated = await getPlatformSubscription(library.id)
      setSub(updated)
      if (updated?.status === 'authenticated' || updated?.status === 'active' || attempts >= 10) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
        setSubMessage(null)
      }
    }, 3000)
  }

  function handleSubscribe() {
    setError(null)
    setSubMessage(null)
    startTransition(async () => {
      const res = await startPlatformSubscription(library.id)
      if (!res.success) { setError(res.error); return }

      openSubscriptionCheckout({
        subscriptionId: res.data.razorpaySubscriptionId,
        keyId: res.data.keyId,
        name: 'seatspace',
        description: '₹399/month platform subscription',
        prefill: res.data.prefill,
        onSuccess: async (paymentId, subscriptionId, signature) => {
          await confirmPlatformSubscriptionCheckout({
            razorpaySubscriptionId: subscriptionId,
            razorpayPaymentId: paymentId,
            razorpaySignature: signature,
          })
          setSubMessage('Mandate authorized — confirming with Razorpay…')
          pollSubscription()
        },
        onDismiss: () => {
          setError('Subscription setup was not completed. You can try again when ready.')
        },
        onError: (msg) => {
          setError(msg)
        },
      })
    })
  }

  function handleCancel() {
    setError(null)
    if (!cancelReason.trim()) { setError('Please tell us why you\'re cancelling'); return }
    startTransition(async () => {
      const res = await cancelPlatformSubscription(library.id, cancelReason)
      if (!res.success) setError(res.error)
      else { setShowCancelForm(false); getPlatformSubscription(library.id).then(setSub) }
    })
  }

  if (loading) return <Card><p style={{ color: '#9AAAB8', fontSize: 13 }}>Loading subscription…</p></Card>

  const statusInfo = sub?.status ? STATUS_LABEL[sub.status] ?? { label: sub.status, color: '#555', bg: '#F1F1F1' } : null

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{library.name}</h3>
          <p style={{ fontSize: 12.5, color: '#8B95A5', margin: '3px 0 0' }}>₹399/month platform subscription</p>
        </div>
        {statusInfo && (
          <span style={{ background: statusInfo.bg, color: statusInfo.color, fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 999 }}>
            {statusInfo.label}
          </span>
        )}
      </div>

      {error && <div style={{ background: '#FDEAEA', color: '#9B1C1C', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
      {subMessage && <div style={{ background: ACCENT_LIGHT, color: '#0A5E3F', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>⏳ {subMessage}</div>}

      {library.is_in_trial && (!sub?.status || ['cancelled', 'expired', 'halted'].includes(sub.status)) && (
        <div style={{ background: '#EDE9FE', border: '1px solid rgba(124,58,237,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: '#5B21B6' }}>
          🎉 You're on your free trial —{' '}
          <strong>{library.trial_days_remaining} day{library.trial_days_remaining === 1 ? '' : 's'} left</strong>.
          Your library stays live at no cost until then; set up billing any time before it ends to avoid a gap.
        </div>
      )}

      {!sub?.status || ['cancelled', 'expired', 'halted'].includes(sub.status) ? (
        <button disabled={isPending} onClick={handleSubscribe} style={{
          padding: '10px 20px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff',
          fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
        }}>
          {isPending ? 'Setting up…' : sub?.status ? 'Re-subscribe' : library.is_in_trial ? 'Set up billing early' : 'Set up subscription'}
        </button>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: sub.gracePeriodEndsAt ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 12, marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 11, color: '#9AAAB8', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Next billing</p>
              <p style={{ fontSize: 13.5, fontWeight: 600, margin: '3px 0 0' }}>{sub.nextBillingAt ? new Date(sub.nextBillingAt).toLocaleDateString('en-IN') : '—'}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: '#9AAAB8', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Amount</p>
              <p style={{ fontSize: 13.5, fontWeight: 600, margin: '3px 0 0' }}>₹{sub.amountRupees.toFixed(2)}/mo</p>
            </div>
            {sub.gracePeriodEndsAt && (
              <div>
                <p style={{ fontSize: 11, color: '#9B1C1C', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Grace ends</p>
                <p style={{ fontSize: 13.5, fontWeight: 600, margin: '3px 0 0', color: '#9B1C1C' }}>{new Date(sub.gracePeriodEndsAt).toLocaleDateString('en-IN')}</p>
              </div>
            )}
          </div>

          {sub.status === 'past_due' && (
            <div style={{ background: '#FEF3E2', border: '1px solid rgba(201,106,0,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: '#92400E' }}>
              ⚠️ Your last payment failed. Please ensure your UPI AutoPay mandate is funded — your library will go offline if this isn't resolved before the grace period ends.
            </div>
          )}

          {sub.cancelAtPeriodEnd && (
            <div style={{ background: '#F3E8FF', border: '1px solid rgba(107,33,168,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: '#6B21A8' }}>
              This subscription is set to cancel at the end of the current billing period.
            </div>
          )}

          {!sub.cancelAtPeriodEnd && !showCancelForm && (
            <button onClick={() => setShowCancelForm(true)} style={{
              background: 'none', border: 'none', color: '#9B1C1C', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0,
            }}>
              Cancel subscription
            </button>
          )}

          {showCancelForm && (
            <div style={{ marginTop: 8 }}>
              <textarea
                placeholder="Why are you cancelling?"
                value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                style={{ width: '100%', minHeight: 50, padding: 8, borderRadius: 8, border: '1px solid #E2DDD4', fontSize: 12.5, marginBottom: 8, fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={isPending} onClick={handleCancel} style={{
                  padding: '7px 14px', borderRadius: 8, border: 'none', background: '#9B1C1C', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                }}>Confirm cancel</button>
                <button onClick={() => setShowCancelForm(false)} style={{
                  padding: '7px 14px', borderRadius: 8, border: '1px solid #E2DDD4', background: '#fff', color: '#6B7689', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
                }}>Keep subscription</button>
              </div>
            </div>
          )}
        </>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#3A4A5C', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 8px' }}>Payment history</p>
          <div style={{ borderTop: '1px solid #F0EDE8' }}>
            {history.slice(0, 6).map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F0EDE8', fontSize: 12.5 }}>
                <span style={{ color: h.status === 'captured' ? '#0A5E3F' : h.status === 'failed' ? '#9B1C1C' : '#6B7689' }}>
                  {h.status === 'captured' ? '✓ Paid' : h.status === 'failed' ? '✕ Failed' : h.status}
                  {h.isRetry && ' (retry)'}
                </span>
                <span style={{ color: '#6B7689' }}>₹{h.amountRupees.toFixed(2)}</span>
                <span style={{ color: '#9AAAB8' }}>{new Date(h.createdAt).toLocaleDateString('en-IN')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function PayoutSetupPanel({ initial }: { initial: PayoutSetupView | null }) {
  const [setup, setSetup] = useState(initial)
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankIfsc, setBankIfsc] = useState('')
  const [vpa, setVpa] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isMobile = useIsMobile()

  function submitBank() {
    setError(null); setSuccess(null)
    startTransition(async () => {
      const res = await setPayoutBankAccount({ accountName: bankName, accountNumber: bankAccount, ifsc: bankIfsc })
      if (!res.success) setError(res.error)
      else { setSuccess('Bank account saved'); setBankName(''); setBankAccount(''); setBankIfsc('') }
    })
  }

  function submitVpa() {
    setError(null); setSuccess(null)
    startTransition(async () => {
      const res = await setPayoutVpa({ vpa })
      if (!res.success) setError(res.error)
      else { setSuccess('UPI ID saved'); setVpa('') }
    })
  }

  function setDefault(method: 'bank_account' | 'vpa') {
    startTransition(async () => {
      const res = await setDefaultPayoutMethod(method)
      if (res.success) setSetup(prev => prev ? { ...prev, payoutDefaultMethod: method } : prev)
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #E2DDD4', fontSize: 13.5, marginBottom: 10,
  }

  return (
    <Card>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>Payout details</h3>
      <p style={{ fontSize: 12.5, color: '#8B95A5', margin: '0 0 16px' }}>
        Where your booking earnings get sent once a booking is complete — you receive your full listed price; the platform's fee is added on top of what the student pays, not deducted from your payout.
      </p>

      {error && <div style={{ background: '#FDEAEA', color: '#9B1C1C', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
      {success && <div style={{ background: ACCENT_LIGHT, color: '#0A5E3F', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>{success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 24 : 20 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>
            Bank account {setup?.hasBankAccount && <span style={{ color: ACCENT }}>✓ saved</span>}
          </p>
          {setup?.hasBankAccount && (
            <p style={{ fontSize: 12.5, color: '#6B7689', margin: '0 0 10px' }}>
              {setup.payoutBankAccountName} · {setup.payoutBankAccountNumber} · {setup.payoutBankIfsc}
            </p>
          )}
          <input placeholder="Account holder name" value={bankName} onChange={e => setBankName(e.target.value)} style={inputStyle} />
          <input placeholder="Account number" value={bankAccount} onChange={e => setBankAccount(e.target.value)} style={inputStyle} />
          <input placeholder="IFSC code" value={bankIfsc} onChange={e => setBankIfsc(e.target.value)} style={inputStyle} />
          <button disabled={isPending || !bankName || !bankAccount || !bankIfsc} onClick={submitBank} style={{
            padding: '9px 16px', borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>
            {setup?.hasBankAccount ? 'Update bank account' : 'Save bank account'}
          </button>
          {setup?.hasBankAccount && setup.payoutDefaultMethod !== 'bank_account' && (
            <button onClick={() => setDefault('bank_account')} style={{
              marginLeft: 8, padding: '9px 14px', borderRadius: 8, border: '1.5px solid #E2DDD4', background: '#fff', color: '#3A4A5C', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
              Make default
            </button>
          )}
        </div>

        <div>
          <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>
            UPI ID {setup?.hasVpa && <span style={{ color: ACCENT }}>✓ saved</span>}
          </p>
          {setup?.hasVpa && (
            <p style={{ fontSize: 12.5, color: '#6B7689', margin: '0 0 10px' }}>{setup.payoutVpa}</p>
          )}
          <input placeholder="yourname@bank" value={vpa} onChange={e => setVpa(e.target.value)} style={inputStyle} />
          <button disabled={isPending || !vpa} onClick={submitVpa} style={{
            padding: '9px 16px', borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>
            {setup?.hasVpa ? 'Update UPI ID' : 'Save UPI ID'}
          </button>
          {setup?.hasVpa && setup.payoutDefaultMethod !== 'vpa' && (
            <button onClick={() => setDefault('vpa')} style={{
              marginLeft: 8, padding: '9px 14px', borderRadius: 8, border: '1.5px solid #E2DDD4', background: '#fff', color: '#3A4A5C', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
              Make default
            </button>
          )}
        </div>
      </div>

      {setup?.payoutDefaultMethod && (
        <p style={{ fontSize: 12, color: '#8B95A5', marginTop: 16 }}>
          Currently sending payouts via <strong>{setup.payoutDefaultMethod === 'vpa' ? 'UPI' : 'bank transfer'}</strong>.
        </p>
      )}
    </Card>
  )
}

export default function BillingClient({ libraries, payoutSetup }: { libraries: OwnerLibrary[]; payoutSetup: PayoutSetupView | null }) {
  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', padding: '8px 4px', maxWidth: 880 }}>
      <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, margin: '0 0 6px' }}>Billing & Payouts</h1>
      <p style={{ fontSize: 13.5, color: '#6B7689', margin: '0 0 24px' }}>
        Manage your platform subscriptions and where your booking earnings get paid out.
      </p>

      <PayoutSetupPanel initial={payoutSetup} />

      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '24px 0 12px' }}>Library subscriptions</h2>
      {libraries.length === 0 ? (
        <Card><p style={{ color: '#9AAAB8', fontSize: 13 }}>You don't have any libraries yet.</p></Card>
      ) : (
        libraries.map(lib => <SubscriptionPanel key={lib.id} library={lib} />)
      )}
    </div>
  )
}