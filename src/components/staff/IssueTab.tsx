'use client'

// src/components/staff/IssueTab.tsx
import { useState, useRef, useCallback } from 'react'
import type { CatalogBook, BookIssue } from '@/lib/actions/staff-book-action'
import { searchBooks, issueBook, lookupMemberByPhone } from '@/lib/actions/staff-book-action'
import { ACCENT } from '@/lib/constants/theme'

type BorrowerMode = 'guest' | 'member'

type Props = {
  libraryId: string
  catalog:   CatalogBook[]
  onIssued:  (updatedCatalog: CatalogBook[], newIssue: BookIssue) => void
}

// Default due date = today + 14 days
function defaultDueDate() {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().split('T')[0]
}

export default function IssueTab({ libraryId, catalog, onIssued }: Props) {
  const [query,        setQuery]        = useState('')
  const [results,      setResults]      = useState<CatalogBook[]>([])
  const [searching,    setSearching]    = useState(false)
  const [selected,     setSelected]     = useState<CatalogBook | null>(null)
  const [selectedCopy, setSelectedCopy] = useState<string>('')

  // Borrower mode: guest (walk-in) or member (registered user)
  const [borrowerMode, setBorrowerMode] = useState<BorrowerMode>('guest')

  // Guest fields
  const [name,  setName]  = useState('')
  const [phone, setPhone] = useState('')

  // Member lookup fields
  const [memberPhone,   setMemberPhone]   = useState('')
  const [memberLookup,  setMemberLookup]  = useState<{ id: string; fullName: string; phone: string | null } | null>(null)
  const [lookingUp,     setLookingUp]     = useState(false)
  const [lookupStatus,  setLookupStatus]  = useState<'idle' | 'found' | 'not_found'>('idle')

  const [dueDate,  setDueDate]  = useState(defaultDueDate)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState(false)

  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lookupRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRequestId = useRef(0)
  const lookupRequestId = useRef(0)

  // Debounced book search
  const handleQuery = useCallback((val: string) => {
    setQuery(val)
    setSelected(null)
    setError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.trim().length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      const requestId = ++searchRequestId.current
      setSearching(true)
      const res = await searchBooks(libraryId, val)
      if (requestId !== searchRequestId.current) return
      setResults(res)
      setSearching(false)
    }, 350)
  }, [libraryId])

  const handleSelect = (book: CatalogBook) => {
    setSelected(book)
    setQuery(book.title)
    setResults([])
    const firstAvail = book.copies.find(c => c.status === 'available')
    setSelectedCopy(firstAvail?.copyId ?? '')
    setError(null)
  }

  // Debounced member phone lookup
  const handleMemberPhone = useCallback((val: string) => {
    setMemberPhone(val)
    setMemberLookup(null)
    setLookupStatus('idle')
    if (lookupRef.current) clearTimeout(lookupRef.current)
    const cleaned = val.replace(/\D/g, '')
    if (cleaned.length < 10) return
    lookupRef.current = setTimeout(async () => {
      const requestId = ++lookupRequestId.current
      setLookingUp(true)
      const res = await lookupMemberByPhone(val, libraryId)
      // Without this guard, a slower lookup for a phone number the staff
      // member already edited/corrected could resolve after the newer
      // one and show a DIFFERENT member's details against the number
      // currently in the field — a real risk when issuing a book, not
      // just a cosmetic glitch.
      if (requestId !== lookupRequestId.current) return
      setLookingUp(false)
      if (res.success && res.data) {
        setMemberLookup(res.data)
        setLookupStatus('found')
      } else {
        setLookupStatus('not_found')
      }
    }, 500)
  }, [libraryId])

  const handleSubmit = async () => {
    if (!selected)        return setError('Select a book first')
    if (!selectedCopy)    return setError('No available copy selected')
    if (!dueDate)         return setError('Due date is required')

    // Validate borrower details
    if (borrowerMode === 'guest') {
      if (!name.trim()) return setError('Borrower name is required')
    } else {
      if (!memberLookup) return setError('Look up a registered member first')
    }

    setLoading(true)
    setError(null)

    const guestName  = borrowerMode === 'member' ? memberLookup!.fullName : name.trim()
    const guestPhone = borrowerMode === 'member' ? (memberLookup!.phone ?? '') : phone.trim()
    const userId     = borrowerMode === 'member' ? memberLookup!.id : null

    const res = await issueBook({
      libraryId,
      copyId:     selectedCopy,
      guestName,
      guestPhone,
      userId,
      dueDate,
    })
    setLoading(false)

    if (res.success === false) {
      setError(res.error)
      return
    }

    // Build the new BookIssue for optimistic UI
    const now = new Date().toISOString()
    const newIssue: BookIssue = {
      issueId:     res.data!.issueId,
      bookId:      selected.bookId,
      copyId:      selectedCopy,
      title:       selected.title,
      author:      selected.author,
      issuedTo:    guestName,
      phone:       guestPhone || null,
      isGuest:     !userId,
      userId,
      issuedAt:    now,
      dueDate,
      isOverdue:   false,
      daysOverdue: 0,
    }

    // Update catalog optimistically
    const updatedCatalog = catalog.map(b =>
      b.bookId === selected.bookId
        ? {
            ...b,
            availableCopies: b.availableCopies - 1,
            issuedCopies:    b.issuedCopies + 1,
            copies: b.copies.map(c =>
              c.copyId === selectedCopy ? { ...c, status: 'issued' as const } : c
            ),
          }
        : b
    )

    setSuccess(true)
    setTimeout(() => {
      setSuccess(false)
      setQuery('')
      setSelected(null)
      setName('')
      setPhone('')
      setMemberPhone('')
      setMemberLookup(null)
      setLookupStatus('idle')
      setDueDate(defaultDueDate())
      setSelectedCopy('')
      onIssued(updatedCatalog, newIssue)
    }, 900)
  }

  const availCopies = selected?.copies.filter(c => c.status === 'available') ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Book search */}
      <div>
        <label style={labelStyle}>Search Book</label>
        <div style={{ position: 'relative' }}>
          <input
            value={query}
            onChange={e => handleQuery(e.target.value)}
            placeholder="Title, author, or ISBN…"
            style={inputStyle}
          />
          {searching && (
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9AAAB8' }}>
              searching…
            </span>
          )}
        </div>

        {results.length > 0 && !selected && (
          <div style={{
            border: '1px solid #E2DDD4', borderRadius: 10, overflow: 'hidden',
            marginTop: 4, background: '#fff',
            boxShadow: '0 4px 16px rgba(10,13,18,.08)',
          }}>
            {results.map((book, i) => (
              <button className="press"
                key={book.bookId}
                onClick={() => handleSelect(book)}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 14px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderTop: i > 0 ? '1px solid #F4F7FB' : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0D12' }}>{book.title}</div>
                  {book.author && <div style={{ fontSize: 11, color: '#9AAAB8', marginTop: 1 }}>{book.author}</div>}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: book.availableCopies > 0 ? '#ECFDF5' : '#FEF2F2',
                  color: book.availableCopies > 0 ? '#059669' : '#DC2626',
                }}>
                  {book.availableCopies} avail
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected book info */}
      {selected && (
        <div style={{
          background: '#F4F7FB', borderRadius: 10, padding: '12px 14px',
          border: '1px solid #E2DDD4',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0A0D12', fontFamily: 'Syne, sans-serif' }}>
                {selected.title}
              </div>
              {selected.author && (
                <div style={{ fontSize: 11, color: '#9AAAB8', marginTop: 2 }}>{selected.author}</div>
              )}
            </div>
            <button className="press"
              onClick={() => { setSelected(null); setQuery('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9AAAB8', fontSize: 16, padding: 0 }}
            >
              ✕
            </button>
          </div>

          {availCopies.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <label style={{ ...labelStyle, marginBottom: 4, display: 'block' }}>Copy</label>
              <select
                value={selectedCopy}
                onChange={e => setSelectedCopy(e.target.value)}
                style={{ ...inputStyle, paddingTop: 8, paddingBottom: 8 }}
              >
                {availCopies.map((c, i) => (
                  <option key={c.copyId} value={c.copyId}>Copy #{i + 1}</option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
              No copies available
            </div>
          )}
        </div>
      )}

      {/* Borrower mode toggle */}
      <div>
        <label style={labelStyle}>Borrower Type</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['guest', 'member'] as BorrowerMode[]).map(mode => (
            <button className="press"
              key={mode}
              onClick={() => {
                setBorrowerMode(mode)
                setError(null)
                setMemberLookup(null)
                setLookupStatus('idle')
                setMemberPhone('')
              }}
              style={{
                flex: 1,
                padding: '9px 0',
                borderRadius: 8,
                border: `1.5px solid ${borrowerMode === mode ? ACCENT : '#E2DDD4'}`,
                background: borrowerMode === mode ? '#ECFDF5' : '#FDFCF9',
                color: borrowerMode === mode ? '#059669' : '#6E7F94',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                textTransform: 'capitalize',
              }}
            >
              {mode === 'guest' ? '🚶 Walk-in / Guest' : '👤 Registered Member'}
            </button>
          ))}
        </div>
      </div>

      {/* Borrower details */}
      {borrowerMode === 'guest' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Borrower Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Phone (optional)</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="10-digit mobile"
              type="tel"
              style={inputStyle}
            />
          </div>
        </div>
      ) : (
        <div>
          <label style={labelStyle}>Member Phone Number</label>
          <div style={{ position: 'relative' }}>
            <input
              value={memberPhone}
              onChange={e => handleMemberPhone(e.target.value)}
              placeholder="Enter member's phone number"
              type="tel"
              style={inputStyle}
            />
            {lookingUp && (
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9AAAB8' }}>
                looking up…
              </span>
            )}
          </div>

          {lookupStatus === 'found' && memberLookup && (
            <div style={{
              marginTop: 8, padding: '10px 12px', borderRadius: 8,
              background: '#ECFDF5', border: '1px solid #86EFAC',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#065F46' }}>{memberLookup.fullName}</div>
                <div style={{ fontSize: 11, color: '#059669' }}>{memberLookup.phone}</div>
              </div>
            </div>
          )}

          {lookupStatus === 'not_found' && (
            <div style={{
              marginTop: 8, padding: '10px 12px', borderRadius: 8,
              background: '#FEF2F2', border: '1px solid #FCA5A5', fontSize: 12, color: '#DC2626',
            }}>
              No registered member found with this number. Use Walk-in mode instead.
            </div>
          )}
        </div>
      )}

      {/* Due date */}
      <div>
        <label style={labelStyle}>Due Date *</label>
        <input
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          type="date"
          style={inputStyle}
        />
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', padding: '8px 12px', borderRadius: 8 }}>
          {error}
        </div>
      )}

      <button className="press"
        onClick={handleSubmit}
        disabled={loading || success || !selected || availCopies.length === 0}
        style={{
          background:    success ? '#059669' : ACCENT,
          color:         '#fff',
          border:        'none',
          borderRadius:  10,
          padding:       '13px 0',
          fontSize:      14,
          fontWeight:    700,
          cursor:        loading || success ? 'default' : 'pointer',
          fontFamily:    'DM Sans, sans-serif',
          opacity:       (!selected || availCopies.length === 0) ? 0.5 : 1,
          transition:    'background .2s',
        }}
      >
        {success ? '✓ Issued!' : loading ? 'Issuing…' : '📤 Issue Book'}
      </button>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display:     'block',
  fontSize:    11,
  fontWeight:  600,
  color:       '#9AAAB8',
  marginBottom: 5,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontFamily:  'DM Sans, sans-serif',
}

const inputStyle: React.CSSProperties = {
  width:        '100%',
  boxSizing:    'border-box',
  padding:      '10px 12px',
  borderRadius: 8,
  border:       '1px solid #E2DDD4',
  background:   '#FDFCF9',
  fontSize:     13,
  color:        '#0A0D12',
  fontFamily:   'DM Sans, sans-serif',
  outline:      'none',
}
