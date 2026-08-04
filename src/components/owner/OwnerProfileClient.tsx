// src/components/owner/OwnerProfileClient.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile } from '@/lib/actions/auth'
import { STATE_CITY_MAP } from '@/lib/config'
import { ENABLE_WHATSAPP_CLIENT } from '@/lib/feature-flags'

const ACCENT       = '#0D7C54'
const ACCENT_LIGHT = '#D1FAE5'
const ACCENT_DARK  = '#0A5E3F'

// Real onboarding gate is 3 steps: Role -> Profile -> WhatsApp (see
// src/lib/auth/state.ts). Library setup (add-library/photos/go-live)
// happens AFTER onboarding completes, as an owner-initiated dashboard
// action, not a numbered onboarding step -- this used to show a stale
// "Phone -> OTP -> Profile -> Library -> Photos -> Go Live" sequence
// from before the Google/email + WhatsApp-verification auth refactor,
// which no longer describes how sign-up actually works.
function Steps() {
  const steps = ENABLE_WHATSAPP_CLIENT
    ? [
        { label: 'Role',     done: true },
        { label: 'Profile',  done: false, active: true },
        { label: 'WhatsApp', done: false },
      ]
    : [
        { label: 'Role',     done: true },
        { label: 'Profile',  done: false, active: true },
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
              transition: 'all .2s',
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
            <div style={{
              width: 28, height: 2,
              background: s.done ? ACCENT : '#E2DDD4',
              margin: '0 3px', marginBottom: 18, transition: 'background .3s',
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

const inpBase: React.CSSProperties = {
  width: '100%', padding: '11px 13px',
  border: 'none', borderRadius: 12,
  fontSize: 14, color: '#0A0D12', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', background: 'var(--clay-surface)',
  boxSizing: 'border-box', boxShadow: 'inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6)',
  transition: 'box-shadow .15s',
  appearance: 'none' as const,
}

function Field({
  label, required, optional, children,
}: { label: string; required?: boolean; optional?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6, letterSpacing: '.01em' }}>
        {label}
        {required && <span style={{ color: ACCENT, marginLeft: 2 }}>*</span>}
        {optional && <span style={{ color: '#9AAAB8', fontWeight: 400, marginLeft: 4 }}>(optional)</span>}
      </label>
      {children}
    </div>
  )
}

export default function OwnerProfileClient() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [phone,     setPhone]     = useState('')
  const [state,     setState]     = useState('')
  const [city,      setCity]      = useState('')
  const [error,     setError]     = useState('')
  const [isPending, startTransition] = useTransition()

  const valid = firstName.trim().length >= 1 && !!state && !!city

  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.boxShadow = `inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6), 0 0 0 3px ${ACCENT_LIGHT}`
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.boxShadow = 'inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6)'
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const full_name = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
    startTransition(async () => {
      const res = await updateProfile({
        full_name,
        state,
        city,
        ...(phone ? { phone: `+91${phone}` } : {}),
      })
      if (res.success === false) {
        setError(res.error)
        return
      }
      // WhatsApp verification is the next mandatory onboarding gate for
      // every role. Library setup (add-library/go-live) is still there
      // once onboarding completes -- it's just no longer skippable ahead
      // of WhatsApp verification. See AUTH_ONBOARDING_AUDIT.md.
      router.push('/onboarding/whatsapp')
    })
  }

  const cities = state ? (STATE_CITY_MAP[state] ?? []) : []

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,#F4F7FB 0%,#EDE8DC 100%)',
      fontFamily: 'DM Sans, sans-serif', padding: '24px 16px', position: 'relative',
    }}>
      {/* Blobs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 500, height: 500, top: -150, right: -100, borderRadius: '50%', background: 'radial-gradient(circle,rgba(13,124,84,.05),transparent 70%)' }} />
        <div style={{ position: 'absolute', width: 400, height: 400, bottom: -100, left: -80, borderRadius: '50%', background: 'radial-gradient(circle,rgba(18,70,255,.04),transparent 70%)' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 480, position: 'relative', zIndex: 1 }}>
        <Steps />

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16, background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '4px 4px 12px rgba(13,124,84,.35), -3px -3px 8px rgba(255,255,255,.5)',
            fontSize: 24,
          }}>
            🏛️
          </div>
          <h1 style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 26,
            color: '#0A0D12', letterSpacing: '-0.04em', marginBottom: 6,
          }}>
            Set up your owner profile
          </h1>
          <p style={{ fontSize: 14, color: '#6B7689', fontWeight: 300, lineHeight: 1.5, margin: 0 }}>
            {ENABLE_WHATSAPP_CLIENT
              ? "Step 2 of 3 — you'll verify a WhatsApp number next, then head to your dashboard to add your library."
              : 'Step 2 of 2 — next you\'ll head to your dashboard to add your library.'}
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--clay-surface)', border: 'none',
          borderRadius: 22, padding: '28px 28px 24px',
          boxShadow: '8px 8px 20px rgba(163,177,198,.35), -6px -6px 16px rgba(255,255,255,.7)',
        }}>
          <form onSubmit={handleSubmit}>

            {/* Name row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <Field label="First name" required>
                <input
                  type="text" autoFocus autoComplete="given-name"
                  placeholder="Rahul"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  style={inpBase} onFocus={onFocus} onBlur={onBlur}
                />
              </Field>
              <Field label="Last name">
                <input
                  type="text" autoComplete="family-name"
                  placeholder="Gupta"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  style={inpBase} onFocus={onFocus} onBlur={onBlur}
                />
              </Field>
            </div>

            <Field label="Phone number" optional>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{
                  padding: '11px 13px', background: 'var(--clay-surface)',
                  border: 'none', borderRadius: 12,
                  boxShadow: 'inset 2px 2px 5px rgba(163,177,198,.3), inset -1px -1px 4px rgba(255,255,255,.6)',
                  fontSize: 14, fontWeight: 600, color: '#3A4A5C',
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                  userSelect: 'none',
                }}>
                  🇮🇳 +91
                </div>
                <input
                  type="tel"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  style={{ ...inpBase, flex: 1 }}
                  onFocus={onFocus} onBlur={onBlur}
                />
              </div>
            </Field>

            <Field label="State" required>
              <select
                value={state}
                onChange={e => { setState(e.target.value); setCity('') }}
                style={{ ...inpBase, cursor: 'pointer' }}
                onFocus={onFocus} onBlur={onBlur}
              >
                <option value="">Select your state</option>
                {Object.keys(STATE_CITY_MAP).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>

            <Field label="City" required>
              <select
                value={city}
                onChange={e => setCity(e.target.value)}
                disabled={!state}
                style={{ ...inpBase, cursor: state ? 'pointer' : 'not-allowed', opacity: state ? 1 : 0.55 }}
                onFocus={onFocus} onBlur={onBlur}
              >
                <option value="">{state ? 'Select your city' : 'Select state first'}</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>

            {error && (
              <div style={{
                background: '#FDEAEA', border: 'none',
                borderRadius: 12, padding: '10px 14px', marginBottom: 16,
                display: 'flex', gap: 8, alignItems: 'flex-start',
                boxShadow: '2px 2px 6px rgba(212,43,43,.15), -2px -2px 5px rgba(255,255,255,.5)',
              }}>
                <span style={{ flexShrink: 0 }}>⚠️</span>
                <p style={{ fontSize: 13, color: '#9B1C1C', margin: 0, lineHeight: 1.4 }}>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!valid || isPending}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 14, fontSize: 15,
                fontWeight: 700, fontFamily: 'Syne, sans-serif', border: 'none',
                background: valid ? `linear-gradient(155deg, #22B37C, ${ACCENT}, ${ACCENT_DARK})` : '#C8D4C8',
                color: '#fff',
                cursor: valid ? 'pointer' : 'not-allowed',
                boxShadow: valid
                  ? '4px 4px 12px rgba(13,124,84,.35), -3px -3px 8px rgba(255,255,255,.4), inset 0 1px 1px rgba(255,255,255,.3)'
                  : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all .2s',
              }}
            >
              {isPending && (
                <span style={{
                  width: 15, height: 15, border: '2px solid rgba(255,255,255,.35)',
                  borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block',
                  animation: 'spin .65s linear infinite', flexShrink: 0,
                }} />
              )}
              {isPending ? 'Saving...' : ENABLE_WHATSAPP_CLIENT ? 'Continue to WhatsApp Verification →' : 'Continue →'}
            </button>

          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: '#9AAAB8', lineHeight: 1.6 }}>
          You can manage multiple libraries from your dashboard.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}