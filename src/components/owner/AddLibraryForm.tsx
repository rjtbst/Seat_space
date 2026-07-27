'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createLibrary, updateLibrary } from '@/lib/actions/library'
import type { LibraryForEdit } from '@/lib/actions/library'
import { STATE_CITY_MAP } from '@/lib/config'
import LocationPicker from '@/components/owner/LocationPicker'

/* ─── Design tokens ─────────────────────────────────────────── */
const ACCENT       = '#0D7C54'
const ACCENT_LIGHT = '#D1FAE5'
const DRAFT_KEY    = 'ls_draft_library_new'

/* ─── Emoji map for amenity names ───────────────────────────── */
const AMENITY_EMOJI: Record<string, string> = {
  'WiFi':          '📶',
  'AC':            '❄️',
  'Quiet Zone':    '🔇',
  'Power Sockets': '🔌',
  'Parking':       '🚗',
  'Cafeteria':     '☕',
  'Washroom':      '🚽',
  'Locker':        '🔐',
  'Printing':      '🖨️',
  'CCTV':          '📹',
  'Power Backup':  '⚡',
  'Water':         '💧',
  'Study Room':    '📖',
}

export type AmenityOption = { id: string; name: string }

/* ─── Form state ────────────────────────────────────────────── */
type FormState = {
  name:        string
  state:       string
  city:        string
  area:        string
  address:     string
  description: string
  
  amenityIds:  string[]    // UUIDs
  lat:         number | null
  lng:         number | null
}

/* ─── Props ─────────────────────────────────────────────────── */
interface Props {
  libraryId:       string | null
  existingLibrary: LibraryForEdit | null
  profileState:    string
  profileCity:     string
  amenities:       AmenityOption[]   // full list from DB, passed by server page
}

