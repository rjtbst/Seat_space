// src/components/owner/LibraryPhotosClient.tsx
'use client'

import { useState, useRef, useTransition, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { uploadLibraryPhoto, deleteLibraryPhoto, setCoverPhoto, getLibraryPhotos } from '@/lib/actions/library'
import Image from 'next/image'

const ACCENT       = '#0D7C54'
const ACCENT_LIGHT = '#D1FAE5'
const ACCENT_DARK  = '#0A5E3F'

/* ─── Steps ─────────────────────────────────────────────────── */
function Steps() {
  // Library setup is 3 steps (Library -> Photos -> Go Live), separate
  // from account onboarding (Role -> Profile -> WhatsApp, already
  // complete by the time an owner reaches this evergreen page — see
  // AUTH_ONBOARDING_AUDIT.md). This used to show a stale 6-step
  // "Phone -> OTP -> Profile -> Library -> Photos -> Go Live" sequence
  // from before the Google/email + WhatsApp-verification auth refactor.
  const steps = [
    { label: 'Library', done: true  },
    { label: 'Photos',  done: false, active: true },
    { label: 'Go Live', done: false },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 32 }}>
      {steps.map((s, i) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700,
              background: s.done || s.active ? ACCENT : '#E2DDD4',
              color:      s.done || s.active ? '#fff'  : '#9AAAB8',
              boxShadow:  s.active ? `0 0 0 3px ${ACCENT_LIGHT}` : 'none',
            }}>
              {s.done ? '✓' : i + 1}
            </div>
            <span style={{
              fontSize: 9, fontWeight: s.active ? 700 : 500,
              color: s.active ? ACCENT : s.done ? '#3A4A5C' : '#9AAAB8',
              letterSpacing: '.02em',
            }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: 28, height: 2, background: s.done ? ACCENT : '#E2DDD4', margin: '0 3px', marginBottom: 18 }} />
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── Types ─────────────────────────────────────────────────── */
type Photo = {
  id:         string    // library_images row id
  url:        string    // permanent public URL (from DB / storage)
  isCover:    boolean
  previewUrl: string    // local blob URL for instant display (same as url for restored photos)
}

/* ─── Drop Zone ─────────────────────────────────────────────── */
function DropZone({ label, hint, onFiles, children, aspect }: {
  label: string; hint: string
  onFiles: (files: FileList) => void
  children?: React.ReactNode
  aspect?: string
}) {
  const [over, setOver] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <div
        onClick={() => ref.current?.click()}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files) }}
        style={{
          border: `2px dashed ${over ? ACCENT : '#E2DDD4'}`,
          borderRadius: 12, padding: children ? 0 : 32,
          textAlign: 'center', cursor: 'pointer',
          background: over ? ACCENT_LIGHT : '#F9F8F5',
          transition: 'all .15s', aspectRatio: aspect,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', position: 'relative',
        }}
      >
        {children ?? (
          <div>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3A4A5C' }}>Click to upload or drag & drop</div>
            <div style={{ fontSize: 11, color: '#9AAAB8', marginTop: 4 }}>{hint}</div>
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.length) onFiles(e.target.files) }}
      />
    </div>
  )
}

