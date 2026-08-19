// src/components/owner/GoLiveClient.tsx
'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getLibraryOnboardingSummary, publishLibrary, getLibraryGoLiveStatus } from '@/lib/actions/library'
import { LIBRARY_STATUS_LABELS } from '@/lib/library-status'
import { startPlatformSubscription, confirmPlatformSubscriptionCheckout } from '@/lib/actions/platform-subscription'
import { useRazorpaySubscriptionCheckout } from '@/hooks/userazorpay'
import { set } from 'zod'

const ACCENT       = '#0D7C54'
const ACCENT_LIGHT = '#D1FAE5'
const ACCENT_DARK  = '#0A5E3F'

/* ─── Steps ─────────────────────────────────────────────────────────────────── */
function Steps() {
  // See LibraryPhotosClient.tsx for why this is a 3-step library-setup
  // wizard, not the old 6-step account-onboarding sequence.
  const steps = [
    { label: 'Library', done: true },
    { label: 'Photos',  done: true },
    { label: 'Go Live', done: false, active: true },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 32 }}>
      {steps.map((s, i) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700,
              background: s.done || s.active ? ACCENT : 'var(--clay-surface)',
              color: s.done || s.active ? '#fff' : '#9AAAB8',
              boxShadow: s.done || s.active
                ? '2px 2px 6px rgba(13,124,84,.35), -1px -1px 4px rgba(255,255,255,.4)'
                : 'inset 2px 2px 5px rgba(163,177,198,.35), inset -1px -1px 3px rgba(255,255,255,.6)',
            }}>
              {s.done ? '✓' : i + 1}
            </div>
            <span style={{
              fontSize: 9, fontWeight: s.active ? 700 : 500,
              color: s.active ? ACCENT : s.done ? '#3A4A5C' : '#9AAAB8',
              letterSpacing: '.02em',
            }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: 28, height: 2, background: s.done ? ACCENT : '#DDE3EC', margin: '0 3px', marginBottom: 18 }} />
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── Checklist item ─────────────────────────────────────────────────────────── */
function CheckRow({
  ok, label, detail, action, onAction,
}: {
  ok: boolean; label: string; detail: string
  action?: string; onAction?: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 0',
      boxShadow: 'inset 0 -1px 0 rgba(163,177,198,.2)',
    }}>
      <div className="clay-icon-badge" style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: ok ? ACCENT_LIGHT : '#FEF3E2',
        fontSize: 14,
      }}>
        {ok ? '✓' : '⚠'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: ok ? '#0A0D12' : '#92400E' }}>{label}</div>
        <div style={{ fontSize: 12, color: '#6B7689', marginTop: 2 }}>{detail}</div>
      </div>
      {!ok && action && (
        <button className="clay-raised-sm clay-interactive"
          onClick={onAction}
          style={{
            padding: '5px 12px', fontSize: 12, fontWeight: 600,
            border: 'none', color: '#3A4A5C',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {action}
        </button>
      )}
    </div>
  )
}

/* ─── Library preview card ───────────────────────────────────────────────────── */
function PreviewCard({ summary }: { summary: LibrarySummary }) {
  return (
    <div className="clay-raised" style={{
      overflow: 'hidden', marginBottom: 20,
    }}>
      {/* Cover photo / placeholder */}
      <div style={{
        height: 140, background: summary.coverUrl
          ? `url(${summary.coverUrl}) center/cover`
          : 'linear-gradient(135deg,#D1FAE5,#A7F3D0)',
        display: summary.coverUrl ? 'block' : 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 48, color: ACCENT,
      }}>
        {!summary.coverUrl && '📚'}
      </div>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0A0D12' }}>{summary.name}</span>
          <span className="dash-badge" style={{
            background: '#FEF3E2', color: '#92400E',
          }}>○ Draft</span>
        </div>
        <div style={{ fontSize: 12, color: '#6B7689', marginBottom: 10 }}>
          📍 {summary.area ? `${summary.area}, ` : ''}{summary.city}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          
          <div>
            <div style={{ fontSize: 10, color: '#9AAAB8', textTransform: 'uppercase', letterSpacing: '.05em' }}>Photos</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0A0D12' }}>{summary.photoCount}</div>
          </div>
         
        </div>
      </div>
    </div>
  )
}

