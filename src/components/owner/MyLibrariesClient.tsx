'use client'
import { useState, useTransition, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { OwnerLibrary } from '@/lib/actions/owner'
import {
  toggleLibraryActive,
  updateLibraryInfo,
  getAmenities,
  updateLibraryAmenities,
} from '@/lib/actions/owner'
import {
  uploadLibraryPhoto,
  setCoverPhoto,
  deleteLibraryPhoto,
  getLibraryPhotos as getLibraryPhotosList,
} from '@/lib/actions/library'
import {
  ACCENT, ACCENT_LIGHT, BLUE, BLUE_LIGHT,
  BORDER, BG_CARD, SHADOW_SM, FONT_DISPLAY, FONT_BODY,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
} from '@/lib/constants/theme'
import { fmtCurrency } from '@/lib/utils/format'
import { Toggle, Card, PageHeader, EmptyState, Toast } from '@/components/owner/ui'
import { LIBRARY_STATUS_LABELS } from '@/lib/library-status'
import { useToast } from '@/hooks/useToast'
import { startPlatformSubscription, confirmPlatformSubscriptionCheckout } from '@/lib/actions/platform-subscription'
import { getLibraryGoLiveStatus } from '@/lib/actions/library'
import { useRazorpaySubscriptionCheckout } from '@/hooks/userazorpay'
import Image from 'next/image'

/* ─── constants ─────────────────────────────────────────────── */
const GRADIENTS = [
  'linear-gradient(135deg,#E0E8FF,#C7D4F7)',
  'linear-gradient(135deg,#D4EDD4,#B8DDB8)',
  'linear-gradient(135deg,#F0E8FF,#DDD0F7)',
  'linear-gradient(135deg,#FFE8D4,#F7C7A4)',
  'linear-gradient(135deg,#D4F0FF,#A4D4F7)',
]
const EMOJIS = ['📚', '🌿', '📖', '🏛️', '📗']

const NAV_BTN_STYLE: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
  border: `1.5px solid ${BORDER}`, background: BG_CARD, color: '#3A4A5C',
  cursor: 'pointer', fontFamily: FONT_BODY,
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: `1.5px solid ${BORDER}`, fontSize: 13, color: TEXT_PRIMARY,
  fontFamily: FONT_BODY, background: '#FAFAFA', outline: 'none',
  boxSizing: 'border-box',
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: TEXT_MUTED,
  textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4,
  display: 'block',
}

/* ─── edit modal tabs ────────────────────────────────────────── */
type EditTab = 'info' | 'amenities' | 'photos'

interface EditModalProps {
  lib: OwnerLibrary
  idx: number
  onClose: () => void
  onUpdated: (libId: string, patch: Partial<OwnerLibrary>) => void
  showToast: (msg: string) => void
}

