// src/components/staff/StaffProfileClient.tsx
'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getProfile } from '@/lib/actions/auth'
import { setupStaffProfile, getStaffAssignedLibraries } from '@/lib/actions/staff'

const ACCENT       = '#0597A7'
const ACCENT_LIGHT = '#E0F6F8'
const ACCENT_DARK  = '#04728F'

function Steps() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 32 }}>
      {[
        { label: 'Phone',   done: true },
        { label: 'OTP',     done: true },
        { label: 'Profile', done: false, active: true },
        { label: 'Ready',   done: false },
      ].map((s, i, arr) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
              background: s.done || s.active ? ACCENT : 'var(--clay-surface)',
              color: s.done || s.active ? '#fff' : '#9AAAB8',
              boxShadow: s.done || s.active
                ? '2px 2px 6px rgba(5,151,167,.35), -1px -1px 4px rgba(255,255,255,.4)'
                : 'inset 2px 2px 5px rgba(163,177,198,.35), inset -1px -1px 3px rgba(255,255,255,.6)',
              transition: 'all .2s',
            }}>
              {s.done ? '✓' : i + 1}
            </div>
            <span style={{
              fontSize: 10, fontWeight: s.active ? 700 : 500,
              color: s.active ? ACCENT : s.done ? '#3A4A5C' : '#9AAAB8',
              letterSpacing: '.02em',
            }}>
              {s.label}
            </span>
          </div>
          {i < arr.length - 1 && (
            <div style={{
              width: 40, height: 2,
              background: s.done ? ACCENT : '#DDE3EC',
              margin: '0 4px', marginBottom: 18, transition: 'background .3s',
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

type AssignedLibrary = {
  id: string
  name: string
  area: string
  city: string
  assigned: boolean
}

export default function StaffProfileClient() {
  const router = useRouter()
  const [firstName,  setFirstName]  = useState('')
  const [lastName,   setLastName]   = useState('')
  const [email,      setEmail]      = useState('')
  const [phone,      setPhone]      = useState('')       // full E.164, only set when OTP-verified
  const [phoneLocal, setPhoneLocal] = useState('')        // 10-digit part user types (Google sign-in path)
  const [phoneFocused, setPhoneFocused] = useState(false)
  const [hasVerifiedPhone, setHasVerifiedPhone] = useState(false)
  const [phoneLoaded, setPhoneLoaded] = useState(false)
  const [error,      setError]      = useState('')
  const [libraries,  setLibraries]  = useState<AssignedLibrary[]>([])
  const [isPending,  startTransition] = useTransition()

  useEffect(() => {
    getStaffAssignedLibraries().then(libs => {
      if (libs) setLibraries(libs)
    })
    getProfile().then(profile => {
      if (profile?.phone) {
        setPhone(profile.phone)
        setHasVerifiedPhone(true)
      }
      setPhoneLoaded(true)
    })
  }, [])

  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.boxShadow = `inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6), 0 0 0 3px ${ACCENT_LIGHT}`
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.boxShadow = 'inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6)'
  }

  const formatPhone = (p: string) =>
    p.replace(/^(\+91)?(\d{5})(\d{5})$/, '+91 $2 $3')

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10)
    setPhoneLocal(digitsOnly)
    if (error) setError('') // clear stale error as soon as they start correcting it
  }

  // Live hint under the phone field — only once they've typed something
  const phoneHint =
    hasVerifiedPhone || phoneLocal.length === 0
      ? null
      : phoneLocal.length < 10
      ? `${10 - phoneLocal.length} more digit${10 - phoneLocal.length === 1 ? '' : 's'} needed`
      : !/^[6-9]/.test(phoneLocal)
      ? 'Mobile numbers start with 6, 7, 8, or 9'
      : null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!firstName.trim()) {
      setError('Please enter your first name')
      return
    }

    let fullPhone = phone
    if (!hasVerifiedPhone) {
      if (phoneLocal.length !== 10) {
        setError('Please enter your full 10-digit mobile number')
        return
      }
      if (!/^[6-9]/.test(phoneLocal)) {
        setError('Mobile number should start with 6, 7, 8, or 9')
        return
      }
      fullPhone = `+91${phoneLocal}`
    }

    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
    startTransition(async () => {
      const res = await setupStaffProfile({
        fullName,
        phone: fullPhone,
        ...(email ? { email } : {}),
      })
      if (res.success === false) {
        setError(res.error)
        return
      }
      router.push(res.data.redirectTo)
    })
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--clay-bg)',
      fontFamily: 'DM Sans, sans-serif', padding: '24px 16px', position: 'relative',
    }}>
      <div style={{ width: '100%', maxWidth: 480, position: 'relative', zIndex: 1 }}>
        <Steps />

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16, background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: '4px 4px 12px rgba(5,151,167,.35), -3px -3px 8px rgba(255,255,255,.5)', fontSize: 24,
          }}>
            🔑
          </div>
          <h1 style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 26,
            color: '#0A0D12', letterSpacing: '-0.04em', marginBottom: 6,
          }}>
            Staff Setup
          </h1>
          <p style={{ fontSize: 14, color: '#6B7689', fontWeight: 300, lineHeight: 1.5, margin: 0 }}>
            Complete your profile to start working
          </p>
        </div>

        {/* Info banner */}
        <div className="clay-raised-sm" style={{
          background: ACCENT_LIGHT, border: 'none',
          padding: '12px 14px', marginBottom: 20,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>📨</span>
          <p style={{ fontSize: 13, color: '#0A5F6B', margin: 0, lineHeight: 1.5 }}>
            Your library owner will assign you to their library once your profile is complete.
            Share your registered phone number with them to get linked.
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--clay-surface)', border: 'none',
          borderRadius: 22, padding: '28px 28px 24px',
          boxShadow: '8px 8px 20px rgba(163,177,198,.35), -6px -6px 16px rgba(255,255,255,.7)',
        }}>
          <form onSubmit={handleSubmit}>

            {/* Phone — read-only if OTP-verified, editable +91 input if signed in via Google */}
            <Field label="Phone number" required>
              {!phoneLoaded ? (
                <div className="clay-pressed" style={{
                  padding: '11px 13px',
                  fontSize: 14, color: '#9AAAB8',
                }}>
                  Loading…
                </div>
              ) : hasVerifiedPhone ? (
                <div className="clay-pressed" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, padding: '11px 13px',
                }}>
                  <span style={{ fontSize: 14, color: '#3A4A5C', fontWeight: 500 }}>
                    {formatPhone(phone)}
                  </span>
                  <span className="dash-badge" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    background: '#E2F5EE', color: '#065F46', flexShrink: 0,
                  }}>
                    Verified ✓
                  </span>
                </div>
              ) : (
                <>
                  <div className="clay-input" style={{
                    display: 'flex', alignItems: 'stretch',
                    boxShadow: phoneFocused
                      ? `inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6), 0 0 0 3px ${ACCENT_LIGHT}`
                      : 'inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6)',
                    overflow: 'hidden', background: 'var(--clay-surface)',
                    transition: 'box-shadow .15s', padding: 0,
                  }}>
                    <span style={{
                      display: 'flex', alignItems: 'center',
                      padding: '0 12px',
                      boxShadow: 'inset -1px 0 0 rgba(163,177,198,.3)',
                      fontSize: 14, fontWeight: 600, color: '#3A4A5C',
                    }}>
                      +91
                    </span>
                    <input
                      type="tel" inputMode="numeric" autoComplete="tel-national"
                      placeholder="9876543210"
                      value={phoneLocal}
                      maxLength={10}
                      onChange={handlePhoneChange}
                      onFocus={() => setPhoneFocused(true)}
                      onBlur={() => setPhoneFocused(false)}
                      style={{
                        ...inpBase, border: 'none', borderRadius: 0, flex: 1,
                        background: 'transparent', boxShadow: 'none',
                      }}
                    />
                  </div>
                  <p style={{
                    fontSize: 11.5, margin: '6px 0 0', lineHeight: 1.4,
                    color: phoneHint ? '#B45309' : '#6B7689',
                  }}>
                    {phoneHint ?? "We couldn't find a phone number on your account — add one so library owners can find and link you."}
                  </p>
                </>
              )}
            </Field>

            {/* Name row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <Field label="First name" required>
                <input
                  type="text" autoFocus autoComplete="given-name"
                  placeholder="Mohit"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  style={inpBase} onFocus={onFocus} onBlur={onBlur}
                />
              </Field>
              <Field label="Last name">
                <input
                  type="text" autoComplete="family-name"
                  placeholder="Verma"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  style={inpBase} onFocus={onFocus} onBlur={onBlur}
                />
              </Field>
            </div>

            <Field label="Email" optional>
              <input
                type="email" autoComplete="email"
                placeholder="mohit@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inpBase} onFocus={onFocus} onBlur={onBlur}
              />
            </Field>

            {/* Assigned Libraries */}
            {libraries.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 8, letterSpacing: '.01em' }}>
                  Assigned Libraries
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {libraries.map(lib => (
                    <div
                      key={lib.id}
                      className={lib.assigned ? 'clay-pressed' : 'clay-raised-sm'}
                      style={{
                        padding: '10px 14px',
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: lib.assigned ? '#E8EFFE' : undefined,
                      }}
                    >
                      <span style={{ fontSize: 16 }}>📚</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: lib.assigned ? 600 : 500, color: lib.assigned ? '#1447D4' : '#3A4A5C' }}>
                          {lib.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#6B7689' }}>
                          {lib.area}, {lib.city}
                        </div>
                      </div>
                      {lib.assigned ? (
                        <span className="dash-badge" style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          background: '#E2F5EE', color: '#065F46',
                        }}>
                          Assigned ✓
                        </span>
                      ) : (
                        <span className="dash-badge" style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          background: '#EEF2F8', color: '#6E7F94',
                        }}>
                          Not assigned
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ height: 1, boxShadow: 'inset 0 -1px 0 rgba(163,177,198,.3)', margin: '20px 0' }} />

            {error && (
              <div className="clay-raised-sm" style={{
                background: '#FDEAEA', border: 'none',
                padding: '10px 14px', marginBottom: 16,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <span style={{ flexShrink: 0 }}>⚠️</span>
                <p style={{ fontSize: 13, color: '#9B1C1C', margin: 0, lineHeight: 1.4 }}>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 14, fontSize: 15,
                fontWeight: 700, fontFamily: 'Syne, sans-serif', border: 'none',
                background: `linear-gradient(155deg, #22D9EA, ${ACCENT}, ${ACCENT_DARK})`, color: '#fff',
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.85 : 1,
                boxShadow: '4px 4px 12px rgba(5,151,167,.35), -3px -3px 8px rgba(255,255,255,.4), inset 0 1px 1px rgba(255,255,255,.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'transform .15s, box-shadow .15s',
              }}
            >
              {isPending && (
                <span style={{
                  width: 15, height: 15, border: '2px solid rgba(255,255,255,.35)',
                  borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block',
                  animation: 'spin .65s linear infinite', flexShrink: 0,
                }} />
              )}
              {isPending ? 'Setting up your account...' : 'Start Working →'}
            </button>

          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: '#9AAAB8', lineHeight: 1.6 }}>
          You can update your profile anytime from settings.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}