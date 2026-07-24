// src/components/auth/LoginClient.tsx
'use client'

import { useState, useTransition, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  requestPasswordReset,
} from '@/lib/actions/auth'
import { parsePreselectedRole } from '@/lib/auth/state'
import Image from 'next/image'

// ── Shared helpers ───────────────────────────────────────────────────────────
// function Logo() {
//   return (
//     <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 40 }}>
//       <Image
//             src="/logo.png"
//             alt="Seatspace Logo"
//             width={70}
//             height={70}
//             className="transition-transform duration-200 group-hover:scale-105"
//             priority
//           />
//       <span style={{ fontSize: 22, fontFamily: 'Instrument Serif, serif', color: '#0A0D12' }}>
//         <span style={{ color: '#1246FF', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>SeatSpace</span>
//       </span>
//     </Link>
//   )
// }

function Spinner({ color = '#fff' }: { color?: string }) {
  return (
    <span style={{ width: 16, height: 16, border: `2px solid ${color}40`, borderTopColor: color, borderRadius: '50%', display: 'inline-block', animation: 'spin .65s linear infinite', flexShrink: 0 }} />
  )
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{ background: '#FDEAEA', border: '1px solid rgba(212,43,43,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ flexShrink: 0 }}>⚠️</span>
      <p style={{ fontSize: 13, color: '#9B1C1C', margin: 0, lineHeight: 1.4 }}>{msg}</p>
    </div>
  )
}

