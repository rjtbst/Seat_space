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
              background: s.done ? ACCENT : s.active ? ACCENT : '#E2DDD4',
              color: s.done || s.active ? '#fff' : '#9AAAB8',
              boxShadow: s.active ? `0 0 0 4px ${ACCENT_LIGHT}` : 'none',
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
              background: s.done ? ACCENT : '#E2DDD4',
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
  border: '1.5px solid #E2DDD4', borderRadius: 10,
  fontSize: 14, color: '#0A0D12', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', background: '#FDFCF9',
  boxSizing: 'border-box', transition: 'border-color .15s, box-shadow .15s',
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
    e.target.style.borderColor = ACCENT
    e.target.style.boxShadow   = `0 0 0 3px ${ACCENT_LIGHT}`
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#E2DDD4'
    e.target.style.boxShadow   = 'none'
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
      background: 'linear-gradient(135deg,#F4F7FB 0%,#EDE8DC 100%)',
      fontFamily: 'DM Sans, sans-serif', padding: '24px 16px', position: 'relative',
    }}>
      {/* Blobs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 500, height: 500, top: -150, right: -100, borderRadius: '50%', background: 'radial-gradient(circle,rgba(5,151,167,.05),transparent 70%)' }} />
        <div style={{ position: 'absolute', width: 400, height: 400, bottom: -100, left: -80, borderRadius: '50%', background: 'radial-gradient(circle,rgba(18,70,255,.04),transparent 70%)' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 480, position: 'relative', zIndex: 1 }}>
        <Steps />

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: '0 4px 18px rgba(5,151,167,.3)', fontSize: 24,
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
        <div style={{
          background: ACCENT_LIGHT, border: `1px solid rgba(5,151,167,.25)`,
          borderRadius: 12, padding: '12px 14px', marginBottom: 20,
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
          background: '#FDFCF9', border: '1px solid #E2DDD4',
          borderRadius: 20, padding: '28px 28px 24px',
          boxShadow: '0 4px 28px rgba(10,13,18,.08)',
        }}>
          <form onSubmit={handleSubmit}>

            {/* Phone — read-only if OTP-verified, editable +91 input if signed in via Google */}
            <Field label="Phone number" required>
              {!phoneLoaded ? (
                <div style={{
                  padding: '11px 13px', borderRadius: 10,
                  border: '1.5px solid #E2DDD4', background: '#F3F6F5',
                  fontSize: 14, color: '#9AAAB8',
                }}>
                  Loading…
                </div>
              ) : hasVerifiedPhone ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, padding: '11px 13px', borderRadius: 10,
                  border: '1.5px solid #E2DDD4', background: '#F3F6F5',
                }}>
                  <span style={{ fontSize: 14, color: '#3A4A5C', fontWeight: 500 }}>
                    {formatPhone(phone)}
                  </span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: '#E2F5EE', color: '#065F46', flexShrink: 0,
                  }}>
                    Verified ✓
                  </span>
                </div>
              ) : (
                <>
                  <div style={{
                    display: 'flex', alignItems: 'stretch',
                    border: `1.5px solid ${phoneFocused ? ACCENT : '#E2DDD4'}`,
                    boxShadow: phoneFocused ? `0 0 0 3px ${ACCENT_LIGHT}` : 'none',
                    borderRadius: 10, overflow: 'hidden', background: '#FDFCF9',
                    transition: 'border-color .15s, box-shadow .15s',
                  }}>
                    <span style={{
                      display: 'flex', alignItems: 'center',
                      padding: '0 12px', background: '#F3F6F5',
                      borderRight: '1.5px solid #E2DDD4',
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
                        background: 'transparent',
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
                      style={{
                        border: `1.5px solid ${lib.assigned ? '#1E5CFF' : '#E2DDD4'}`,
                        borderRadius: 9, padding: '10px 14px',
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: lib.assigned ? '#E8EFFE' : '#FDFCF9',
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
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                          background: '#E2F5EE', color: '#065F46',
                        }}>
                          Assigned ✓
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                          background: '#EEF2F8', color: '#6E7F94', border: '1px solid #E4EAF2',
                        }}>
                          Not assigned
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ height: 1, background: '#E2DDD4', margin: '20px 0' }} />

            {error && (
              <div style={{
                background: '#FDEAEA', border: '1px solid rgba(212,43,43,.2)',
                borderRadius: 10, padding: '10px 14px', marginBottom: 16,
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
                width: '100%', padding: '13px 0', borderRadius: 10, fontSize: 15,
                fontWeight: 700, fontFamily: 'Syne, sans-serif', border: 'none',
                background: ACCENT, color: '#fff',
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.85 : 1,
                boxShadow: '0 4px 16px rgba(5,151,167,.28)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all .2s',
              }}
              onMouseEnter={e => { if (!isPending) e.currentTarget.style.background = ACCENT_DARK }}
              onMouseLeave={e => { if (!isPending) e.currentTarget.style.background = ACCENT }}
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