'use client'

// src/app/(staff)/staff/request/_components/LibraryRequestClient.tsx
import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { LibrarySearchResult } from '@/lib/actions/staff'
import { searchLibraries, submitStaffRequest } from '@/lib/actions/staff'

const ACCENT       = '#0597A7'
const ACCENT_LIGHT = '#E0F6F8'
const ACCENT_DARK  = '#04728F'
const GREEN        = '#0D7C54'
const GREEN_LIGHT  = '#D1FAE5'

const inp: React.CSSProperties = {
  width: '100%', padding: '11px 13px',
  border: '1.5px solid #E2DDD4', borderRadius: 10,
  fontSize: 14, color: '#0A0D12', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', background: '#FDFCF9',
  boxSizing: 'border-box', transition: 'border-color .15s, box-shadow .15s',
}

export default function LibraryRequestClient({
  wasRejected,
  previousLibraryName,
}: {
  wasRejected:         boolean
  previousLibraryName: string | null
}) {
  const router                           = useRouter()
  const [query,    setQuery]             = useState('')
  const [results,  setResults]           = useState<LibrarySearchResult[]>([])
  const [selected, setSelected]          = useState<LibrarySearchResult | null>(null)
  const [message,  setMessage]           = useState('')
  const [error,    setError]             = useState('')
  const [searching, setSearching]        = useState(false)
  const [isPending, startTransition]     = useTransition()
  const [submitted, setSubmitted]        = useState(false)
  const debounceRef                      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRequestId                  = useRef(0)

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) { setResults([]); setSearching(false); return }

    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const requestId = ++searchRequestId.current
      const res = await searchLibraries(query)
      if (requestId !== searchRequestId.current) return
      setResults(res)
      setSearching(false)
    }, 400)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const handleSelect = (lib: LibrarySearchResult) => {
    setSelected(lib)
    setQuery(lib.name)
    setResults([])
    setError('')
  }

  const handleSubmit = () => {
    if (!selected) { setError('Select a library first'); return }
    setError('')

    startTransition(async () => {
      const res = await submitStaffRequest(selected.id, message.trim() || undefined)
      if (res.success) {
        setSubmitted(true)
      } else {
        setError((res as any).error ?? 'Failed to submit request')
      }
    })
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '24px 20px',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        <div style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: GREEN_LIGHT, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 36, margin: '0 auto 16px',
            border: '2px solid rgba(13,124,84,.2)',
          }}>
            ✓
          </div>
          <h2 style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22,
            color: '#0A0D12', marginBottom: 6, letterSpacing: '-0.03em',
          }}>
            Request Sent!
          </h2>
          <p style={{ fontSize: 14, color: '#6B7689', lineHeight: 1.6, marginBottom: 20 }}>
            Your request to join <strong style={{ color: '#0A0D12' }}>{selected?.name}</strong> has been
            sent. The owner will review it and you'll get access once approved.
          </p>
          <div style={{
            background: ACCENT_LIGHT, border: '1px solid rgba(5,151,167,.2)',
            borderRadius: 12, padding: '12px 14px', marginBottom: 20,
            fontSize: 13, color: '#0A5F6B', lineHeight: 1.6, textAlign: 'left',
          }}>
            💡 Share your registered phone number with the library owner to help them find your request quickly.
          </div>
          <button className="press"
            onClick={() => router.push('/staff')}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 10,
              border: 'none', background: ACCENT, color: '#fff',
              fontSize: 14, fontWeight: 700, fontFamily: 'Syne, sans-serif',
              cursor: 'pointer', boxShadow: '0 4px 16px rgba(5,151,167,.3)',
            }}
          >
            View Request Status →
          </button>
        </div>
      </div>
    )
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px 20px',
      fontFamily: 'DM Sans, sans-serif',
      background: 'linear-gradient(135deg,#F4F7FB,#EDE8DC)',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 24,
            boxShadow: '0 4px 18px rgba(5,151,167,.3)',
          }}>
            🔍
          </div>
          <h1 style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24,
            color: '#0A0D12', letterSpacing: '-0.04em', marginBottom: 6,
          }}>
            Find Your Library
          </h1>
          <p style={{ fontSize: 14, color: '#6B7689', lineHeight: 1.5, margin: 0 }}>
            {wasRejected
              ? `Your previous request to ${previousLibraryName} was declined. Search for a different library.`
              : 'Search for the library you want to work at and send a join request.'}
          </p>
        </div>

        {/* Rejection notice */}
        {wasRejected && (
          <div style={{
            background: '#FEE2E2', border: '1px solid rgba(220,38,38,.2)',
            borderRadius: 12, padding: '10px 14px', marginBottom: 16,
            fontSize: 13, color: '#9B1C1C', display: 'flex', gap: 8,
          }}>
            <span>ℹ️</span>
            Your previous request was not approved. You can apply to any other active library.
          </div>
        )}

        {/* Form card */}
        <div style={{
          background: '#FDFCF9', border: '1px solid #E2DDD4',
          borderRadius: 20, padding: '24px',
          boxShadow: '0 4px 28px rgba(10,13,18,.08)',
        }}>

          {/* Search field */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6 }}>
              Search library <span style={{ color: ACCENT }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setSelected(null) }}
                placeholder="Type library name, city or area…"
                style={inp}
                onFocus={e => { e.target.style.borderColor = ACCENT; e.target.style.boxShadow = `0 0 0 3px ${ACCENT_LIGHT}` }}
                onBlur={e => { e.target.style.borderColor = '#E2DDD4'; e.target.style.boxShadow = 'none' }}
                autoFocus
              />

              {/* Dropdown */}
              {(results.length > 0 || searching) && !selected && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: '#FDFCF9', border: '1.5px solid #E2DDD4',
                  borderRadius: 10, marginTop: 4,
                  boxShadow: '0 8px 24px rgba(10,13,18,.12)',
                  overflow: 'hidden',
                }}>
                  {searching ? (
                    <div style={{ padding: '12px 14px', fontSize: 13, color: '#9AAAB8', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 14, height: 14, border: `2px solid ${ACCENT_LIGHT}`,
                        borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin .65s linear infinite',
                      }} />
                      Searching…
                    </div>
                  ) : results.map(lib => (
                    <button className="press"
                      key={lib.id}
                      onMouseDown={() => handleSelect(lib)}
                      style={{
                        display: 'block', width: '100%', padding: '10px 14px',
                        textAlign: 'left', border: 'none', background: 'transparent',
                        cursor: 'pointer', borderBottom: '1px solid #F0EDE8',
                        fontFamily: 'DM Sans, sans-serif',
                        transition: 'background .1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = ACCENT_LIGHT)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0D12' }}>{lib.name}</div>
                      <div style={{ fontSize: 11, color: '#9AAAB8' }}>
                        📍 {[lib.area, lib.city].filter(Boolean).join(', ')}
                      </div>
                    </button>
                  ))}
                  {!searching && results.length === 0 && (
                    <div style={{ padding: '12px 14px', fontSize: 13, color: '#9AAAB8' }}>
                      No libraries found — try a different search
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected confirmation */}
            {selected && (
              <div style={{
                marginTop: 8, padding: '8px 12px',
                background: GREEN_LIGHT, border: '1px solid rgba(13,124,84,.2)',
                borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ color: GREEN, fontSize: 14 }}>✓</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: GREEN }}>{selected.name}</div>
                  <div style={{ fontSize: 11, color: '#6B7689' }}>{[selected.area, selected.city].filter(Boolean).join(', ')}</div>
                </div>
                <button className="press"
                  onClick={() => { setSelected(null); setQuery('') }}
                  style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: '#9AAAB8', fontSize: 16, padding: '0 4px' }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Optional message */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6 }}>
              Message to owner <span style={{ color: '#9AAAB8', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Introduce yourself — e.g. I have 2 years of library experience and am available on weekdays…"
              rows={3}
              style={{
                ...inp,
                resize: 'vertical',
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: '#FEE2E2', border: '1px solid rgba(220,38,38,.2)',
              borderRadius: 9, padding: '9px 12px', marginBottom: 14,
              fontSize: 12, color: '#9B1C1C', display: 'flex', gap: 6,
            }}>
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Submit */}
          <button className="press"
            onClick={handleSubmit}
            disabled={!selected || isPending}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 10,
              border: 'none',
              background: selected ? ACCENT : '#C0CDD9',
              color: '#fff', fontSize: 15, fontWeight: 700,
              fontFamily: 'Syne, sans-serif',
              cursor: selected ? 'pointer' : 'not-allowed',
              opacity: isPending ? 0.7 : 1,
              boxShadow: selected ? '0 4px 16px rgba(5,151,167,.28)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all .2s',
            }}
            onMouseEnter={e => { if (selected) e.currentTarget.style.background = ACCENT_DARK }}
            onMouseLeave={e => { if (selected) e.currentTarget.style.background = ACCENT }}
          >
            {isPending && (
              <span style={{
                width: 15, height: 15, border: '2px solid rgba(255,255,255,.35)',
                borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block',
                animation: 'spin .65s linear infinite',
              }} />
            )}
            {isPending ? 'Sending request…' : 'Send Join Request →'}
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#9AAAB8', lineHeight: 1.6 }}>
          Can't find your library? Ask the owner to ensure it's registered and active on seatspace.
        </p>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { to { transform: rotate(360deg); } }
      `}} />
    </div>
  )
}