function InfoBanner({ msg }: { msg: string }) {
  return (
    <div style={{ background: '#E8F8EF', border: '1px solid rgba(13,124,84,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ flexShrink: 0 }}>✓</span>
      <p style={{ fontSize: 13, color: '#0D7C54', margin: 0, lineHeight: 1.4 }}>{msg}</p>
    </div>
  )
}

// ── Main content ─────────────────────────────────────────────────────────────
type EmailMode = 'signin' | 'signup' | 'forgot'

function LoginContent() {
  const params     = useSearchParams()
  const router     = useRouter()
  const isSignup   = params.get('mode') === 'signup'
  // Validated once here (never trust the raw query value past this point) --
  // this is the single value threaded through Google OAuth and email signup
  // so the role picked on the landing page is remembered instead of being
  // re-asked on /onboarding/role.
  const preselectedRole = parsePreselectedRole(params.get('role'))
  const isOwner    = preselectedRole === 'owner'
  const redirectTo = params.get('redirect') ?? undefined

  const [tab, setTab] = useState<'google' | 'email'>('google')
  const [emailMode, setEmailMode] = useState<EmailMode>(isSignup ? 'signup' : 'signin')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [errMsg,   setErrMsg]   = useState('')
  const [infoMsg,  setInfoMsg]  = useState('')
  const [isPending, start]      = useTransition()

  const resetMessages = () => { setErrMsg(''); setInfoMsg('') }

  // Google
  const handleGoogle = () => {
    resetMessages()
    start(async () => {
      const res = await signInWithGoogle(redirectTo, preselectedRole ?? undefined)
      if (!res.success) {
        setErrMsg(res.error)
        return
      }
      window.location.href = res.data.url
    })
  }

  const handleEmailSignIn = (e: React.FormEvent) => {
    e.preventDefault()
    resetMessages()
    start(async () => {
      const res = await signInWithEmail(email, password)
      if (!res.success) {
        setErrMsg(res.error)
        return
      }
      router.push(redirectTo && redirectTo.startsWith('/') ? redirectTo : res.data.redirectTo)
      router.refresh()
    })
  }

  const handleEmailSignUp = (e: React.FormEvent) => {
    e.preventDefault()
    resetMessages()
    start(async () => {
      const res = await signUpWithEmail(email, password, preselectedRole ?? undefined)
      if (!res.success) {
        setErrMsg(res.error)
        return
      }
      if (res.data.needsEmailConfirmation) {
        setInfoMsg(`We've sent a confirmation link to ${email}. Click it to finish signing up.`)
        return
      }
      // Confirmation disabled in this Supabase project's config -- session
      // is already active. If a role was picked on the landing page it's
      // already been saved server-side, so redirectTo skips straight past
      // /onboarding/role to the profile step; otherwise it falls back to
      // role selection.
      router.push(res.data.redirectTo)
      router.refresh()
    })
  }

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault()
    resetMessages()
    start(async () => {
      const res = await requestPasswordReset(email)
      if (!res.success) {
        setErrMsg(res.error)
        return
      }
      setInfoMsg(`If an account exists for ${email}, a password reset link has been sent.`)
    })
  }

  const switchTab = (t: 'google' | 'email') => {
    setTab(t); resetMessages()
  }

  const primaryBtn: React.CSSProperties = {
    width: '100%', padding: '14px 0', borderRadius: 10, fontSize: 15, fontWeight: 700,
    fontFamily: 'Syne, sans-serif', border: 'none', cursor: 'pointer',
    background: '#1246FF', color: '#fff', boxShadow: '0 4px 16px rgba(18,70,255,.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .15s',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', border: '1.5px solid #E2DDD4', borderRadius: 10,
    fontSize: 15, color: '#0A0D12', outline: 'none', fontFamily: 'DM Sans, sans-serif',
    background: '#FDFCF9', boxSizing: 'border-box', marginBottom: 14,
  }

  const canSubmitEmail = email.includes('@') && password.length >= 8

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#F4F7FB 0%,#EDE8DC 100%)', fontFamily: 'DM Sans, sans-serif', padding: '24px 16px', position: 'relative' }}>
      {/* Decorative blobs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 500, height: 500, top: -150, right: -100, borderRadius: '50%', background: 'radial-gradient(circle,rgba(18,70,255,.07),transparent 70%)' }} />
        <div style={{ position: 'absolute', width: 400, height: 400, bottom: -100, left: -80, borderRadius: '50%', background: 'radial-gradient(circle,rgba(13,124,84,.05),transparent 70%)' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* <Logo /> */}

        <div style={{ background: '#FDFCF9', border: '1px solid #E2DDD4', borderRadius: 20, padding: '36px 32px', boxShadow: '0 4px 32px rgba(10,13,18,.08)' }}>
          {/* Heading */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 26, color: '#0A0D12', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 8 }}>
              {isSignup ? (isOwner ? '📚 List your library' : '🎓 Start studying smarter') : '👋 Welcome back'}
            </h1>
            <p style={{ fontSize: 14, color: '#6B7689', fontWeight: 300, lineHeight: 1.5, margin: 0 }}>
              {isSignup
                ? (isOwner ? 'Create your owner account in 60 seconds.' : 'Book your study seat in 60 seconds.')
                : 'Sign in to your seatspace account.'}
            </p>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, background: '#F4F7FB', borderRadius: 12, padding: 4, marginBottom: 24 }}>
            {(['google', 'email'] as const).map(t => (
              <button key={t} onClick={() => switchTab(t)}
                style={{ flex: 1, padding: '9px 0', borderRadius: 9, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all .15s', background: tab === t ? '#FDFCF9' : 'transparent', color: tab === t ? '#0A0D12' : '#9AAAB8', boxShadow: tab === t ? '0 1px 6px rgba(10,13,18,.09)' : 'none', fontFamily: 'DM Sans, sans-serif' }}>
                {t === 'google' ? '🌐  Google' : '✉️  Email'}
              </button>
            ))}
          </div>

          {errMsg && <ErrorBanner msg={errMsg} />}
          {infoMsg && <InfoBanner msg={infoMsg} />}

          {/* ── Google ── */}
          {tab === 'google' && (
            <div>
              <button onClick={handleGoogle} disabled={isPending}
                style={{ ...primaryBtn, background: isPending ? '#F4F7FB' : '#fff', color: '#0A0D12', boxShadow: 'none', border: '1.5px solid #E2DDD4', cursor: isPending ? 'wait' : 'pointer' }}
                onMouseEnter={e => { if (!isPending) e.currentTarget.style.background = '#F4F7FB' }}
                onMouseLeave={e => { if (!isPending) e.currentTarget.style.background = '#fff' }}
              >
                {isPending ? <Spinner color="#1246FF" /> : (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908C16.658 14.075 17.64 11.767 17.64 9.2z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                  </svg>
                )}
                {isPending ? 'Redirecting...' : 'Continue with Google'}
              </button>
              <div style={{ margin: '18px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: '#E2DDD4' }} />
                <span style={{ fontSize: 12, color: '#9AAAB8', whiteSpace: 'nowrap' }}>or use email</span>
                <div style={{ flex: 1, height: 1, background: '#E2DDD4' }} />
              </div>
              <button onClick={() => switchTab('email')}
                style={{ width: '100%', padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 600, background: 'transparent', color: '#1246FF', border: '1.5px solid rgba(18,70,255,.25)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'background .15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#E8EFFE')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                Use email instead →
              </button>
            </div>
          )}

          {/* ── Email: sign in ── */}
          {tab === 'email' && emailMode === 'signin' && (
            <form onSubmit={handleEmailSignIn}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6 }}>Email</label>
              <input type="email" autoFocus placeholder="you@example.com" value={email}
                onChange={e => { resetMessages(); setEmail(e.target.value) }} style={inputStyle} />
              <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6 }}>Password</label>
              <input type="password" placeholder="••••••••" value={password}
                onChange={e => { resetMessages(); setPassword(e.target.value) }} style={inputStyle} />
              <button type="button" onClick={() => { setEmailMode('forgot'); resetMessages() }}
                style={{ background: 'none', border: 'none', color: '#1246FF', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 16, display: 'block' }}>
                Forgot password?
              </button>
              <button type="submit" disabled={isPending || !canSubmitEmail}
                style={{ ...primaryBtn, opacity: canSubmitEmail ? 1 : 0.5, cursor: canSubmitEmail ? 'pointer' : 'not-allowed' }}>
                {isPending ? <Spinner /> : null}
                {isPending ? 'Signing in...' : 'Sign in →'}
              </button>
              <p style={{ textAlign: 'center', fontSize: 13, color: '#6B7689', marginTop: 16 }}>
                Don&apos;t have an account?{' '}
                <button type="button" onClick={() => { setEmailMode('signup'); resetMessages() }}
                  style={{ background: 'none', border: 'none', color: '#1246FF', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 13 }}>
                  Sign up
                </button>
              </p>
            </form>
          )}

          {/* ── Email: sign up ── */}
          {tab === 'email' && emailMode === 'signup' && (
            <form onSubmit={handleEmailSignUp}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6 }}>Email</label>
              <input type="email" autoFocus placeholder="you@example.com" value={email}
                onChange={e => { resetMessages(); setEmail(e.target.value) }} style={inputStyle} />
              <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6 }}>Password</label>
              <input type="password" placeholder="At least 8 characters" value={password}
                onChange={e => { resetMessages(); setPassword(e.target.value) }} style={inputStyle} />
              <button type="submit" disabled={isPending || !canSubmitEmail}
                style={{ ...primaryBtn, opacity: canSubmitEmail ? 1 : 0.5, cursor: canSubmitEmail ? 'pointer' : 'not-allowed', marginTop: 2 }}>
                {isPending ? <Spinner /> : null}
                {isPending ? 'Creating account...' : 'Create account →'}
              </button>
              <p style={{ textAlign: 'center', fontSize: 13, color: '#6B7689', marginTop: 16 }}>
                Already have an account?{' '}
                <button type="button" onClick={() => { setEmailMode('signin'); resetMessages() }}
                  style={{ background: 'none', border: 'none', color: '#1246FF', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 13 }}>
                  Sign in
                </button>
              </p>
            </form>
          )}

          {/* ── Email: forgot password ── */}
          {tab === 'email' && emailMode === 'forgot' && (
            <form onSubmit={handleForgotPassword}>
              <p style={{ fontSize: 13, color: '#6B7689', marginBottom: 14, lineHeight: 1.5 }}>
                Enter the email on your account and we&apos;ll send a link to reset your password.
              </p>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6 }}>Email</label>
              <input type="email" autoFocus placeholder="you@example.com" value={email}
                onChange={e => { resetMessages(); setEmail(e.target.value) }} style={inputStyle} />
              <button type="submit" disabled={isPending || !email.includes('@')}
                style={{ ...primaryBtn, opacity: email.includes('@') ? 1 : 0.5, cursor: email.includes('@') ? 'pointer' : 'not-allowed' }}>
                {isPending ? <Spinner /> : null}
                {isPending ? 'Sending...' : 'Send reset link →'}
              </button>
              <button type="button" onClick={() => { setEmailMode('signin'); resetMessages() }}
                style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', color: '#6B7689', fontSize: 13, cursor: 'pointer', padding: 0 }}>
                ← Back to sign in
              </button>
            </form>
          )}

          <p style={{ textAlign: 'center', fontSize: 11, color: '#9AAAB8', marginTop: 20, lineHeight: 1.6 }}>
            By continuing you agree to our{' '}
            <Link href="/terms" style={{ color: '#6B7689', textDecoration: 'underline' }}>Terms</Link>
            {' & '}
            <Link href="/privacy" style={{ color: '#6B7689', textDecoration: 'underline' }}>Privacy Policy</Link>
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function LoginClient() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F7FB' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #E2DDD4', borderTopColor: '#1246FF', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