/* ─── Steps indicator ───────────────────────────────────────── */
function Steps() {
  // See LibraryPhotosClient.tsx for why this is a 3-step library-setup
  // wizard, not the old 6-step account-onboarding sequence.
  const steps = [
    { label: 'Library', done: false, active: true },
    { label: 'Photos',  done: false },
    { label: 'Go Live', done: false },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
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
            }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{
              width: 28, height: 2,
              background: s.done ? ACCENT : '#E2DDD4',
              margin: '0 3px', marginBottom: 18,
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── Shared input style ────────────────────────────────────── */
const inpBase: React.CSSProperties = {
  width: '100%', padding: '11px 13px',
  border: '1.5px solid #E2DDD4', borderRadius: 10,
  fontSize: 14, color: '#0A0D12', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', background: '#FDFCF9',
  boxSizing: 'border-box', transition: 'border-color .15s, box-shadow .15s',
  appearance: 'none' as const,
}

/* ─── Field wrapper ─────────────────────────────────────────── */
function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: ACCENT, marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <p style={{ fontSize: 11, color: '#9AAAB8', marginTop: 4, marginBottom: 0 }}>{hint}</p>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function AddLibraryForm({
  libraryId, existingLibrary, profileState, profileCity, amenities,
}: Props) {
  const router    = useRouter()
  const isEditing = !!libraryId

  /* ── Build initial form state ── */
  const buildInitialForm = useCallback((): FormState => {
    if (existingLibrary) {
      return {
        name:        existingLibrary.name,
        state:       existingLibrary.state,
        city:        existingLibrary.city,
        area:        existingLibrary.area,
        address:     existingLibrary.address,
        description: existingLibrary.description ?? '',
       
        amenityIds:  existingLibrary.amenityIds,
        lat:         existingLibrary.latitude,
        lng:         existingLibrary.longitude,
      }
    }

    // New library: try localStorage draft first
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null
      if (raw) {
        const draft = JSON.parse(raw) as Partial<FormState>
        return {
          name:        draft.name        ?? '',
          state:       draft.state       ?? profileState ?? '',
          city:        draft.city        ?? (draft.state === profileState ? profileCity : '') ?? '',
          area:        draft.area        ?? '',
          address:     draft.address     ?? '',
          description: draft.description ?? '',
       
          amenityIds:  draft.amenityIds  ?? [],
          lat:         draft.lat         ?? null,
          lng:         draft.lng         ?? null,
        }
      }
    } catch { /* ignore */ }

    // No draft: pre-fill from owner profile
    return {
      name:        '',
      state:       profileState,
      city:        profileCity,
      area:        '',
      address:     '',
      description: '',
  
      amenityIds:  [],
      lat:         null,
      lng:         null,
    }
  }, [existingLibrary, profileState, profileCity])

  const [form,      setForm]         = useState<FormState>(buildInitialForm)
  const [error,     setError]        = useState('')
  const [isPending, startTransition] = useTransition()

  const patch = useCallback((partial: Partial<FormState>) =>
    setForm(prev => ({ ...prev, ...partial })), [])

  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = ACCENT
    e.target.style.boxShadow   = `0 0 0 3px ${ACCENT_LIGHT}`
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = '#E2DDD4'
    e.target.style.boxShadow   = 'none'
  }

  /* ── Persist draft on every change (new library only) ── */
  useEffect(() => {
    if (isEditing) return
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)) } catch { /* ignore */ }
  }, [form, isEditing])

  /* ── Amenity toggle ── */
  const toggleAmenity = (id: string) =>
    patch({
      amenityIds: form.amenityIds.includes(id)
        ? form.amenityIds.filter(a => a !== id)
        : [...form.amenityIds, id],
    })

  /* ── Validation — compute missing fields for user feedback ── */
  type MissingField = { key: string; label: string }
  const missingFields: MissingField[] = []
  if (form.name.trim().length < 2)       missingFields.push({ key: 'name',        label: 'Library name (min 2 chars)' })
  if (!form.state)                        missingFields.push({ key: 'state',       label: 'State' })
  if (!form.city)                         missingFields.push({ key: 'city',        label: 'City' })
  if (form.area.trim().length < 1)        missingFields.push({ key: 'area',        label: 'Area / Locality' })
  if (form.address.trim().length < 5)     missingFields.push({ key: 'address',     label: 'Full address (min 5 chars)' })
  if (!form.lat || !form.lng)             missingFields.push({ key: 'location',    label: 'Pin location on map' })
  
  if (form.amenityIds.length === 0)       missingFields.push({ key: 'amenities',   label: 'At least one amenity' })
  const valid = missingFields.length === 0

  /* Track whether user has attempted submit (to show warnings) */
  const [attempted, setAttempted] = useState(false)

  /* ── Submit ── */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setAttempted(true)
    if (!valid) return
    setError('')
    startTransition(async () => {
      const payload = {
        name:                form.name.trim(),
        state:               form.state,
        city:                form.city,
        area:                form.area.trim(),
        address:             form.address.trim(),
        description:         form.description.trim() || undefined,
        amenity_ids:         form.amenityIds,
        latitude:            form.lat,
        longitude:           form.lng,
      }

      const res = isEditing
        ? await updateLibrary(libraryId!, payload)
        : await createLibrary(payload)
  console.log("response ", res)
      if (res.success === false) { setError(res.error); return }

      try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      router.push(`/onboarding/library-photos?id=${res.data.libraryId}`)
    })
  }

  const cities = form.state ? (STATE_CITY_MAP[form.state] ?? []) : []

  /* ══════════════════════════════════════════════════════════ */
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,#F4F7FB 0%,#EDE8DC 100%)',
      fontFamily: 'DM Sans, sans-serif', padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <Steps />

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: '0 4px 18px rgba(13,124,84,.32)', fontSize: 24,
          }}>📚</div>
          <h1 style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 26,
            color: '#0A0D12', letterSpacing: '-0.04em', marginBottom: 6,
          }}>
            {isEditing ? 'Edit your library' : 'Register your library'}
          </h1>
          <p style={{ fontSize: 14, color: '#6B7689', fontWeight: 300 }}>
            Step 1 of 3 — Basic information
          </p>
          {!isEditing && (
            <p style={{ fontSize: 11, color: ACCENT, marginTop: 6 }}>✦ Draft auto-saved as you type</p>
          )}
        </div>

        {/* Card */}
        <div style={{
          background: '#FDFCF9', border: '1px solid #E2DDD4',
          borderRadius: 20, padding: '28px 28px 24px',
          boxShadow: '0 4px 28px rgba(10,13,18,.08)',
        }}>
          <form onSubmit={handleSubmit}>

            {/* Library name */}
            <Field label="Library name" required>
              <input
                type="text" autoFocus placeholder="e.g. Silence Study Hub"
                value={form.name} onChange={e => patch({ name: e.target.value })}
                style={inpBase} onFocus={onFocus} onBlur={onBlur}
              />
            </Field>

              {/* Description */}
            <Field label="Library description" hint="Brief intro shown to students on your listing page.">
              <textarea
                placeholder="e.g. A quiet, air-conditioned study space with high-speed WiFi and individual desks."
                value={form.description} onChange={e => patch({ description: e.target.value })}
                rows={3} style={{ ...inpBase, resize: 'vertical', minHeight: 80 }}
                onFocus={onFocus as any} onBlur={onBlur as any}
              />
            </Field>

            {/* State + City */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="State" required>
                <select
                  value={form.state}
                  onChange={e => patch({ state: e.target.value, city: '' })}
                  style={{ ...inpBase, cursor: 'pointer' }} onFocus={onFocus} onBlur={onBlur}
                >
                  <option value="">Select state</option>
                  {Object.keys(STATE_CITY_MAP).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="City" required>
                <select
                  value={form.city}
                  onChange={e => patch({ city: e.target.value })}
                  disabled={!form.state}
                  style={{
                    ...inpBase,
                    cursor:  form.state ? 'pointer'      : 'not-allowed',
                    opacity: form.state ? 1              : 0.55,
                  }}
                  onFocus={onFocus} onBlur={onBlur}
                >
                  <option value="">{form.state ? 'Select city' : 'Select state first'}</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            {/* Profile pre-fill hint */}
            {!isEditing && profileState && form.state === profileState && (
              <p style={{ fontSize: 11, color: ACCENT, marginTop: -10, marginBottom: 14 }}>
                ✦ Pre-filled from your profile — change if needed
              </p>
            )}

            {/* Area */}
            <Field label="Area / Locality" required>
              <input
                type="text" placeholder="e.g. Civil Lines"
                value={form.area} onChange={e => patch({ area: e.target.value })}
                style={inpBase} onFocus={onFocus} onBlur={onBlur}
              />
            </Field>

            {/* Full address */}
            <Field label="Full address" required>
              <textarea
                placeholder="Shop No., Street, Landmark"
                value={form.address} onChange={e => patch({ address: e.target.value })}
                rows={3} style={{ ...inpBase, resize: 'vertical', minHeight: 80 }}
                onFocus={onFocus as any} onBlur={onBlur as any}
              />
            </Field>

          

          

            {/* Location picker — required for Near Me search */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 6 }}>
                Pin location on map
                <span style={{ color: ACCENT, marginLeft: 2 }}>*</span>
                <span style={{ color: '#9AAAB8', fontWeight: 400, marginLeft: 4, fontSize: 11 }}>(enables Near Me search for students)</span>
              </label>
              <LocationPicker
                lat={form.lat} lng={form.lng}
                onChange={(newLat, newLng) => patch({ lat: newLat, lng: newLng })}
              />
              {form.lat && form.lng && (
                <p style={{ fontSize: 11, color: ACCENT, marginTop: 5 }}>
                  📍 Pinned at {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
                </p>
              )}
            </div>

        

            {/* Amenities — driven by DB list, keyed by UUID */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#3A4A5C', display: 'block', marginBottom: 4 }}>
                Amenities available <span style={{ color: ACCENT }}>*</span>
              </label>
              <p style={{ fontSize: 11, color: '#9AAAB8', marginTop: 0, marginBottom: 8 }}>
                Select at least one
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {amenities.map(({ id, name }) => {
                  const selected = form.amenityIds.includes(id)
                  const emoji    = AMENITY_EMOJI[name] ?? '✦'
                  return (
                    <button className="press"
                      key={id} type="button"
                      onClick={() => toggleAmenity(id)}
                      style={{
                        padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                        border:     `1.5px solid ${selected ? ACCENT : '#E2DDD4'}`,
                        background: selected ? ACCENT_LIGHT : '#FDFCF9',
                        color:      selected ? ACCENT       : '#6B7689',
                        transition: 'all .15s',
                      }}
                    >
                      {emoji} {name}
                    </button>
                  )
                })}
              </div>
            </div>

         

            {/* Payout details now collected separately during the platform
                subscription / go-live step, not here — a library no longer
                needs a Razorpay linked account at creation time. */}
            <div style={{
              background: '#F4F7FB', border: '1px solid #E2DDD4',
              borderRadius: 10, padding: '10px 14px', marginBottom: 16,
              fontSize: 12, color: '#6B7689',
            }}>
              💡 You'll set up your bank account / UPI for payouts and your platform subscription in a later step, right before going live.
            </div>

            <div style={{ height: 1, background: '#E2DDD4', margin: '8px 0 20px' }} />

            {/* Validation warnings — shown after first submit attempt or if any field has been touched */}
            {attempted && !valid && (
              <div style={{
                background: '#FFFBEB', border: '1px solid rgba(217,119,6,.25)',
                borderRadius: 10, padding: '12px 14px', marginBottom: 16,
              }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#92400E', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⚠️ Complete these fields to continue:
                </p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {missingFields.map(f => (
                    <li key={f.key} style={{ fontSize: 12, color: '#B45309', marginBottom: 3 }}>
                      {f.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Always-visible subtle hint when button is disabled and not yet attempted */}
            {!attempted && !valid && (
              <p style={{ fontSize: 11, color: '#9AAAB8', textAlign: 'center', marginBottom: 12 }}>
                Fill in all required fields (<span style={{ color: ACCENT }}>*</span>) to enable Save &amp; Continue
              </p>
            )}

            {/* Error banner */}
            {error && (
              <div style={{
                background: '#FDEAEA', border: '1px solid rgba(212,43,43,.2)',
                borderRadius: 10, padding: '10px 14px', marginBottom: 16,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <span style={{ flexShrink: 0 }}>⚠️</span>
                <p style={{ fontSize: 13, color: '#9B1C1C', margin: 0 }}>{error}</p>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="press"
                type="button" onClick={() => router.back()}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  fontFamily: 'DM Sans, sans-serif', border: '1.5px solid #E2DDD4',
                  background: '#FDFCF9', color: '#3A4A5C', cursor: 'pointer',
                }}
              >
                ← Back
              </button>
              <button className="press"
                type="submit"
                onClick={() => { if (!valid) setAttempted(true) }}
                disabled={isPending}
                style={{
                  flex: 2, padding: '13px 0', borderRadius: 10, fontSize: 15, fontWeight: 700,
                  fontFamily: 'Syne, sans-serif', border: 'none',
                  background: valid ? ACCENT    : '#C8D4C8',
                  color: '#fff',
                  cursor:    valid ? 'pointer'  : 'not-allowed',
                  boxShadow: valid ? '0 4px 16px rgba(13,124,84,.3)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {isPending && (
                  <span style={{
                    width: 15, height: 15,
                    border: '2px solid rgba(255,255,255,.35)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'spin .65s linear infinite',
                  }} />
                )}
                {isPending ? 'Saving…' : 'Save & Continue →'}
              </button>
            </div>

          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: '#9AAAB8' }}>
          You can edit library details anytime from your dashboard.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}