/* ─── Page ──────────────────────────────────────────────────── */
export default function LibraryPhotosClient() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const libraryId    = searchParams.get('id') ?? ''

  const [cover,        setCover]        = useState<Photo | null>(null)
  const [extras,       setExtras]       = useState<Photo[]>([])
  const [uploading,    setUploading]    = useState<string | null>(null)
  const [loadingPhotos, setLoadingPhotos] = useState(true)
  const [error,        setError]        = useState('')
  const [isPending,    startTransition] = useTransition()

  /* ── On mount: restore already-uploaded photos from DB ── */
  useEffect(() => {
    if (!libraryId) { setLoadingPhotos(false); return }
    getLibraryPhotos(libraryId).then(rows => {
      rows.forEach(row => {
        const photo: Photo = { id: row.id, url: row.url, isCover: row.isCover, previewUrl: row.url }
        if (row.isCover) {
          setCover(photo)
        } else {
          setExtras(prev => [...prev, photo])
        }
      })
      setLoadingPhotos(false)
    })
  }, [libraryId])

  /* ── Upload ── */
  const upload = useCallback(async (file: File, isCover: boolean, slotKey: string) => {
    setUploading(slotKey)
    setError('')
    const fd = new FormData()
    fd.append('file',      file)
    fd.append('libraryId', libraryId)
    fd.append('isCover',   isCover ? '1' : '0')

    const res = await uploadLibraryPhoto(fd)
    setUploading(null)
    if (res.success === false) { setError(res.error); return }

    const photo: Photo = {
      id:         res.data.id,
      url:        res.data.url,
      isCover:    res.data.isCover,
      previewUrl: URL.createObjectURL(file),
    }

    if (res.data.isCover) {
      setCover(photo)
    } else {
      setExtras(prev => {
        const idx = parseInt(slotKey.replace('extra-', ''), 10)
        const next = [...prev]
        next[idx] = photo
        return next
      })
    }
  }, [libraryId])

  /* ── Make cover ── */
  const makeCover = async (photo: Photo) => {
    // Optimistic update
    if (cover) setExtras(prev => [...prev, { ...cover, isCover: false }])
    setCover({ ...photo, isCover: true })
    setExtras(prev => prev.filter(p => p.id !== photo.id))
    await setCoverPhoto(photo.id, libraryId)
  }

  /* ── Delete ── */
  const remove = async (photo: Photo, isExtra: boolean, idx?: number) => {
    await deleteLibraryPhoto(photo.id)
    if (!isExtra) {
      setCover(null)
      // If there are gallery photos, auto-promote the first as cover (mirrors server logic)
      if (extras.length > 0) {
        const [next, ...rest] = extras
        setCover({ ...next, isCover: true })
        setExtras(rest)
      }
    } else {
      setExtras(prev => prev.filter((_, i) => i !== idx))
    }
  }

  const canContinue = !!cover

  /* ── Loading skeleton ── */
  if (loadingPhotos) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg,#F4F7FB 0%,#EDE8DC 100%)',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${ACCENT_LIGHT}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin .65s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, color: '#6B7689' }}>Loading your photos…</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,#F4F7FB 0%,#EDE8DC 100%)',
      fontFamily: 'DM Sans, sans-serif', padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <Steps />

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: '0 4px 18px rgba(13,124,84,.32)', fontSize: 24,
          }}>📸</div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 26, color: '#0A0D12', letterSpacing: '-0.04em', marginBottom: 6 }}>
            Upload library photos
          </h1>
          <p style={{ fontSize: 14, color: '#6B7689', fontWeight: 300, lineHeight: 1.5, margin: 0 }}>
            Step 2 of 3 — Good photos increase bookings by 3×
          </p>
        </div>

        <div style={{ background: '#FDFCF9', border: '1px solid #E2DDD4', borderRadius: 20, padding: '28px 28px 24px', boxShadow: '0 4px 28px rgba(10,13,18,.08)' }}>

          {/* Info banner */}
          <div style={{ background: ACCENT_LIGHT, border: `1px solid rgba(13,124,84,.2)`, borderRadius: 12, padding: '12px 14px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
            <p style={{ fontSize: 13, color: '#0A5E3F', margin: 0, lineHeight: 1.5 }}>
              Upload at least 1 cover photo to go live. Aim for <strong>4+ photos</strong> — main hall, entrance, seating area, amenities. JPG/PNG/WebP, max 10 MB each.
            </p>
          </div>

          {/* Cover photo slot */}
          <div style={{ marginBottom: 24 }}>
            <DropZone
              label="Cover photo *"
              hint="JPG, PNG, WebP · Max 10 MB · Recommended 1200×800 px"
              onFiles={files => upload(files[0], true, 'cover')}
              aspect="16/9"
            >
              {uploading === 'cover' ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 28, height: 28, border: `3px solid ${ACCENT_LIGHT}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin .65s linear infinite', margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 12, color: '#6B7689' }}>Uploading…</div>
                </div>
              ) : cover ? (
                <>
                  <img src={cover.previewUrl} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    onClick={e => { e.stopPropagation(); remove(cover, false) }}
                    style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: '#C5282C', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >×</button>
                  <div style={{ position: 'absolute', bottom: 8, left: 8, background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, letterSpacing: '.04em' }}>
                    COVER
                  </div>
                </>
              ) : null}
            </DropZone>
          </div>

          {/* Additional photos */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 8 }}>
              Additional photos <span style={{ color: '#9AAAB8', fontWeight: 400 }}>(up to 8)</span>
              <span style={{ color: '#9AAAB8', fontWeight: 400, marginLeft: 6 }}>— tap any photo to make it the cover</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {/* Uploaded extra slots */}
              {extras.map((photo, idx) => (
                <div key={photo.id} style={{ aspectRatio: '1', borderRadius: 10, overflow: 'hidden', position: 'relative', background: '#E2DDD4', cursor: 'pointer' }}>
                  <Image
  src={photo.previewUrl}
  alt=""
  fill
  className="object-cover"
  onClick={() => makeCover(photo)}
  title="Tap to make cover"
/>
                  {/* Make cover overlay on hover */}
                  <div
                    onClick={() => makeCover(photo)}
                    style={{ position: 'absolute', inset: 0, background: 'rgba(13,124,84,.0)', display: 'flex', alignItems: 'flex-end', padding: 4, transition: 'background .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(13,124,84,.35)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(13,124,84,.0)')}
                  >
                    <span style={{ fontSize: 9, color: '#fff', fontWeight: 700, opacity: 0, transition: 'opacity .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                    >
                      Make cover
                    </span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); remove(photo, true, idx) }}
                    style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: '#C5282C', border: 'none', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                  >×</button>
                </div>
              ))}

              {/* Uploading slot */}
              {uploading?.startsWith('extra-') && (
                <div style={{ aspectRatio: '1', borderRadius: 10, background: ACCENT_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 20, height: 20, border: `2px solid ${ACCENT_LIGHT}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin .65s linear infinite' }} />
                </div>
              )}

              {/* Empty slots */}
              {extras.length < 8 && Array.from({
                length: Math.min(8 - extras.length - (uploading?.startsWith('extra-') ? 1 : 0), 8),
              }).map((_, i) => (
                <label key={`empty-${i}`} style={{
                  aspectRatio: '1', borderRadius: 10,
                  border: '2px dashed #E2DDD4', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, color: '#9AAAB8', cursor: 'pointer',
                  background: '#F9F8F5', transition: 'all .15s',
                }}>
                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                    onChange={e => {
                      if (e.target.files?.[0])
                        upload(e.target.files[0], false, `extra-${extras.length + i}`)
                    }}
                  />
                  +
                </label>
              ))}
            </div>
          </div>

          {/* Photo count badge */}
          {(cover || extras.length > 0) && (
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: '#6B7689' }}>
                {(cover ? 1 : 0) + extras.length} photo{((cover ? 1 : 0) + extras.length) !== 1 ? 's' : ''} uploaded
                {(cover ? 1 : 0) + extras.length >= 4 && <span style={{ color: ACCENT, marginLeft: 6 }}>✓ Great selection!</span>}
              </span>
            </div>
          )}

          {error && (
            <div style={{ background: '#FDEAEA', border: '1px solid rgba(212,43,43,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 8 }}>
              <span>⚠️</span>
              <p style={{ fontSize: 13, color: '#9B1C1C', margin: 0 }}>{error}</p>
            </div>
          )}

          <div style={{ height: 1, background: '#E2DDD4', margin: '4px 0 20px' }} />

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => router.push(`/onboarding/add-library?id=${libraryId}`)}
              style={{
                flex: 1, padding: '13px 0', borderRadius: 10, fontSize: 14, fontWeight: 600,
                fontFamily: 'DM Sans, sans-serif', border: '1.5px solid #E2DDD4',
                background: '#FDFCF9', color: '#3A4A5C', cursor: 'pointer',
              }}
            >
              ← Back
            </button>
            <button
              onClick={() => startTransition(() => router.push(`/onboarding/go-live?id=${libraryId}`))}
              disabled={!canContinue || isPending}
              style={{
                flex: 2, padding: '13px 0', borderRadius: 10, fontSize: 15,
                fontWeight: 700, fontFamily: 'Syne, sans-serif', border: 'none',
                background: canContinue ? ACCENT : '#C8D4C8', color: '#fff',
                cursor: canContinue ? 'pointer' : 'not-allowed',
                boxShadow: canContinue ? '0 4px 16px rgba(13,124,84,.3)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
              onMouseEnter={e => { if (canContinue) e.currentTarget.style.background = ACCENT_DARK }}
              onMouseLeave={e => { if (canContinue) e.currentTarget.style.background = ACCENT }}
            >
              {isPending && <span style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin .65s linear infinite' }} />}
              {isPending ? 'Saving…' : 'Save & Continue →'}
            </button>
          </div>

          {!canContinue && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#9AAAB8', marginTop: 12 }}>
              Upload at least one cover photo to continue
            </p>
          )}
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}