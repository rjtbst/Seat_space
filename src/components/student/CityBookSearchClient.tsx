'use client'

// src/components/student/CityBookSearchClient.tsx
/**
 * City-wide book search for students.
 *
 * - Student types a title/author/ISBN
 * - We search across all live libraries in their city
 * - Results show which library has it + copy availability
 * - Student can send a request to any library from here
 */

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Search, BookOpen, MapPin, AlertCircle } from 'lucide-react'
import {
  searchBooksInCity,
  requestBook,
  type CityBookResult,
} from '@/lib/actions/students/student-books'

type Props = { city: string }

export default function CityBookSearchClient({ city }: Props) {
  const [query,        setQuery]        = useState('')
  const [cityOverride, setCityOverride] = useState(city)
  const [results,      setResults]      = useState<CityBookResult[]>([])
  const [searching,    setSearching]    = useState(false)
  const [searched,     setSearched]     = useState(false)

  // Track request state per (bookId + libraryId) pair
  const [requestingKey, setRequestingKey] = useState<string | null>(null)
  const [requestedKeys, setRequestedKeys] = useState<Set<string>>(new Set())
  const [msgKey,        setMsgKey]        = useState<string | null>(null)
  const [errKey,        setErrKey]        = useState<string | null>(null)
  const [errMsg,        setErrMsg]        = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Same stale-response guard as the price-preview fetches: without this,
  // results for an earlier keystroke's query can land after a later
  // one's and silently replace the correct results with results for a
  // query the person already moved past.
  const searchRequestId = useRef(0)

  const handleSearch = useCallback((q: string) => {
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      const requestId = ++searchRequestId.current
      setSearching(true)
      setSearched(false)
      const res = await searchBooksInCity(q, cityOverride || city)
      if (requestId !== searchRequestId.current) return
      setResults(res)
      setSearching(false)
      setSearched(true)
    }, 400)
  }, [cityOverride, city])

  const handleRequest = async (r: CityBookResult) => {
    const key = `${r.bookId}:${r.libraryId}`
    setRequestingKey(key)
    setMsgKey(null)
    setErrKey(null)
    const res = await requestBook({ bookId: r.bookId, libraryId: r.libraryId })
    setRequestingKey(null)
    if (res.success) {
      setRequestedKeys(prev => new Set([...prev, key]))
      setMsgKey(key)
      setTimeout(() => setMsgKey(null), 4000)
    } else {
      setErrKey(key)
      setErrMsg((res as any).error ?? 'Failed to send request')
      setTimeout(() => setErrKey(null), 4000)
    }
  }

  // Group results by library
  const byLibrary = results.reduce<Record<string, { name: string; area: string | null; books: CityBookResult[] }>>(
    (acc, r) => {
      if (!acc[r.libraryId]) acc[r.libraryId] = { name: r.libraryName, area: r.area, books: [] }
      acc[r.libraryId].books.push(r)
      return acc
    },
    {}
  )

  return (
    <div style={{ padding: '24px 20px', maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <BookOpen style={{ width: 22, height: 22, color: '#1E5CFF' }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0A0D12', fontFamily: 'Syne, sans-serif', margin: 0 }}>
            Search Books
          </h1>
        </div>
        <p style={{ fontSize: 13, color: '#6E7F94', margin: 0, fontFamily: 'DM Sans, sans-serif' }}>
          Find a book across all libraries in your city and request it.
        </p>
      </div>

      {/* City selector + Search box */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', width: 140, flexShrink: 0 }}>
            <MapPin style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              width: 14, height: 14, color: '#9AACBE', pointerEvents: 'none',
            }} />
            <input
              value={cityOverride}
              onChange={e => setCityOverride(e.target.value)}
              placeholder="City"
              style={{
                ...inputBase,
                paddingLeft: 30,
                fontWeight: 600,
              }}
            />
          </div>

          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              width: 14, height: 14, color: '#9AACBE', pointerEvents: 'none',
            }} />
            <input
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Title, author, or ISBN…"
              style={{ ...inputBase, paddingLeft: 30 }}
              autoFocus
            />
            {searching && (
              <span style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                fontSize: 11, color: '#9AAAB8', fontFamily: 'DM Sans, sans-serif',
              }}>
                searching…
              </span>
            )}
          </div>
        </div>

        {!cityOverride && !city && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
            background: '#FFFBEB', border: 'none', borderRadius: 12,
            boxShadow: '2px 2px 6px rgba(252,211,77,.25), -2px -2px 5px rgba(255,255,255,.6)',
            fontSize: 12, color: '#92400E', fontFamily: 'DM Sans, sans-serif',
          }}>
            <AlertCircle style={{ width: 13, height: 13, flexShrink: 0 }} />
            Enter your city above to search nearby libraries.
            <Link href="/profile" style={{ color: '#1E5CFF', fontWeight: 600, marginLeft: 4 }}>
              Update profile →
            </Link>
          </div>
        )}
      </div>

      {/* Results */}
      {searched && results.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          background: 'var(--clay-surface)', borderRadius: 18, border: 'none',
          boxShadow: '5px 5px 12px rgba(163,177,198,.3), -4px -4px 10px rgba(255,255,255,.65)',
        }}>
          <BookOpen style={{ width: 32, height: 32, color: '#C7D4F7', margin: '0 auto 10px' }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0A0D12', fontFamily: 'Syne, sans-serif' }}>
            No books found
          </div>
          <div style={{ fontSize: 12, color: '#9AACBE', marginTop: 4, fontFamily: 'DM Sans, sans-serif' }}>
            Try a different title, author, or city.
          </div>
        </div>
      )}

      {Object.entries(byLibrary).map(([libId, lib]) => (
        <div key={libId} style={{
          background: 'var(--clay-surface)', border: 'none', borderRadius: 18,
          marginBottom: 16, overflow: 'hidden',
          boxShadow: '5px 5px 12px rgba(163,177,198,.3), -4px -4px 10px rgba(255,255,255,.65)',
        }}>
          {/* Library header */}
          <div style={{
            padding: '12px 16px',
            boxShadow: 'inset 0 -1px 0 rgba(163,177,198,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0A0D12', fontFamily: 'Syne, sans-serif' }}>
                {lib.name}
              </div>
              {lib.area && (
                <div style={{ fontSize: 11, color: '#9AACBE', marginTop: 1, fontFamily: 'DM Sans, sans-serif' }}>
                  📍 {lib.area}
                </div>
              )}
            </div>
            <Link
              href={`/library/${libId}`}
              className="clay-raised-sm clay-interactive"
              style={{
                fontSize: 11, fontWeight: 700, color: '#1E5CFF',
                textDecoration: 'none', padding: '5px 10px',
                borderRadius: 20,
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              View Library →
            </Link>
          </div>

          {/* Book rows */}
          <div style={{ padding: '8px 0' }}>
            {lib.books.map((r, ri) => {
              const key          = `${r.bookId}:${r.libraryId}`
              const isRequesting = requestingKey === key
              const isRequested  = requestedKeys.has(key)

              return (
                <div
                  key={key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px',
                    boxShadow: ri < lib.books.length - 1 ? 'inset 0 -1px 0 rgba(163,177,198,.15)' : undefined,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0D12', fontFamily: 'DM Sans, sans-serif' }}>
                      {r.title}
                    </div>
                    {r.author && (
                      <div style={{ fontSize: 11, color: '#9AACBE', marginTop: 1, fontFamily: 'DM Sans, sans-serif' }}>
                        {r.author}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span className="clay-chip" style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px',
                        background: r.availableCopies > 0 ? '#ECFDF5' : '#FEF2F2',
                        color: r.availableCopies > 0 ? '#059669' : '#DC2626',
                        fontFamily: 'DM Sans, sans-serif',
                      }}>
                        {r.availableCopies > 0
                          ? `${r.availableCopies} of ${r.totalCopies} available`
                          : `${r.totalCopies} cop${r.totalCopies !== 1 ? 'ies' : 'y'} · all issued`
                        }
                      </span>
                    </div>
                    {msgKey === key && (
                      <div style={{ fontSize: 11, color: '#059669', marginTop: 4, fontWeight: 600 }}>
                        ✓ Request sent! Library staff will contact you.
                      </div>
                    )}
                    {errKey === key && (
                      <div style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>{errMsg}</div>
                    )}
                  </div>

                  <button
                    disabled={isRequesting || isRequested}
                    onClick={() => handleRequest(r)}
                    className="clay-raised-sm"
                    style={{
                      flexShrink: 0,
                      padding: '8px 14px',
                      border: 'none',
                      background: isRequested ? '#ECFDF5' : undefined,
                      color:      isRequested ? '#059669' : '#1E5CFF',
                      fontSize: 12, fontWeight: 700,
                      cursor: isRequesting || isRequested ? 'default' : 'pointer',
                      fontFamily: 'DM Sans, sans-serif',
                      opacity: isRequesting ? 0.7 : 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isRequesting ? '…' : isRequested ? '✓ Requested' : 'Request Book'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Empty prompt */}
      {!searched && !searching && (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          background: 'var(--clay-surface)', borderRadius: 18, border: 'none',
          boxShadow: 'inset 3px 3px 8px rgba(163,177,198,.25), inset -2px -2px 6px rgba(255,255,255,.6)',
        }}>
          <Search style={{ width: 36, height: 36, color: '#C7D4F7', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: '#64748B', fontFamily: 'Syne, sans-serif' }}>
            Search for any book
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4, fontFamily: 'DM Sans, sans-serif' }}>
            Results show availability across all libraries in {cityOverride || city || 'your city'}.
          </div>
        </div>
      )}
    </div>
  )
}

const inputBase: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 12,
  border: 'none',
  background: 'var(--clay-surface)',
  boxShadow: 'inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6)',
  fontSize: 13,
  color: '#0A0D12',
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
}
