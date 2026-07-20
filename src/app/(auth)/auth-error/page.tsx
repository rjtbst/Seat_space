// src/app/(auth)/auth-error/page.tsx
'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
function AuthErrorContent() {
  const params = useSearchParams()
  const error = params.get('error') ?? 'Something went wrong'

  const friendly: Record<string, string> = {
    missing_code: 'The sign-in link is invalid or has expired.',
    session_failed: 'Could not create a session. Please try again.',
    access_denied: 'You cancelled the sign-in. No problem — try again whenever you\'re ready.',
  }

  const message = friendly[error] ?? decodeURIComponent(error)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F7FB', fontFamily: 'DM Sans, sans-serif', padding: '24px' }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 40 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#1246FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="7" rx="1.5" fill="white" fillOpacity="0.9"/>
              <rect x="9" y="2" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.6"/>
              <rect x="2" y="11" width="12" height="3" rx="1.5" fill="white" fillOpacity="0.4"/>
            </svg>
          </div>
          <span style={{ fontSize: 20, fontFamily: 'Instrument Serif, serif', color: '#0A0D12' }}>
            Library<span style={{ color: '#1246FF', fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>Space</span>
          </span>
        </Link>

        <div style={{ background: '#FDFCF9', border: '1px solid #E2DDD4', borderRadius: 20, padding: '40px 32px', boxShadow: '0 4px 24px rgba(10,13,18,.08)' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: '#FDEAEA', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 24 }}>
            ⚠️
          </div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22, color: '#0A0D12', letterSpacing: '-0.04em', marginBottom: 10 }}>
            Sign-in failed
          </h1>
          <p style={{ fontSize: 14, color: '#6B7689', lineHeight: 1.6, marginBottom: 28 }}>
            {message}
          </p>
          <Link
            href="/login"
            style={{ display: 'block', padding: '13px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, background: '#1246FF', color: '#fff', fontFamily: 'Syne, sans-serif', textDecoration: 'none', boxShadow: '0 4px 16px rgba(18,70,255,.25)' }}
          >
            Try again →
          </Link>
          <Link href="/" style={{ display: 'block', marginTop: 12, fontSize: 13, color: '#9AAAB8', textDecoration: 'none' }}>
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense>
      <AuthErrorContent />
    </Suspense>
  )
}