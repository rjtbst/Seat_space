// src/app/(auth)/onboarding/role/page.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setRole } from '@/lib/actions/auth'
import type { Enums } from '@/lib/supabase/types'

type UserRole = Enums<'user_role'>
const ROLES: { id: UserRole; emoji: string; title: string; subtitle: string; accent: string; bg: string; features: string[] }[] = [
  { id: 'student', emoji: '🎓', title: 'Student', subtitle: 'Find study libraries, book seats, borrow books', accent: '#1246FF', bg: '#E8EFFE', features: ['Discover libraries on map','Live seat availability', 'Instant booking', 'Book lending', 'Membership plans'] },
  { id: 'owner',   emoji: '🏛️', title: 'Library Owner', subtitle: 'Register libraries, manage staff, track revenue', accent: '#0D7C54', bg: '#D1FAE5', features: ['Online bookings', 'Revenue dashboard', 'Staff management', 'Analytics'] },
  { id: 'staff',   emoji: '🔑', title: 'Library Staff', subtitle: 'Manage daily check-ins and book issuance.', accent: '#C8A84B', bg: '#FEF3E2', features: ['QR scanner', "Today's bookings", 'Book issuance', 'Walk-in desk'] },
]

export default function RolePage() {
  const router = useRouter()
  const [selected, setSelected] = useState<UserRole | null>(null)
  const [errMsg,   setErrMsg]   = useState('')
  const [isPending, start]      = useTransition()

 const handleContinue = () => {
  if (!selected) return

  setErrMsg('')

  start(async () => {
    const res = await setRole(selected)
    console.log('setRole result:', res)
    if (res.success === false) {
      setErrMsg(res.error)
      return
    }

    const { data } = res
    router.push(data.redirectTo)
  })
}

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#F4F7FB,#EDE8DC)', fontFamily: 'DM Sans, sans-serif', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 680 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#1246FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 4px 16px rgba(18,70,255,.3)' }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="7" rx="1.5" fill="white" fillOpacity="0.9"/>
              <rect x="9" y="2" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.6"/>
              <rect x="2" y="11" width="12" height="3" rx="1.5" fill="white" fillOpacity="0.4"/>
            </svg>
          </div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 28, color: '#0A0D12', letterSpacing: '-0.04em', marginBottom: 8 }}>What brings you here?</h1>
          <p style={{ fontSize: 15, color: '#6B7689', fontWeight: 300 }}>Pick your role — you can change this later in settings.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          {ROLES.map(r => (
            <button key={r.id} onClick={() => setSelected(r.id)}
              style={{ background: selected === r.id ? `${r.accent}12` : '#FDFCF9', border: `2px solid ${selected === r.id ? r.accent : '#E2DDD4'}`, borderRadius: 16, padding: '20px 16px', cursor: 'pointer', textAlign: 'left', transition: 'all .15s', fontFamily: 'DM Sans, sans-serif', boxShadow: selected === r.id ? `0 0 0 4px ${r.accent}18` : 'none' }}
              onMouseEnter={e => { if (selected !== r.id) e.currentTarget.style.borderColor = `${r.accent}60` }}
              onMouseLeave={e => { if (selected !== r.id) e.currentTarget.style.borderColor = '#E2DDD4' }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: r.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 12 }}>{r.emoji}</div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: '#0A0D12', marginBottom: 6, letterSpacing: '-0.02em' }}>{r.title}</div>
              <p style={{ fontSize: 12, color: '#6B7689', lineHeight: 1.5, marginBottom: 12, fontWeight: 300 }}>{r.subtitle}</p>
              {r.features.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6B7689', marginBottom: 3 }}>
                  <span style={{ color: r.accent, fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
                </div>
              ))}
              {selected === r.id && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: r.accent }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: r.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: 9 }}>✓</span>
                  </div>
                  Selected
                </div>
              )}
            </button>
          ))}
        </div>

        {errMsg && (
          <div style={{ background: '#FDEAEA', border: '1px solid rgba(212,43,43,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#9B1C1C', display: 'flex', gap: 8 }}>
            <span>⚠️</span>{errMsg}
          </div>
        )}

        <button onClick={handleContinue} disabled={!selected || isPending}
          style={{ width: '100%', padding: '15px 0', borderRadius: 12, fontSize: 16, fontWeight: 700, fontFamily: 'Syne, sans-serif', border: 'none', cursor: selected ? 'pointer' : 'not-allowed', background: selected ? '#1246FF' : '#9AAAB8', color: '#fff', boxShadow: selected ? '0 4px 20px rgba(18,70,255,.3)' : 'none', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {isPending && <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin .65s linear infinite' }} />}
          {isPending ? 'Saving...' : selected ? `Continue as ${ROLES.find(r => r.id === selected)?.title} →` : 'Select your role to continue'}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}