function EditModal({ lib, idx, onClose, onUpdated, showToast }: EditModalProps) {
  const [tab, setTab]             = useState<EditTab>('info')
  const [isPending, start]        = useTransition()

  /* info tab state */
  const [name, setName]           = useState(lib.name)
  const [city, setCity]           = useState(lib.city)
  const [area, setArea]           = useState(lib.area)

  /* amenities tab state */
  const [allAmenities, setAllAmenities] = useState<{ id: string; name: string }[]>([])
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [amenitiesLoaded, setAmenitiesLoaded] = useState(false)

  /* photos tab state */
  const [photos, setPhotos]       = useState<{ id: string; image_url: string; is_cover: boolean }[]>([])
  const [photosLoaded, setPhotosLoaded] = useState(false)
  const fileInputRef              = useRef<HTMLInputElement>(null)
  const coverInputRef             = useRef<HTMLInputElement>(null)

  /* load amenities when tab opens */
  useEffect(() => {
    if (tab === 'amenities' && !amenitiesLoaded) {
      getAmenities(lib.id).then(({ all, selected: sel }) => {
        setAllAmenities(all)
        setSelected(new Set(sel))
        setAmenitiesLoaded(true)
      })
    }
  }, [tab, amenitiesLoaded, lib.id])

  /* load photos when tab opens */
  useEffect(() => {
    if (tab === 'photos' && !photosLoaded) {
      getLibraryPhotosList(lib.id).then(data => {
        // normalise: library.ts returns { id, url, isCover }; local state uses image_url / is_cover
        setPhotos(data.map(p => ({ id: p.id, image_url: p.url, is_cover: p.isCover })))
        setPhotosLoaded(true)
      })
    }
  }, [tab, photosLoaded, lib.id])

  /* ── handlers ── */
  const handleInfoSave = () => {
    if (!name.trim()) return
    start(async () => {
      const res = await updateLibraryInfo(lib.id, { name: name.trim(), city: city.trim(), area: area.trim() })
      if (res.success) {
        onUpdated(lib.id, { name: name.trim(), city: city.trim(), area: area.trim() })
        showToast('Library details saved')
      } 
      if(res.success === false) {
        showToast(res.error ?? 'Failed to save')
      }
    })
  }

  const toggleAmenity = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleAmenitiesSave = () => {
    start(async () => {
      const res = await updateLibraryAmenities(lib.id, [...selected])
      if (res.success) showToast('Amenities updated')
      if(res.success === false) showToast(res.error ?? 'Failed to update amenities')
    })
  }

  const handleSetCover = (photoId: string) => {
    start(async () => {
      const res = await setCoverPhoto(photoId, lib.id)
      if (res.success) {
        setPhotos(prev => prev.map(p => ({ ...p, is_cover: p.id === photoId })))
        const newCover = photos.find(p => p.id === photoId)?.image_url ?? null
        onUpdated(lib.id, { cover_url: newCover })
        showToast('Cover photo updated')
      } 
      if(res.success === false) showToast(res.error ?? 'Failed to update cover')
    })
  }

  const handleDeletePhoto = (photoId: string) => {
    start(async () => {
      const res = await deleteLibraryPhoto(photoId)
      if (res.success) {
        const removed = photos.find(p => p.id === photoId)
        setPhotos(prev => prev.filter(p => p.id !== photoId))
        if (removed?.is_cover) onUpdated(lib.id, { cover_url: null })
        showToast('Photo deleted')
      } 
      if(res.success === false) showToast(res.error ?? 'Failed to delete photo')
    })
  }

  const handleAddPhoto = (e: React.ChangeEvent<HTMLInputElement>, isCover: boolean) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Use FormData so the file is streamed — avoids the 1 MB Server Action body limit
    // that base64 encoding would otherwise hit for typical cover photos.
    const formData = new FormData()
    formData.append('file', file)
    formData.append('libraryId', lib.id)
    formData.append('isCover', isCover ? '1' : '0')
    start(async () => {
      const res = await uploadLibraryPhoto(formData)
      if (res.success && res.data) {
        const newPhoto = { id: res.data.id, image_url: res.data.url, is_cover: res.data.isCover }
        if (res.data.isCover) {
          setPhotos(prev => [newPhoto, ...prev.map(p => ({ ...p, is_cover: false }))])
          onUpdated(lib.id, { cover_url: res.data.url })
        } else {
          setPhotos(prev => [...prev, newPhoto])
        }
        showToast(isCover ? 'Cover photo uploaded' : 'Photo added')
      } 
      if(res.success === false) showToast(res.error ?? 'Upload failed')
    })
    e.target.value = ''
  }

  /* ── trap focus & close on Esc ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: active ? 700 : 500,
    border: 'none', cursor: 'pointer', fontFamily: FONT_BODY,
    background: active ? ACCENT : 'transparent',
    color: active ? '#fff' : TEXT_SECONDARY,
    transition: 'all .15s',
  })

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
          zIndex: 1000, backdropFilter: 'blur(2px)',
        }}
      />

      {/* modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 'min(560px, 95vw)', maxHeight: '88vh',
        background: '#fff', borderRadius: 16, zIndex: 1001,
        boxShadow: '0 24px 80px rgba(0,0,0,.22)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* header */}
        <div style={{
          padding: '20px 24px 0', borderBottom: `1px solid ${BORDER}`,
          background: '#fff', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: FONT_DISPLAY, color: TEXT_PRIMARY }}>
                Edit Library
              </div>
              <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>{lib.name}</div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: '50%', border: `1.5px solid ${BORDER}`,
                background: BG_CARD, cursor: 'pointer', fontSize: 16, color: TEXT_SECONDARY,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >×</button>
          </div>

          {/* tabs */}
          <div style={{ display: 'flex', gap: 4, paddingBottom: 0 }}>
            {(['info', 'amenities', 'photos'] as EditTab[]).map(t => (
              <button key={t} style={TAB_STYLE(tab === t)} onClick={() => setTab(t)}>
                {{ info: '✏️ Info', amenities: '🏷️ Amenities', photos: '📸 Photos' }[t]}
              </button>
            ))}
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* ── INFO TAB ── */}
          {tab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={LABEL_STYLE}>Library Name *</label>
                <input
                  style={INPUT_STYLE}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Sunrise Study Hall"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={LABEL_STYLE}>City</label>
                  <input
                    style={INPUT_STYLE}
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="e.g. Bangalore"
                  />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Area / Locality</label>
                  <input
                    style={INPUT_STYLE}
                    value={area}
                    onChange={e => setArea(e.target.value)}
                    placeholder="e.g. Koramangala"
                  />
                </div>
              </div>
              <div style={{
                padding: '10px 12px', borderRadius: 8,
                background: '#F5F8FF', border: `1px solid #D0DAFE`,
                fontSize: 12, color: '#4A5FA8',
              }}>
                💡 To update address, base price, timings or description, go to the library onboarding flow.
              </div>
            </div>
          )}

          {/* ── AMENITIES TAB ── */}
          {tab === 'amenities' && (
            <div>
              {!amenitiesLoaded ? (
                <div style={{ textAlign: 'center', padding: 40, color: TEXT_MUTED, fontSize: 13 }}>
                  Loading amenities…
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 14 }}>
                    Select all amenities available at this library.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {allAmenities.map(a => {
                      const on = selected.has(a.id)
                      return (
                        <button
                          key={a.id}
                          onClick={() => toggleAmenity(a.id)}
                          style={{
                            padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                            border: `1.5px solid ${on ? ACCENT : BORDER}`,
                            background: on ? ACCENT_LIGHT : BG_CARD,
                            color: on ? ACCENT : TEXT_SECONDARY,
                            cursor: 'pointer', fontFamily: FONT_BODY,
                            transition: 'all .12s',
                          }}
                        >
                          {on ? '✓ ' : ''}{a.name}
                        </button>
                      )
                    })}
                    {allAmenities.length === 0 && (
                      <div style={{ color: TEXT_MUTED, fontSize: 13 }}>
                        No amenities configured. Add them in the amenities master list first.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── PHOTOS TAB ── */}
          {tab === 'photos' && (
            <div>
              {!photosLoaded ? (
                <div style={{ textAlign: 'center', padding: 40, color: TEXT_MUTED, fontSize: 13 }}>
                  Loading photos…
                </div>
              ) : (
                <>
                  {/* upload buttons */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => handleAddPhoto(e, true)} />
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => handleAddPhoto(e, false)} />
                    <button
                      onClick={() => coverInputRef.current?.click()}
                      disabled={isPending}
                      style={{
                        padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        border: `1.5px solid ${ACCENT}`, background: ACCENT_LIGHT,
                        color: ACCENT, cursor: 'pointer', fontFamily: FONT_BODY,
                      }}
                    >
                      🖼 Upload Cover Photo
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isPending}
                      style={{
                        padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        border: `1.5px solid ${BORDER}`, background: BG_CARD,
                        color: TEXT_PRIMARY, cursor: 'pointer', fontFamily: FONT_BODY,
                      }}
                    >
                      + Add Photo
                    </button>
                  </div>

                  {/* photo grid */}
                  {photos.length === 0 ? (
                    <div style={{
                      textAlign: 'center', padding: '32px 0',
                      color: TEXT_MUTED, fontSize: 13, border: `2px dashed ${BORDER}`,
                      borderRadius: 12,
                    }}>
                      No photos yet. Upload a cover photo to get started.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                      {photos.map(photo => (
                        <div
                          key={photo.id}
                          style={{
                            position: 'relative', borderRadius: 10, overflow: 'hidden',
                            border: photo.is_cover ? `2px solid ${ACCENT}` : `1.5px solid ${BORDER}`,
                            background: '#F0F0F0', aspectRatio: '16/9',
                          }}
                        >
                          <img
                            src={photo.image_url}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                          {/* cover badge */}
                          {photo.is_cover && (
                            <div style={{
                              position: 'absolute', top: 6, left: 6,
                              background: ACCENT, color: '#fff',
                              fontSize: 10, fontWeight: 700, padding: '2px 8px',
                              borderRadius: 10,
                            }}>
                              Cover
                            </div>
                          )}
                          {/* hover actions overlay */}
                          <div style={{
                            position: 'absolute', inset: 0,
                            background: 'rgba(0,0,0,.55)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: 8, opacity: 0,
                            transition: 'opacity .15s',
                          }}
                            className="photo-overlay"
                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                          >
                            {!photo.is_cover && (
                              <button
                                onClick={() => handleSetCover(photo.id)}
                                disabled={isPending}
                                style={{
                                  padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                  background: ACCENT, color: '#fff', border: 'none', cursor: 'pointer',
                                }}
                              >
                                Set Cover
                              </button>
                            )}
                            <button
                              onClick={() => handleDeletePhoto(photo.id)}
                              disabled={isPending}
                              style={{
                                padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                background: '#E53935', color: '#fff', border: 'none', cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{
          padding: '14px 24px', borderTop: `1px solid ${BORDER}`,
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          background: '#FAFAFA', flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1.5px solid ${BORDER}`, background: BG_CARD, color: TEXT_SECONDARY,
              cursor: 'pointer', fontFamily: FONT_BODY,
            }}
          >
            Close
          </button>

          {/* only show Save for tabs that have a save action */}
          {tab === 'info' && (
            <button
              onClick={handleInfoSave}
              disabled={isPending || !name.trim()}
              style={{
                padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: ACCENT, color: '#fff', border: 'none',
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? .6 : 1, fontFamily: FONT_DISPLAY,
              }}
            >
              {isPending ? 'Saving…' : 'Save Changes'}
            </button>
          )}
          {tab === 'amenities' && amenitiesLoaded && (
            <button
              onClick={handleAmenitiesSave}
              disabled={isPending}
              style={{
                padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: ACCENT, color: '#fff', border: 'none',
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? .6 : 1, fontFamily: FONT_DISPLAY,
              }}
            >
              {isPending ? 'Saving…' : 'Save Amenities'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN CLIENT COMPONENT  (unchanged logic, edit modal added)
═══════════════════════════════════════════════════════════════ */
export default function MyLibrariesClient({ libraries: initial }: { libraries: OwnerLibrary[] }) {
  const router = useRouter()
  const { toast, showToast } = useToast()
  const [libraries, setLibraries]    = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [editLib, setEditLib]        = useState<{ lib: OwnerLibrary; idx: number } | null>(null)

  const summary = useMemo(() => ({
    totalRev:     libraries.reduce((s, l) => s + l.month_revenue, 0),
    totalMembers: libraries.reduce((s, l) => s + l.member_count,  0),
    avgOcc: libraries.length
      ? Math.round(
          libraries.reduce((s, l) => s + (l.total_seats ? l.active_seats / l.total_seats : 0), 0)
          / libraries.length * 100
        )
      : 0,
  }), [libraries])

  const handleToggle = useCallback((libId: string, newVal: boolean) => {
    startTransition(async () => {
      const res = await toggleLibraryActive(libId, newVal)
      if (res.success) {
        setLibraries(prev => prev.map(l => l.id === libId ? { ...l, is_active: newVal } : l))
        showToast(`Library ${newVal ? 'activated' : 'paused'}`)
        return
      }
      // Turning ON failed — most commonly because the library needs an
      // active platform subscription (see toggleLibraryActive's gating in
      // owner.ts). Detected via the same distinctive substring used in
      // GoLiveClient.tsx, to avoid widening the shared ActionResult type
      // just for this one case.
      if (newVal && res.error.toLowerCase().includes('platform subscription')) {
        setSubscriptionModalLibId(libId)
        return
      }
      // Any other failure (suspended, not yet approved) — surface as a
      // toast rather than silently doing nothing, which is what happened
      // here before this fix.
      showToast(res.error, false)
    })
  }, [showToast])

  const [subscriptionModalLibId, setSubscriptionModalLibId] = useState<string | null>(null)
  const [subPending, startSubTransition] = useTransition()
  const [subMessage, setSubMessage] = useState('')
  const { openSubscriptionCheckout } = useRazorpaySubscriptionCheckout()

  function pollSubscriptionThenActivate(libId: string) {
    let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      const status = await getLibraryGoLiveStatus(libId)
      if (status?.subscriptionActive) {
        clearInterval(interval)
        setSubMessage('')
        setSubscriptionModalLibId(null)
        // Payment confirmed — automatically complete the activation the
        // owner originally asked for, instead of making them toggle again.
        const res = await toggleLibraryActive(libId, true)
        if (res.success) {
          setLibraries(prev => prev.map(l => l.id === libId ? { ...l, is_active: true } : l))
          showToast('Payment received — library is now active')
        } else {
          showToast(res.error, false)
        }
        return
      }
      if (attempts >= 10) { clearInterval(interval); setSubMessage('Still confirming with Razorpay — check back in a moment.') }
    }, 3000)
  }

  function handleStartSubscription(libId: string) {
    setSubMessage('')
    startSubTransition(async () => {
      const res = await startPlatformSubscription(libId)
      if (res.success === false) { showToast(res.error, false); return }

      openSubscriptionCheckout({
        subscriptionId: res.data.razorpaySubscriptionId,
        keyId: res.data.keyId,
        name: 'seatspace',
        description: '₹399/month platform subscription',
        prefill: res.data.prefill,
        onSuccess: async (paymentId, subscriptionId, signature) => {
          await confirmPlatformSubscriptionCheckout({
            razorpaySubscriptionId: subscriptionId,
            razorpayPaymentId: paymentId,
            razorpaySignature: signature,
          })
          setSubMessage('Mandate authorized — confirming with Razorpay, this can take a few seconds…')
          pollSubscriptionThenActivate(libId)
        },
        onDismiss: () => { showToast('Subscription setup was not completed — you can try again anytime', false) },
        onError:   (msg) => { showToast(msg, false) },
      })
    })
  }

  const handleLibraryUpdated = useCallback((libId: string, patch: Partial<OwnerLibrary>) => {
    setLibraries(prev => prev.map(l => l.id === libId ? { ...l, ...patch } : l))
  }, [])

  const navigate = useCallback((href: string) => {
    ;(window as any).__startNavProgress?.()
    router.push(href)
  }, [router])

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      <Toast toast={toast} />

      {/* Blocking modal: subscription payment required before a library
          can be activated via the toggle. Library stays at is_active=false
          — toggleLibraryActive() never flips it without an active
          subscription (see owner.ts + the DB-level trigger backing it). */}
      {subscriptionModalLibId && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(10,13,18,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
          onClick={() => { if (!subPending) setSubscriptionModalLibId(null) }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 400, background: '#FDFCF9', borderRadius: 18,
              padding: '28px 24px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,.3)',
            }}
          >
            <div style={{ fontSize: 44, marginBottom: 12 }}>💳</div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 20, color: TEXT_PRIMARY, marginBottom: 8 }}>
              Subscription payment required
            </h2>
            <p style={{ fontSize: 13.5, color: TEXT_SECONDARY, lineHeight: 1.6, marginBottom: subMessage ? 10 : 22 }}>
              Please complete payment to make this library active. It stays exactly as it is — nothing is lost — it just won't be visible to students until your ₹399/month subscription is set up.
            </p>
            {subMessage && (
              <p style={{ fontSize: 12.5, color: ACCENT, lineHeight: 1.5, marginBottom: 18 }}>{subMessage}</p>
            )}
            <button
              onClick={() => handleStartSubscription(subscriptionModalLibId)}
              disabled={subPending || !!subMessage}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 10, fontSize: 15,
                fontWeight: 700, fontFamily: FONT_DISPLAY, border: 'none',
                background: ACCENT, color: '#fff', cursor: (subPending || subMessage) ? 'default' : 'pointer',
                boxShadow: '0 4px 16px rgba(13,124,84,.3)', marginBottom: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: (subPending || subMessage) ? 0.7 : 1,
              }}
            >
              {subPending && <span style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin .65s linear infinite' }} />}
              {subMessage ? 'Confirming…' : subPending ? 'Opening checkout…' : 'Subscribe — ₹399/month'}
            </button>
            <button
              onClick={() => setSubscriptionModalLibId(null)}
              disabled={subPending}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 10, fontSize: 13.5,
                fontWeight: 600, fontFamily: FONT_BODY, border: 'none',
                background: 'transparent', color: TEXT_MUTED, cursor: 'pointer',
              }}
            >
              Maybe later
            </button>
          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* edit modal */}
      {editLib && (
        <EditModal
          lib={editLib.lib}
          idx={editLib.idx}
          onClose={() => setEditLib(null)}
          onUpdated={handleLibraryUpdated}
          showToast={showToast}
        />
      )}

      <PageHeader
        title="My Libraries"
        subtitle="All your registered libraries"
        action={
          <button
            onClick={() => navigate('/onboarding/add-library')}
            style={{
              padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700,
              background: ACCENT, color: '#fff', border: 'none', cursor: 'pointer',
              fontFamily: FONT_DISPLAY, boxShadow: '0 2px 10px rgba(13,124,84,.25)',
            }}
          >
            + Add New Library
          </button>
        }
      />

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Libraries',     value: String(libraries.length)          },
          { label: 'This Month',    value: fmtCurrency(summary.totalRev)     },
          { label: 'Members',       value: String(summary.totalMembers)       },
          { label: 'Avg Occupancy', value: `${summary.avgOcc}%`              },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: BG_CARD, border: `1px solid ${BORDER}`,
            borderRadius: 12, padding: '14px 16px', boxShadow: SHADOW_SM,
          }}>
            <div style={{ fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: FONT_DISPLAY, color: TEXT_PRIMARY }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Library cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {libraries.length === 0 ? (
          <Card>
            <EmptyState
              icon="🏛️"
              title="No libraries yet"
              subtitle="Add your first library to get started"
              action={
                <button
                  onClick={() => navigate('/onboarding/add-library')}
                  style={{
                    padding: '10px 20px', borderRadius: 9, fontSize: 14, fontWeight: 700,
                    background: ACCENT, color: '#fff', border: 'none', cursor: 'pointer',
                    fontFamily: FONT_DISPLAY,
                  }}
                >
                  + Add Library
                </button>
              }
            />
          </Card>
        ) : libraries.map((lib, idx) => (
          <Card key={lib.id} hoverable padding="18px 20px">
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {/* Cover / icon */}
              <div style={{
                width: 64, height: 64, borderRadius: 12, flexShrink: 0,
                background: lib.cover_url
                  ? `url(${lib.cover_url}) center/cover`
                  : GRADIENTS[idx % GRADIENTS.length],
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
              }}>
                {!lib.cover_url && EMOJIS[idx % EMOJIS.length]}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY }}>{lib.name}</span>
                  <span style={{
                    padding: '2px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                    background: LIBRARY_STATUS_LABELS[lib.display_status].bg,
                    color: LIBRARY_STATUS_LABELS[lib.display_status].color,
                  }}>
                    {LIBRARY_STATUS_LABELS[lib.display_status].label}
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: TEXT_MUTED }}>{lib.is_active ? 'Active' : 'Paused'}</span>
                    <Toggle
                      on={lib.is_active}
                      onChange={v => handleToggle(lib.id, v)}
                      disabled={isPending}
                    />
                  </div>
                </div>

                {/* Proactive status banner — shown immediately on page load,
                    no need to click the toggle first to discover why a
                    library isn't live. Simpler and more reliable than a
                    reminder notification: no cron/infra dependency, works
                    the instant the owner is actually looking at this page. */}
                {(lib.display_status === 'payment_pending' || lib.display_status === 'expired') && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    background: '#FEF3E2', border: '1px solid rgba(146,64,14,.18)',
                    borderRadius: 10, padding: '8px 12px', marginBottom: 10,
                  }}>
                    <span style={{ fontSize: 12, color: '#92400E', flex: 1, minWidth: 160 }}>
                      {lib.display_status === 'expired'
                        ? 'Subscription expired — renew to go live again'
                        : 'Platform subscription payment pending to make this library active'}
                    </span>
                    <button
                      onClick={() => setSubscriptionModalLibId(lib.id)}
                      style={{
                        padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        fontFamily: FONT_DISPLAY, border: 'none', background: ACCENT, color: '#fff',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      Pay ₹399/month
                    </button>
                  </div>
                )}
                {lib.display_status === 'pending_approval' && (
                  <div style={{
                    background: '#DBEAFE', border: '1px solid rgba(29,78,216,.18)',
                    borderRadius: 10, padding: '8px 12px', marginBottom: 10,
                  }}>
                    <span style={{ fontSize: 12, color: '#1D4ED8' }}>
                      Payment received — awaiting admin approval before this library goes live
                    </span>
                  </div>
                )}
                {lib.display_status === 'suspended' && (
                  <div style={{
                    background: '#FFEDD5', border: '1px solid rgba(124,45,18,.18)',
                    borderRadius: 10, padding: '8px 12px', marginBottom: 10,
                  }}>
                    <span style={{ fontSize: 12, color: '#7C2D12' }}>
                      Suspended by platform admin — contact support to resolve
                    </span>
                  </div>
                )}

                <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 12 }}>
                  📍 {[lib.area, lib.city].filter(Boolean).join(', ')}
                </div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Seats',         value: `${lib.active_seats}/${lib.total_seats}` },
                    { label: 'Revenue/month', value: fmtCurrency(lib.month_revenue), color: BLUE },
                    { label: 'Members',       value: String(lib.member_count) },
                    { label: 'Staff',         value: String(lib.staff_count)  },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? TEXT_PRIMARY }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                {/* ← NEW Edit button */}
                <button
                  onClick={() => setEditLib({ lib, idx })}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: `1.5px solid ${ACCENT}`, background: ACCENT_LIGHT,
                    color: ACCENT, cursor: 'pointer', fontFamily: FONT_BODY,
                  }}
                >
                  ✏️ Edit
                </button>
                <button onClick={() => navigate(`/dashboard/seat-manager?lib=${lib.id}`)} style={NAV_BTN_STYLE}>
                  Seat Manager
                </button>
                <button onClick={() => navigate(`/dashboard/slot-config?lib=${lib.id}`)} style={NAV_BTN_STYLE}>
                  Slot Config
                </button>
                <button
                  onClick={() => navigate(`/dashboard?lib=${lib.id}`)}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: 'none', background: ACCENT, color: '#fff',
                    cursor: 'pointer', fontFamily: FONT_DISPLAY,
                  }}
                >
                  Dashboard →
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}