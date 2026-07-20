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

  const handleSearch = useCallback((q: string) => {
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setSearched(false)
      const res = await searchBooksInCity(q, cityOverride || city)
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
            background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8,
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
          background: '#F8FAFC', borderRadius: 14, border: '1px solid #E4EAF2',
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
          background: '#fff', border: '1px solid #E4EAF2', borderRadius: 14,
          marginBottom: 16, overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(10,13,18,.04)',
        }}>
          {/* Library header */}
          <div style={{
            padding: '12px 16px', background: '#F8FAFC',
            borderBottom: '1px solid #E4EAF2',
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
              style={{
                fontSize: 11, fontWeight: 700, color: '#1E5CFF',
                textDecoration: 'none', padding: '5px 10px',
                background: '#EEF3FF', borderRadius: 20,
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              View Library →
            </Link>
          </div>

          {/* Book rows */}
          <div style={{ padding: '8px 0' }}>
            {lib.books.map(r => {
              const key          = `${r.bookId}:${r.libraryId}`
              const isRequesting = requestingKey === key
              const isRequested  = requestedKeys.has(key)

              return (
                <div
                  key={key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px',
                    borderBottom: '1px solid #F4F7FB',
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
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
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
                    style={{
                      flexShrink: 0,
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: isRequested
                        ? '1.5px solid #86EFAC'
                        : '1.5px solid #C7D4F7',
                      background: isRequested ? '#ECFDF5' : '#EEF3FF',
                      color:      isRequested ? '#059669' : '#1E5CFF',
                      fontSize: 12, fontWeight: 700,
                      cursor: isRequesting || isRequested ? 'default' : 'pointer',
                      fontFamily: 'DM Sans, sans-serif',
                      opacity: isRequesting ? 0.7 : 1,
                      transition: 'all .15s',
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
          background: '#F8FAFC', borderRadius: 14, border: '1px dashed #CBD5E1',
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
  borderRadius: 9,
  border: '1.5px solid #E2DDD4',
  background: '#FDFCF9',
  fontSize: 13,
  color: '#0A0D12',
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
}
