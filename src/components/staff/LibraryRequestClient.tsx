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
  border: 'none', borderRadius: 12,
  fontSize: 14, color: '#0A0D12', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', background: 'var(--clay-surface)',
  boxSizing: 'border-box', boxShadow: 'inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6)',
  transition: 'box-shadow .15s',
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
          <div className="clay-raised" style={{
            width: 72, height: 72, borderRadius: '50%',
            background: GREEN_LIGHT, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 36, margin: '0 auto 16px',
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
          <div className="clay-raised-sm" style={{
            background: ACCENT_LIGHT, border: 'none',
            padding: '12px 14px', marginBottom: 20,
            fontSize: 13, color: '#0A5F6B', lineHeight: 1.6, textAlign: 'left',
          }}>
            💡 Share your registered phone number with the library owner to help them find your request quickly.
          </div>
          <button className="clay-btn-primary"
            onClick={() => router.push('/staff')}
            style={{
              width: '100%', padding: '12px 0',
              border: 'none', background: `linear-gradient(155deg, #22D9EA, ${ACCENT}, #05707D)`,
              fontSize: 14, fontWeight: 700, fontFamily: 'Syne, sans-serif',
              cursor: 'pointer',
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
      background: 'var(--clay-bg)',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="clay-raised" style={{
            width: 52, height: 52, background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 24,
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
          <div className="clay-raised-sm" style={{
            background: '#FEE2E2', border: 'none',
            padding: '10px 14px', marginBottom: 16,
            fontSize: 13, color: '#9B1C1C', display: 'flex', gap: 8,
          }}>
            <span>ℹ️</span>
            Your previous request was not approved. You can apply to any other active library.
          </div>
        )}

        {/* Form card */}
        <div className="clay-raised" style={{
          background: 'var(--clay-surface)', padding: '24px',
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
                onFocus={e => { e.target.style.boxShadow = `inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6), 0 0 0 3px ${ACCENT_LIGHT}` }}
                onBlur={e => { e.target.style.boxShadow = 'inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6)' }}
                autoFocus
              />

              {/* Dropdown */}
              {(results.length > 0 || searching) && !selected && (
                <div className="clay-raised" style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: 'var(--clay-surface)', marginTop: 4,
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
                  ) : results.map((lib, i) => (
                    <button
                      key={lib.id}
                      onMouseDown={() => handleSelect(lib)}
                      style={{
                        display: 'block', width: '100%', padding: '10px 14px',
                        textAlign: 'left', border: 'none', background: 'transparent',
                        cursor: 'pointer',
                        boxShadow: i < results.length - 1 ? 'inset 0 -1px 0 rgba(163,177,198,.2)' : undefined,
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
              <div className="clay-raised-sm" style={{
                marginTop: 8, padding: '8px 12px',
                background: GREEN_LIGHT, border: 'none',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ color: GREEN, fontSize: 14 }}>✓</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: GREEN }}>{selected.name}</div>
                  <div style={{ fontSize: 11, color: '#6B7689' }}>{[selected.area, selected.city].filter(Boolean).join(', ')}</div>
                </div>
                <button
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
            <div className="clay-raised-sm" style={{
              background: '#FEE2E2', border: 'none',
              padding: '9px 12px', marginBottom: 14,
              fontSize: 12, color: '#9B1C1C', display: 'flex', gap: 6,
            }}>
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!selected || isPending}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 14,
              border: 'none',
              background: selected ? `linear-gradient(155deg, #22D9EA, ${ACCENT}, #05707D)` : '#C0CDD9',
              color: '#fff', fontSize: 15, fontWeight: 700,
              fontFamily: 'Syne, sans-serif',
              cursor: selected ? 'pointer' : 'not-allowed',
              opacity: isPending ? 0.7 : 1,
              boxShadow: selected
                ? '4px 4px 12px rgba(5,151,167,.3), -3px -3px 8px rgba(255,255,255,.4), inset 0 1px 1px rgba(255,255,255,.3)'
                : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'transform .15s, box-shadow .15s',
            }}
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