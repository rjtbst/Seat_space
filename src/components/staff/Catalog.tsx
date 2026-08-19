'use client'

// src/app/(staff)/staff/books/_components/CatalogTab.tsx
import { useState } from 'react'
import type { CatalogBook } from '@/lib/actions/staff-book-action'
import { addBook, addCopy, deleteBook } from '@/lib/actions/staff-book-action'
import { ACCENT } from '@/lib/constants/theme'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

type Props = {
  libraryId:       string
  isSenior:        boolean
  catalog:         CatalogBook[]
  onCatalogChange: (catalog: CatalogBook[]) => void
}

const EMPTY_FORM = { title: '', author: '', isbn: '', copyCount: 1 }

export default function CatalogTab({ libraryId, isSenior, catalog, onCatalogChange }: Props) {
  const [search,      setSearch]      = useState('')
  const [showAdd,     setShowAdd]     = useState(false)
  const [form,        setForm]        = useState(EMPTY_FORM)
  const [adding,      setAdding]      = useState(false)
  const [addError,    setAddError]    = useState<string | null>(null)
  const [actionState, setActionState] = useState<Record<string, 'addCopy' | 'delete' | null>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CatalogBook | null>(null)

  const filtered = catalog.filter(b =>
    !search.trim() ||
    b.title.toLowerCase().includes(search.toLowerCase()) ||
    (b.author ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (b.isbn ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const handleAddBook = async () => {
    if (!form.title.trim()) return setAddError('Title is required')
    setAdding(true)
    setAddError(null)
    const res = await addBook({
      libraryId,
      title:     form.title.trim(),
      author:    form.author.trim() || undefined,
      isbn:      form.isbn.trim()   || undefined,
      copyCount: Math.min(Math.max(1, form.copyCount), 20),
    })
    setAdding(false)
     if (res.success === false) return setActionError(res.error ?? 'Failed to add book')

    // Optimistic: add new book to catalog
    const newBook: CatalogBook = {
      bookId:          res.data!.bookId,
      title:           form.title.trim(),
      author:          form.author.trim() || null,
      isbn:            form.isbn.trim()   || null,
      totalCopies:     form.copyCount,
      availableCopies: form.copyCount,
      issuedCopies:    0,
      copies:          Array.from({ length: form.copyCount }, (_, i) => ({
        copyId: `new-${i}`,
        status: 'available' as const,
      })),
    }
    onCatalogChange([...catalog, newBook].sort((a, b) => a.title.localeCompare(b.title)))
    setForm(EMPTY_FORM)
    setShowAdd(false)
  }

  const handleAddCopy = async (book: CatalogBook) => {
    setActionState(p => ({ ...p, [book.bookId]: 'addCopy' }))
    setActionError(null)
    const res = await addCopy(book.bookId, libraryId)
    setActionState(p => ({ ...p, [book.bookId]: null }))
    if (res.success === false) return setActionError(res.error ?? 'Failed to add copy')
    onCatalogChange(catalog.map(b =>
      b.bookId === book.bookId
        ? {
            ...b,
            totalCopies:     b.totalCopies + 1,
            availableCopies: b.availableCopies + 1,
            copies: [...b.copies, { copyId: res.data!.copyId, status: 'available' as const }],
          }
        : b
    ))
  }

  const handleDelete = (book: CatalogBook) => {
    setPendingDelete(book)
  }

  const confirmDelete = async () => {
    const book = pendingDelete
    if (!book) return
    setPendingDelete(null)
    setActionState(p => ({ ...p, [book.bookId]: 'delete' }))
    setActionError(null)
    const res = await deleteBook(book.bookId, libraryId)
    setActionState(p => ({ ...p, [book.bookId]: null }))
    if (res.success === false) return setActionError(res.error ?? 'Failed to delete')
    onCatalogChange(catalog.filter(b => b.bookId !== book.bookId))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Top bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter books…"
          style={{ ...inputStyle, flex: 1 }}
        />
        {isSenior && (
          <button className="clay-raised-sm clay-interactive"
            onClick={() => { setShowAdd(!showAdd); setAddError(null) }}
            style={{
              background:   showAdd ? 'var(--clay-surface)' : undefined,
              color:        showAdd ? '#6B7689' : '#fff',
              border:       'none',
              padding:      '9px 14px',
              fontSize:     12,
              fontWeight:   700,
              cursor:       'pointer',
              fontFamily:   'DM Sans, sans-serif',
              whiteSpace:   'nowrap',
              ...(!showAdd ? { background: `linear-gradient(155deg, #22D9EA, ${ACCENT}, #05707D)`, boxShadow: '3px 3px 8px rgba(5,151,167,.3), -2px -2px 6px rgba(255,255,255,.4)' } : {}),
            }}
          >
            {showAdd ? 'Cancel' : '+ Add Book'}
          </button>
        )}
      </div>

      {/* Add book form */}
      {showAdd && isSenior && (
        <div className="clay-raised-sm" style={{
          background:   'var(--clay-surface)',
          padding:      '14px',
          display:      'flex',
          flexDirection: 'column',
          gap:          10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0A0D12', fontFamily: 'Syne, sans-serif' }}>New Book</div>
          <div>
            <label style={labelStyle}>Title *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Book title" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Author</label>
            <input value={form.author} onChange={e => setForm(p => ({ ...p, author: e.target.value }))} placeholder="Author name" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>ISBN</label>
              <input value={form.isbn} onChange={e => setForm(p => ({ ...p, isbn: e.target.value }))} placeholder="ISBN" style={inputStyle} />
            </div>
            <div style={{ width: 80 }}>
              <label style={labelStyle}>Copies</label>
              <input
                type="number"
                min={1}
                max={20}
                value={form.copyCount}
                onChange={e => setForm(p => ({ ...p, copyCount: parseInt(e.target.value) || 1 }))}
                style={inputStyle}
              />
            </div>
          </div>

          {addError && (
            <div className="clay-raised-sm" style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', padding: '7px 10px' }}>
              {addError}
            </div>
          )}

          <button className="clay-btn-primary"
            onClick={handleAddBook}
            disabled={adding}
            style={{
              background:   `linear-gradient(155deg, #22D9EA, ${ACCENT}, #05707D)`,
              border:       'none',
              padding:      '10px 0',
              fontSize:     13,
              fontWeight:   700,
              cursor:       adding ? 'default' : 'pointer',
              fontFamily:   'DM Sans, sans-serif',
            }}
          >
            {adding ? 'Adding…' : 'Add Book'}
          </button>
        </div>
      )}

      {actionError && (
        <div className="clay-raised-sm" style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', padding: '8px 12px', fontFamily: 'DM Sans, sans-serif' }}>
          {actionError}
        </div>
      )}

      {/* Book list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '36px 0', color: '#9AAAB8' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📚</div>
          <div style={{ fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
            {search ? 'No books match your search' : 'No books in catalog'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(book => {
            const busy = actionState[book.bookId]
            return (
              <div key={book.bookId} className="clay-raised" style={{
                padding:      '12px 14px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0A0D12', fontFamily: 'Syne, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {book.title}
                    </div>
                    {book.author && (
                      <div style={{ fontSize: 11, color: '#9AAAB8', marginTop: 1, fontFamily: 'DM Sans, sans-serif' }}>{book.author}</div>
                    )}
                  </div>

                  {/* Copy counts */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span className="dash-badge" style={{
                      background: book.availableCopies > 0 ? '#ECFDF5' : '#FEF2F2',
                      color:      book.availableCopies > 0 ? '#059669' : '#DC2626',
                    }}>
                      {book.availableCopies}/{book.totalCopies}
                    </span>
                  </div>
                </div>

                {/* Senior staff actions */}
                {isSenior && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 7 }}>
                    <button className="clay-raised-sm clay-interactive"
                      onClick={() => handleAddCopy(book)}
                      disabled={!!busy}
                      style={{
                        ...ghostBtn,
                        color: ACCENT,
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      {busy === 'addCopy' ? '…' : '+ Copy'}
                    </button>
                    <button className="clay-raised-sm clay-interactive"
                      onClick={() => handleDelete(book)}
                      disabled={!!busy || book.issuedCopies > 0}
                      style={{
                        ...ghostBtn,
                        color: '#DC2626',
                        opacity: (busy || book.issuedCopies > 0) ? 0.4 : 1,
                      }}
                      title={book.issuedCopies > 0 ? 'Cannot delete — copies are issued' : 'Delete book'}
                    >
                      {busy === 'delete' ? '…' : 'Delete'}
                    </button>
                    {book.isbn && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9AAAB8', fontFamily: 'DM Sans, sans-serif', alignSelf: 'center' }}>
                        ISBN {book.isbn}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ fontSize: 11, color: '#9AAAB8', textAlign: 'center', fontFamily: 'DM Sans, sans-serif' }}>
        {filtered.length} of {catalog.length} book{catalog.length !== 1 ? 's' : ''}
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete ? `Delete "${pendingDelete.title}"?` : ''}
        description={pendingDelete ? `This will remove all ${pendingDelete.totalCopies} cop${pendingDelete.totalCopies === 1 ? 'y' : 'ies'}. This cannot be undone.` : undefined}
        confirmLabel="Delete"
        tone="danger"
        busy={pendingDelete ? actionState[pendingDelete.bookId] === 'delete' : false}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display:       'block',
  fontSize:      11,
  fontWeight:    600,
  color:         '#9AAAB8',
  marginBottom:  5,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontFamily:    'DM Sans, sans-serif',
}

const inputStyle: React.CSSProperties = {
  width:        '100%',
  boxSizing:    'border-box',
  padding:      '9px 12px',
  borderRadius: 12,
  border:       'none',
  background:   'var(--clay-surface)',
  boxShadow:    'inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6)',
  fontSize:     13,
  color:        '#0A0D12',
  fontFamily:   'DM Sans, sans-serif',
  outline:      'none',
}

const ghostBtn: React.CSSProperties = {
  background:   'transparent',
  border:       'none',
  padding:      '5px 12px',
  fontSize:     11,
  fontWeight:   700,
  cursor:       'pointer',
  fontFamily:   'DM Sans, sans-serif',
}