// src/components/student/StudentProfileClient.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile } from '@/lib/actions/auth'
import { STATE_CITY_MAP } from '@/lib/config'

const ACCENT       = '#1E5CFF'
const ACCENT_LIGHT = '#E8EFFE'
const ACCENT_DARK  = '#1447D4'

const EXAM_GOALS = ['UPSC', 'SSC', 'IIT JEE', 'NEET', 'CA/CS', 'Other']

function Steps() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 32 }}>
      {[
        { label: 'Phone', done: true },
        { label: 'OTP',   done: true },
        { label: 'Profile', done: false, active: true },
        { label: 'Done',  done: false },
      ].map((s, i, arr) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 11, fontWeight: 700,
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
              margin: '0 4px', marginBottom: 18,
              transition: 'background .3s',
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

const inpBase: React.CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  border: '1.5px solid #E2DDD4',
  borderRadius: 10,
  fontSize: 14,
  color: '#0A0D12',
  outline: 'none',
  fontFamily: 'DM Sans, sans-serif',
  background: '#FDFCF9',
  boxSizing: 'border-box',
  transition: 'border-color .15s, box-shadow .15s',
  appearance: 'none' as const,
}

function Field({
  label, optional, children,
}: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        fontSize: 12, fontWeight: 600, color: '#3A4A5C',
        display: 'block', marginBottom: 6, letterSpacing: '.01em',
      }}>
        {label}
        {optional && (
          <span style={{ color: '#9AAAB8', fontWeight: 400, marginLeft: 4 }}>(optional)</span>
        )}
      </label>
      {children}
    </div>
  )
}

export default function StudentProfileClient() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [state,     setState]     = useState('')
  const [city,      setCity]      = useState('')
  const [examGoal,  setExamGoal]  = useState('')
  const [error,     setError]     = useState('')
  const [isPending, startTransition] = useTransition()

  const valid = firstName.trim().length >= 1 && !!city

  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = ACCENT
    e.target.style.boxShadow   = `0 0 0 3px ${ACCENT_LIGHT}`
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = '#E2DDD4'
    e.target.style.boxShadow   = 'none'
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const full_name = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
    startTransition(async () => {
      const res = await updateProfile({
        full_name,
        state: state || city, // fallback if no state selected
        city,
        ...(email ? { email } : {}),
      })
      if (res.success === false) {
        setError(res.error)
        return
      }
      router.push(res.data.redirectTo)
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
        <div style={{ position: 'absolute', width: 500, height: 500, top: -150, right: -100, borderRadius: '50%', background: 'radial-gradient(circle,rgba(30,92,255,.05),transparent 70%)' }} />
        <div style={{ position: 'absolute', width: 400, height: 400, bottom: -100, left: -80, borderRadius: '50%', background: 'radial-gradient(circle,rgba(30,92,255,.04),transparent 70%)' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 480, position: 'relative', zIndex: 1 }}>
        <Steps />

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: '0 4px 18px rgba(30,92,255,.32)', fontSize: 24,
          }}>
            🎓
          </div>
          <h1 style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 26,
            color: '#0A0D12', letterSpacing: '-0.04em', marginBottom: 6,
          }}>
            Set up your profile
          </h1>
          <p style={{ fontSize: 14, color: '#6B7689', fontWeight: 300, lineHeight: 1.5, margin: 0 }}>
            Personalise your experience
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#FDFCF9', border: '1px solid #E2DDD4',
          borderRadius: 20, padding: '28px 28px 24px',
          boxShadow: '0 4px 28px rgba(10,13,18,.08)',
        }}>
          <form onSubmit={handleSubmit}>

            {/* Name row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <Field label="First name">
                <input
                  type="text" autoFocus autoComplete="given-name"
                  placeholder="Aarav"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  style={inpBase} onFocus={onFocus} onBlur={onBlur}
                />
              </Field>
              <Field label="Last name">
                <input
                  type="text" autoComplete="family-name"
                  placeholder="Sharma"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  style={inpBase} onFocus={onFocus} onBlur={onBlur}
                />
              </Field>
            </div>

            <Field label="Email" optional>
              <input
                type="email" autoComplete="email"
                placeholder="aarav@gmail.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inpBase} onFocus={onFocus} onBlur={onBlur}
              />
            </Field>

            <Field label="State">
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

            <Field label="City">
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

            {/* Preparing for */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 8, letterSpacing: '.01em' }}>
                Preparing for
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {EXAM_GOALS.map(goal => {
                  const selected = examGoal === goal
                  return (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => setExamGoal(selected ? '' : goal)}
                      style={{
                        padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                        border: `1.5px solid ${selected ? ACCENT : '#E2DDD4'}`,
                        background: selected ? ACCENT_LIGHT : '#FDFCF9',
                        color: selected ? ACCENT : '#6B7689',
                        transition: 'all .15s',
                      }}
                    >
                      {goal}
                    </button>
                  )
                })}
              </div>
            </div>

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
              disabled={!valid || isPending}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 10, fontSize: 15,
                fontWeight: 700, fontFamily: 'Syne, sans-serif', border: 'none',
                background: valid ? ACCENT : '#C8D4C8', color: '#fff',
                cursor: valid ? 'pointer' : 'not-allowed',
                boxShadow: valid ? '0 4px 16px rgba(30,92,255,.3)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all .2s',
              }}
              onMouseEnter={e => { if (valid) e.currentTarget.style.background = ACCENT_DARK }}
              onMouseLeave={e => { if (valid) e.currentTarget.style.background = ACCENT }}
            >
              {isPending && (
                <span style={{
                  width: 15, height: 15, border: '2px solid rgba(255,255,255,.35)',
                  borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block',
                  animation: 'spin .65s linear infinite', flexShrink: 0,
                }} />
              )}
              {isPending ? 'Setting up...' : 'Complete Setup →'}
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