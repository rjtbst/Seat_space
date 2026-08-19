// src/components/auth/WhatsappVerifyClient.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendWhatsappOtp, verifyWhatsappOtp } from '@/lib/actions/onboarding-whatsapp'

const ACCENT = '#1246FF'

function toE164(input: string): string {
  const trimmed = input.trim()
  if (trimmed.startsWith('+')) return `+${trimmed.slice(1).replace(/\D/g, '')}`
  const digits = trimmed.replace(/\D/g, '')
  // Default to India (+91) when no country code is given, matching the
  // rest of the app's India-first phone handling.
  return digits ? `+91${digits}` : ''
}

export default function WhatsappVerifyClient() {
  const router = useRouter()
  const [stage, setStage] = useState<'number' | 'otp'>('number')
  const [number, setNumber] = useState('')
  const [otp, setOtp] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [infoMsg, setInfoMsg] = useState('')
  const [isPending, start] = useTransition()

  const e164 = toE164(number)
  const numberValid = /^\+[1-9]\d{7,14}$/.test(e164)
  const otpValid = /^\d{6}$/.test(otp)

  const handleSend = () => {
    if (!numberValid) return
    setErrMsg('')
    start(async () => {
      const res = await sendWhatsappOtp(e164)
      if (!res.success) {
        setErrMsg(res.error)
        return
      }
      setInfoMsg(`Code sent to ${e164} on WhatsApp.`)
      setStage('otp')
    })
  }

  const handleVerify = () => {
    if (!otpValid) return
    setErrMsg('')
    start(async () => {
      const res = await verifyWhatsappOtp(e164, otp)
      if (!res.success) {
        setErrMsg(res.error)
        return
      }
      router.push(res.data.redirectTo)
    })
  }

  const handleResend = () => {
    setErrMsg('')
    setInfoMsg('')
    start(async () => {
      const res = await sendWhatsappOtp(e164)
      if (!res.success) {
        setErrMsg(res.error)
        return
      }
      setInfoMsg('A new code has been sent.')
    })
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--clay-bg)', fontFamily: 'DM Sans, sans-serif', padding: '24px 16px' }}>
      <div className="clay-raised" style={{ width: '100%', maxWidth: 440, background: 'var(--clay-surface)', padding: '36px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="clay-raised" style={{ width: 44, height: 44, borderRadius: 12, background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 22 }}>
            💬
          </div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, color: '#0A0D12', letterSpacing: '-0.04em', marginBottom: 8 }}>
            Verify your WhatsApp number
          </h1>
          <p style={{ fontSize: 14, color: '#6B7689', fontWeight: 300, lineHeight: 1.5 }}>
            We use WhatsApp for booking reminders, payment receipts, and updates from your library.
            This is required to finish setting up your account.
          </p>
        </div>

        {stage === 'number' ? (
          <>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6 }}>
              WhatsApp number
            </label>
            <input
              type="tel"
              inputMode="tel"
              placeholder="+91 98765 43210"
              value={number}
              onChange={e => setNumber(e.target.value)}
              style={{ width: '100%', padding: '13px 14px', borderRadius: 12, border: 'none', fontSize: 15, fontFamily: 'DM Sans, sans-serif', marginBottom: 20, boxSizing: 'border-box', background: 'var(--clay-surface)', outline: 'none', boxShadow: 'inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6)' }}
            />

            {errMsg && (
              <div className="clay-raised-sm" style={{ background: '#FDEAEA', border: 'none', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#9B1C1C' }}>
                ⚠️ {errMsg}
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={!numberValid || isPending}
              style={{
                width: '100%', padding: '15px 0', borderRadius: 14, fontSize: 16, fontWeight: 700,
                fontFamily: 'Syne, sans-serif', border: 'none', cursor: numberValid ? 'pointer' : 'not-allowed',
                background: numberValid ? `linear-gradient(155deg, #4D78FF, ${ACCENT}, #0D3AE0)` : '#C8D4C8', color: '#fff',
                boxShadow: numberValid ? '4px 4px 12px rgba(18,70,255,.32), -3px -3px 8px rgba(255,255,255,.4)' : 'none',
              }}
            >
              {isPending ? 'Sending…' : 'Send verification code'}
            </button>
          </>
        ) : (
          <>
            {infoMsg && (
              <div className="clay-raised-sm" style={{ background: '#E8F8EF', border: 'none', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#0D7C54' }}>
                ✓ {infoMsg}
              </div>
            )}

            <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6 }}>
              6-digit code
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ width: '100%', padding: '13px 14px', borderRadius: 12, border: 'none', fontSize: 20, letterSpacing: '0.3em', textAlign: 'center', fontFamily: 'DM Sans, sans-serif', marginBottom: 12, boxSizing: 'border-box', background: 'var(--clay-surface)', outline: 'none', boxShadow: 'inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6)' }}
            />

            <button
              onClick={handleResend}
              disabled={isPending}
              style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 20 }}
            >
              Resend code
            </button>

            {errMsg && (
              <div className="clay-raised-sm" style={{ background: '#FDEAEA', border: 'none', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#9B1C1C' }}>
                ⚠️ {errMsg}
              </div>
            )}

            <button
              onClick={handleVerify}
              disabled={!otpValid || isPending}
              style={{
                width: '100%', padding: '15px 0', borderRadius: 14, fontSize: 16, fontWeight: 700,
                fontFamily: 'Syne, sans-serif', border: 'none', cursor: otpValid ? 'pointer' : 'not-allowed',
                background: otpValid ? `linear-gradient(155deg, #4D78FF, ${ACCENT}, #0D3AE0)` : '#C8D4C8', color: '#fff',
                boxShadow: otpValid ? '4px 4px 12px rgba(18,70,255,.32), -3px -3px 8px rgba(255,255,255,.4)' : 'none',
              }}
            >
              {isPending ? 'Verifying…' : 'Verify & continue →'}
            </button>

            <button
              onClick={() => { setStage('number'); setOtp(''); setErrMsg(''); setInfoMsg('') }}
              style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', color: '#6B7689', fontSize: 13, cursor: 'pointer', padding: 0 }}
            >
              ← Use a different number
            </button>
          </>
        )}
      </div>
    </div>
  )
}
