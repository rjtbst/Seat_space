/**
 * Library selector — used in Seat Manager, Slot Config, Dashboard, Bookings.
 * Triggers nav progress bar on click.
 *
 * Renders as pill buttons for a small number of libraries (nice, tactile,
 * shows all options at a glance) and switches to a searchable dropdown once
 * the list gets long enough that pills would wrap into an unusable wall of
 * buttons — e.g. an owner running 20+ locations. Threshold is a prop so it
 * can be tuned per page; defaults to 8, which is roughly where pill-wrapping
 * starts to hurt on a typical dashboard width.
 *
 * Usage (unchanged from before — existing call sites need no changes):
 *   <LibraryPicker
 *     libraries={libraries}
 *     currentId={libraryId}
 *     buildHref={(id) => `/dashboard/seat-manager?lib=${id}`}
 *   />
 */
'use client'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import type { OwnerLibrary } from '@/lib/actions/owner'
import { ACCENT, ACCENT_LIGHT, BORDER, BG_CARD, TEXT_SECONDARY, TEXT_PRIMARY, TEXT_MUTED, FONT_BODY, SHADOW_MD } from '@/lib/constants/theme'

interface LibraryPickerProps {
  libraries:  OwnerLibrary[]
  currentId:  string
  buildHref:  (id: string) => string
  colorScheme?: 'green' | 'blue'   // default: green (accent)
  dropdownThreshold?: number       // switch to dropdown above this count — default 8
}

export function LibraryPicker({
  libraries, currentId, buildHref, colorScheme = 'green', dropdownThreshold = 8,
}: LibraryPickerProps) {
  const router = useRouter()

  const activeColor = colorScheme === 'blue' ? '#1E5CFF' : ACCENT
  const activeBg    = colorScheme === 'blue' ? '#E8EFFE' : ACCENT_LIGHT

  const handleClick = useCallback((id: string) => {
    ;(window as any).__startNavProgress?.()
    router.push(buildHref(id))
  }, [router, buildHref])

  if (libraries.length <= 1) return null

  if (libraries.length > dropdownThreshold) {
    return (
      <LibraryDropdown
        libraries={libraries}
        currentId={currentId}
        onSelect={handleClick}
        activeColor={activeColor}
      />
    )
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
      {libraries.map(lib => {
        const active = lib.id === currentId
        return (
          <button
            key={lib.id}
            onClick={() => handleClick(lib.id)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: `1.5px solid ${active ? activeColor : BORDER}`,
              background: active ? activeBg : BG_CARD,
              color: active ? activeColor : TEXT_SECONDARY,
              cursor: 'pointer', fontFamily: FONT_BODY,
              transition: 'all .12s',
            }}
          >
            {lib.name}
          </button>
        )
      })}
    </div>
  )
}

/* ── Searchable dropdown, used once the library count exceeds the threshold ── */

function LibraryDropdown({
  libraries, currentId, onSelect, activeColor,
}: {
  libraries: OwnerLibrary[]
  currentId: string
  onSelect: (id: string) => void
  activeColor: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const current = libraries.find(l => l.id === currentId)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return libraries
    return libraries.filter(l => l.name.toLowerCase().includes(q))
  }, [libraries, query])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Focus search input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus()
    else setQuery('')
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative', marginBottom: 16, maxWidth: 320 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, width: '100%', padding: '8px 12px', borderRadius: 10,
          border: `1.5px solid ${open ? activeColor : BORDER}`,
          background: BG_CARD, color: TEXT_PRIMARY,
          fontSize: 13, fontWeight: 600, fontFamily: FONT_BODY,
          cursor: 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current?.name ?? 'Select library'}
        </span>
        <span style={{ fontSize: 10, color: TEXT_MUTED, flexShrink: 0 }}>
          {libraries.length} libraries ▾
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6,
            background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10,
            boxShadow: SHADOW_MD, zIndex: 40, overflow: 'hidden',
          }}
        >
          <div style={{ padding: 8, borderBottom: `1px solid ${BORDER}` }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search libraries…"
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 7,
                border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: FONT_BODY,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '12px 14px', fontSize: 12.5, color: TEXT_MUTED }}>
                No libraries match &ldquo;{query}&rdquo;
              </div>
            )}
            {filtered.map(lib => {
              const active = lib.id === currentId
              return (
                <button
                  key={lib.id}
                  type="button"
                  onClick={() => { onSelect(lib.id); setOpen(false) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '9px 14px', border: 'none',
                    background: active ? ACCENT_LIGHT : 'transparent',
                    color: active ? activeColor : TEXT_PRIMARY,
                    fontSize: 13, fontWeight: active ? 700 : 500,
                    fontFamily: FONT_BODY, cursor: 'pointer',
                  }}
                >
                  {lib.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
