// src/components/auth/ResetPasswordClient.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updatePassword } from '@/lib/actions/auth'

const ACCENT = '#1246FF'

export default function ResetPasswordClient() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [isPending, start] = useTransition()

  const valid = password.length >= 8 && password === confirm

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrMsg('')
    if (password !== confirm) {
      setErrMsg('Passwords do not match.')
      return
    }
    start(async () => {
      const res = await updatePassword(password)
      if (!res.success) {
        setErrMsg(res.error)
        return
      }
      router.push('/login')
    })
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#F4F7FB,#EDE8DC)', fontFamily: 'DM Sans, sans-serif', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#FDFCF9', borderRadius: 20, padding: '36px 32px', boxShadow: '0 12px 40px rgba(10,13,18,.08)' }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, color: '#0A0D12', letterSpacing: '-0.04em', marginBottom: 8, textAlign: 'center' }}>
          Set a new password
        </h1>
        <p style={{ fontSize: 14, color: '#6B7689', fontWeight: 300, textAlign: 'center', marginBottom: 24 }}>
          Choose a new password for your account.
        </p>

        <form onSubmit={handleSubmit}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6 }}>New password</label>
          <input
            type="password" autoFocus placeholder="At least 8 characters" value={password}
            onChange={e => { setErrMsg(''); setPassword(e.target.value) }}
            style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #E2DDD4', borderRadius: 10, fontSize: 15, marginBottom: 14, boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }}
          />
          <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6 }}>Confirm password</label>
          <input
            type="password" placeholder="Re-enter password" value={confirm}
            onChange={e => { setErrMsg(''); setConfirm(e.target.value) }}
            style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #E2DDD4', borderRadius: 10, fontSize: 15, marginBottom: 18, boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }}
          />

          {errMsg && (
            <div style={{ background: '#FDEAEA', border: '1px solid rgba(212,43,43,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#9B1C1C' }}>
              ⚠️ {errMsg}
            </div>
          )}

          <button
            type="submit" disabled={!valid || isPending}
            style={{ width: '100%', padding: '15px 0', borderRadius: 12, fontSize: 16, fontWeight: 700, fontFamily: 'Syne, sans-serif', border: 'none', cursor: valid ? 'pointer' : 'not-allowed', background: valid ? ACCENT : '#9AAAB8', color: '#fff' }}
          >
            {isPending ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      </div>
    </div>
  )
}