/* ─── Types ─────────────────────────────────────────────────────────────────── */
type LibrarySummary = {
  name: string; city: string; area: string
 
  photoCount: number; coverUrl: string | null
 
  hasAddress: boolean
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */
export default function GoLiveClient() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const libraryId    = searchParams.get('id') ?? ''

  const [summary,   setSummary]   = useState<LibrarySummary | null>(null)
  const [goLiveStatus, setGoLiveStatus] = useState<Awaited<ReturnType<typeof getLibraryGoLiveStatus>>>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [published, setPublished] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [subPending, startSubTransition] = useTransition()
  const [subMessage, setSubMessage] = useState('')
  const { openSubscriptionCheckout } = useRazorpaySubscriptionCheckout()
  const [isPending, startTransition] = useTransition()
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)

  useEffect(() => {
    if (!libraryId) return
    Promise.all([
      getLibraryOnboardingSummary(libraryId),
      getLibraryGoLiveStatus(libraryId),
    ]).then(([data, status]) => {
      if (data) setSummary(data)
      setGoLiveStatus(status)
      setLoading(false)
    })
  }, [libraryId])

  const checks = summary ? [
    {
      ok: !!summary.name,
      label: 'Library name set',
      detail: summary.name || 'No name set',
    },
    {
      ok: summary.hasAddress,
      label: 'Address added',
      detail: summary.hasAddress ? 'Full address saved' : 'Students need your address to find you',
      action: 'Add address',
      onAction: () => router.push(`/onboarding/add-library?id=${libraryId}`),
    },
    {
      ok: summary.photoCount > 0,
      label: `Photos uploaded (${summary.photoCount})`,
      detail: summary.photoCount >= 4
        ? 'Great! 4+ photos give the best results'
        : summary.photoCount > 0
          ? 'Add 4+ photos for best visibility'
          : 'At least 1 photo required',
      action: summary.photoCount === 0 ? 'Upload photos' : undefined,
      onAction: () => router.push(`/onboarding/library-photos?id=${libraryId}`),
    },
    {
      ok: !!goLiveStatus?.subscriptionActive,
      label: 'Platform subscription active',
      detail: goLiveStatus?.subscriptionActive
        ? '₹399/month subscription is active'
        : goLiveStatus?.subscriptionStatus === 'past_due'
          ? 'Your last payment failed — fix it to stay live'
          : '₹399/month required for your library to go live',
      action: goLiveStatus?.subscriptionActive ? undefined : 'Set up subscription',
      onAction: handleStartSubscription,
    },
  ] : []

  const allGood     = checks.every(c => c.ok)
  const isSuspended = goLiveStatus?.approvalStatus === 'suspended'
  const criticalOk  = summary && !isSuspended
    ? summary.photoCount > 0 && !!summary.name && !!goLiveStatus?.subscriptionActive
    : false

  function pollGoLiveStatus() {
    let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      const status = await getLibraryGoLiveStatus(libraryId)
      setGoLiveStatus(status)
      if (status?.subscriptionActive || attempts >= 10) clearInterval(interval)
    }, 3000)
  }

  function handleStartSubscription() {
    setError('')
    setSubMessage('')
    startSubTransition(async () => {
      const res = await startPlatformSubscription(libraryId)
      if (res.success === false) { setError(res.error); return }

      // In-page mandate authorization (instead of redirecting to Razorpay's
      // hosted short_url page — that page can 404 with "Hosted page is not
      // available" on accounts pending full Razorpay activation, even in
      // test mode). They authorize UPI AutoPay/card right here.
      openSubscriptionCheckout({
        subscriptionId: res.data.razorpaySubscriptionId,
        keyId: res.data.keyId,
        name: 'seatspace',
        description: '₹399/month platform subscription',
        prefill: res.data.prefill,
        onSuccess: async (paymentId, subscriptionId, signature) => {
          setError('')
          await confirmPlatformSubscriptionCheckout({
            razorpaySubscriptionId: subscriptionId,
            razorpayPaymentId: paymentId,
            razorpaySignature: signature,
          })
          setSubMessage('Mandate authorized — confirming with Razorpay, this can take a few seconds…')
          pollGoLiveStatus()
        },
        onDismiss: () => {
          setError('Subscription setup was not completed. You can try again whenever you\'re ready.')
        },
        onError: (msg) => {
          setError(msg)
        },
      })
    })
  }

  const handlePublish = () => {
    setError('')
    startTransition(async () => {
      const res = await publishLibrary(libraryId)
      if (res.success === false) {
        // Distinctive substring from the one place this specific error is
        // raised in publishLibrary() — used instead of a widened shared
        // ActionResult error-code field, to avoid touching a type used
        // across many other actions for one specific UI case.
        if (res.error.toLowerCase().includes('platform subscription')) {
          setShowSubscriptionModal(true)
          return
        }
        setError(res.error)
        return
      }
      if (res.data.status === 'live') setPublished(true)
      else setSubmitted(true) // 'submitted' — awaiting admin approval
    })
  }

  /* ── Submitted-for-review screen (awaiting admin approval) ── */
  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--clay-bg)',
        fontFamily: 'DM Sans, sans-serif', padding: '24px 16px',
      }}>
        <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
          <div style={{ fontSize: 72, marginBottom: 16 }}>🕒</div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 28, color: '#0A0D12', letterSpacing: '-0.04em', marginBottom: 10 }}>
            Submitted for review
          </h1>
          <p style={{ fontSize: 15, color: '#6B7689', lineHeight: 1.6, marginBottom: 28 }}>
            <strong>{summary?.name}</strong> has been submitted to the platform admin for approval. You'll be notified as soon as it's reviewed — this usually takes 1–2 business days.
          </p>
          <button className="clay-btn-primary"
            onClick={() => router.push('/dashboard')}
            style={{
              width: '100%', padding: '14px 0', fontSize: 15,
              fontWeight: 700, fontFamily: 'Syne, sans-serif', border: 'none',
              background: `linear-gradient(155deg, #22B37C, ${ACCENT}, #0A5E3F)`,
              cursor: 'pointer',
            }}
          >
            Go to Dashboard →
          </button>
        </div>
      </div>
    )
  }

  /* ── Published celebration screen ── */
  if (published) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--clay-bg)',
        fontFamily: 'DM Sans, sans-serif', padding: '24px 16px',
      }}>
        <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
          <div style={{ fontSize: 72, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 28, color: '#0A0D12', letterSpacing: '-0.04em', marginBottom: 10 }}>
            You're live!
          </h1>
          <p style={{ fontSize: 15, color: '#6B7689', lineHeight: 1.6, marginBottom: 28 }}>
            <strong>{summary?.name}</strong> is now visible to students. Bookings will start coming in soon.
          </p>

          <div className="clay-raised" style={{
            padding: '24px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3A4A5C', marginBottom: 14 }}>
              What's next
            </div>
            {[
              { icon: '👥', text: 'Add staff members from your dashboard' },
              { icon: '🪑', text: 'Add more seats and configure pricing' },
              { icon: '💳', text: 'Create membership plans for students' },
              { icon: '📊', text: 'Track bookings & revenue in real time' },
            ].map(({ icon, text }, i, arr) => (
              <div key={text} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', boxShadow: i < arr.length - 1 ? 'inset 0 -1px 0 rgba(163,177,198,.2)' : undefined }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                <span style={{ fontSize: 13, color: '#3A4A5C' }}>{text}</span>
              </div>
            ))}
          </div>

          <button className="clay-btn-primary"
            onClick={() => router.push('/dashboard')}
            style={{
              width: '100%', padding: '14px 0', fontSize: 15,
              fontWeight: 700, fontFamily: 'Syne, sans-serif', border: 'none',
              background: `linear-gradient(155deg, #22B37C, ${ACCENT}, #0A5E3F)`,
              cursor: 'pointer',
            }}
          >
            Go to Dashboard →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--clay-bg)',
      fontFamily: 'DM Sans, sans-serif', padding: '24px 16px', position: 'relative',
    }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 500, height: 500, top: -150, right: -100, borderRadius: '50%', background: 'radial-gradient(circle,rgba(13,124,84,.05),transparent 70%)' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 520, position: 'relative', zIndex: 1 }}>
        <Steps />

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16, background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: '4px 4px 12px rgba(13,124,84,.35), -3px -3px 8px rgba(255,255,255,.5)', fontSize: 24,
          }}>
            🚀
          </div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 26, color: '#0A0D12', letterSpacing: '-0.04em', marginBottom: 6 }}>
            Ready to go live?
          </h1>
          <p style={{ fontSize: 14, color: '#6B7689', fontWeight: 300, lineHeight: 1.5, margin: 0 }}>
            Step 3 of 3 — Review everything before publishing
          </p>
        </div>

        <div style={{
          background: 'var(--clay-surface)', border: 'none', borderRadius: 22,
          padding: '28px 28px 24px',
          boxShadow: '8px 8px 20px rgba(163,177,198,.35), -6px -6px 16px rgba(255,255,255,.7)',
        }}>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ width: 32, height: 32, border: `3px solid ${ACCENT_LIGHT}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin .65s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: '#6B7689' }}>Loading your library details…</div>
            </div>
          ) : summary ? (
            <>
              {/* Preview card */}
              <PreviewCard summary={summary} />

              {goLiveStatus?.displayStatus && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <span className="dash-badge" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 14px',
                    fontFamily: 'DM Sans, sans-serif', letterSpacing: '.02em',
                    background: LIBRARY_STATUS_LABELS[goLiveStatus.displayStatus].bg,
                    color: LIBRARY_STATUS_LABELS[goLiveStatus.displayStatus].color,
                  }}>
                    {LIBRARY_STATUS_LABELS[goLiveStatus.displayStatus].label}
                  </span>
                </div>
              )}

              {goLiveStatus?.displayStatus === 'expired' && (
                <div style={{ background: '#FEE2E2', border: 'none', borderRadius: 12, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10, boxShadow: '3px 3px 8px rgba(163,177,198,.28), -2px -2px 6px rgba(255,255,255,.6)' }}>
                  <span>⏰</span>
                  <p style={{ fontSize: 13, color: '#9B1C1C', margin: 0, lineHeight: 1.5 }}>
                    <strong>Your subscription has expired</strong> and this library is no longer visible to students. Renew below to go live again.
                  </p>
                </div>
              )}

              {goLiveStatus?.approvalStatus === 'rejected' && (
                <div style={{ background: '#FDEAEA', border: 'none', borderRadius: 12, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10, boxShadow: '3px 3px 8px rgba(163,177,198,.28), -2px -2px 6px rgba(255,255,255,.6)' }}>
                  <span>✕</span>
                  <p style={{ fontSize: 13, color: '#9B1C1C', margin: 0, lineHeight: 1.5 }}>
                    <strong>Your last submission was rejected:</strong> {goLiveStatus.approvalNotes ?? 'No reason given.'} Fix the issue and resubmit below.
                  </p>
                </div>
              )}

              {goLiveStatus?.approvalStatus === 'suspended' && (
                <div style={{ background: '#F3E8FF', border: 'none', borderRadius: 12, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10, boxShadow: '3px 3px 8px rgba(163,177,198,.28), -2px -2px 6px rgba(255,255,255,.6)' }}>
                  <span>⏸</span>
                  <p style={{ fontSize: 13, color: '#6B21A8', margin: 0, lineHeight: 1.5 }}>
                    <strong>This library is suspended:</strong> {goLiveStatus.suspendedReason ?? 'Contact support for details.'} You cannot go live until the platform admin lifts this suspension.
                  </p>
                </div>
              )}

              {/* Checklist */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#3A4A5C', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                  Readiness checklist
                </div>
                {checks.map(c => (
                  <CheckRow key={c.label} {...c} />
                ))}
              </div>

              {/* Overall status */}
              {allGood ? (
                <div style={{ background: ACCENT_LIGHT, border: 'none', borderRadius: 12, padding: '12px 14px', marginBottom: 20, display: 'flex', gap: 10, boxShadow: '3px 3px 8px rgba(163,177,198,.28), -2px -2px 6px rgba(255,255,255,.6)' }}>
                  <span>✅</span>
                  <p style={{ fontSize: 13, color: '#0A5E3F', margin: 0, lineHeight: 1.5 }}>
                    Everything looks great! Your library is ready to go live.
                  </p>
                </div>
              ) : criticalOk ? (
                <div style={{ background: '#FEF3E2', border: 'none', borderRadius: 12, padding: '12px 14px', marginBottom: 20, display: 'flex', gap: 10, boxShadow: '3px 3px 8px rgba(163,177,198,.28), -2px -2px 6px rgba(255,255,255,.6)' }}>
                  <span>⚠️</span>
                  <p style={{ fontSize: 13, color: '#92400E', margin: 0, lineHeight: 1.5 }}>
                    Some items are incomplete but you can go live now and fix them from the dashboard.
                  </p>
                </div>
              ) : (
                <div style={{ background: '#FDEAEA', border: 'none', borderRadius: 12, padding: '12px 14px', marginBottom: 20, display: 'flex', gap: 10, boxShadow: '3px 3px 8px rgba(163,177,198,.28), -2px -2px 6px rgba(255,255,255,.6)' }}>
                  <span>⛔</span>
                  <p style={{ fontSize: 13, color: '#9B1C1C', margin: 0, lineHeight: 1.5 }}>
                    Please fix the items marked above before going live.
                  </p>
                </div>
              )}

              {error && (
                <div style={{ background: '#FDEAEA', border: 'none', borderRadius: 12, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 8, boxShadow: '2px 2px 6px rgba(163,177,198,.25), -2px -2px 5px rgba(255,255,255,.55)' }}>
                  <span>⚠️</span>
                  <p style={{ fontSize: 13, color: '#9B1C1C', margin: 0 }}>{error}</p>
                </div>
              )}

              {subMessage && (
                <div style={{ background: ACCENT_LIGHT, border: 'none', borderRadius: 12, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 8, boxShadow: '2px 2px 6px rgba(163,177,198,.25), -2px -2px 5px rgba(255,255,255,.55)' }}>
                  <span>⏳</span>
                  <p style={{ fontSize: 13, color: '#0A5E3F', margin: 0 }}>{subMessage}</p>
                </div>
              )}

              <div style={{ height: 1, boxShadow: 'inset 0 -1px 0 rgba(163,177,198,.3)', margin: '4px 0 20px' }} />

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="clay-raised-sm clay-interactive"
                  type="button"
                  onClick={() => router.back()}
                  style={{
                    flex: 1, padding: '13px 0', fontSize: 14, fontWeight: 600,
                    fontFamily: 'DM Sans, sans-serif', border: 'none',
                    color: '#3A4A5C', cursor: 'pointer',
                  }}
                >
                  ← Back
                </button>
                <button
                  onClick={handlePublish}
                  disabled={!criticalOk || isPending || subPending}
                  style={{
                    flex: 2, padding: '13px 0', borderRadius: 14, fontSize: 15,
                    fontWeight: 700, fontFamily: 'Syne, sans-serif', border: 'none',
                    background: criticalOk ? `linear-gradient(155deg, #22B37C, ${ACCENT}, ${ACCENT_DARK})` : '#C8D4C8', color: '#fff',
                    cursor: criticalOk ? 'pointer' : 'not-allowed',
                    boxShadow: criticalOk
                      ? '4px 4px 12px rgba(13,124,84,.35), -3px -3px 8px rgba(255,255,255,.4), inset 0 1px 1px rgba(255,255,255,.3)'
                      : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'transform .15s, box-shadow .15s',
                  }}
                >
                  {isPending && <span style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin .65s linear infinite' }} />}
                  {isPending
                    ? 'Submitting…'
                    : goLiveStatus?.approvalStatus === 'approved'
                      ? '🚀 Go Live Now'
                      : '📨 Submit for Review'}
                </button>
              </div>

              <p style={{ textAlign: 'center', fontSize: 12, color: '#9AAAB8', marginTop: 12, lineHeight: 1.5 }}>
                You can pause or edit your library anytime from the dashboard.
              </p>
            </>
          ) : (
            <p style={{ textAlign: 'center', color: '#9B1C1C', fontSize: 13 }}>
              Library not found. Please go back and try again.
            </p>
          )}
        </div>
      </div>

      {/* Blocking modal: subscription payment required before this library
          can be activated. Library stays in Draft (or wherever it currently
          sits) — publishLibrary() never flips is_active or submits for
          review without an active subscription. */}
      {showSubscriptionModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(10,13,18,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
          onClick={() => setShowSubscriptionModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="clay-raised"
            style={{
              width: '100%', maxWidth: 400, background: 'var(--clay-surface)',
              padding: '28px 24px', textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 44, marginBottom: 12 }}>💳</div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20, color: '#0A0D12', marginBottom: 8 }}>
              Subscription payment required
            </h2>
            <p style={{ fontSize: 13.5, color: '#6B7689', lineHeight: 1.6, marginBottom: 22 }}>
              Please complete payment to make this library active. Your library is saved as a draft and won't be lost — it just won't be visible to students until your ₹399/month subscription is set up.
            </p>
            <button className="clay-btn-primary"
              onClick={() => { setShowSubscriptionModal(false); handleStartSubscription() }}
              disabled={subPending}
              style={{
                width: '100%', padding: '13px 0', fontSize: 15,
                fontWeight: 700, fontFamily: 'Syne, sans-serif', border: 'none',
                background: `linear-gradient(155deg, #22B37C, ${ACCENT}, #0A5E3F)`, cursor: subPending ? 'default' : 'pointer',
                marginBottom: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {subPending && <span style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin .65s linear infinite' }} />}
              {subPending ? 'Opening checkout…' : 'Subscribe — ₹399/month'}
            </button>
            <button
              onClick={() => setShowSubscriptionModal(false)}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 10, fontSize: 13.5,
                fontWeight: 600, fontFamily: 'DM Sans, sans-serif', border: 'none',
                background: 'transparent', color: '#9AAAB8', cursor: 'pointer',
              }}
            >
              Maybe later
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}