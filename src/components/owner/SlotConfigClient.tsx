'use client'
import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { SlotConfig, SlotConfigInput } from '@/lib/actions/owner'
import { upsertSlotConfig, toggleSlotConfig } from '@/lib/actions/owner'
import { daysDisplay } from '@/lib/booking/types'
import { useOwner } from '@/contexts/OwnerContext'
import { useToast } from '@/hooks/useToast'
import {
  ACCENT, ACCENT_LIGHT, BLUE, BLUE_LIGHT,
  BORDER, BG_CARD, SHADOW_SM, FONT_DISPLAY, FONT_BODY,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, INP_STYLE,
} from '@/lib/constants/theme'
import { Card, PageHeader, EmptyState, Toggle, Toast, Spinner, ErrorBanner, LibraryPicker } from '@/components/owner/ui'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const EMPTY_FORM = {
  start: '09:00', end: '12:00',
  days: [0, 1, 2, 3, 4] as number[],
  price: '', discount: '',
}

export default function SlotConfigClient({
  slots: initial, libraryId, libraryName,
}: {
  slots:       SlotConfig[]
  libraryId:   string
  libraryName: string
  // ← libraries prop REMOVED — from useOwner() context
}) {
  const router = useRouter()
  const { libraries } = useOwner()         // ← context, no prop
  const { toast, showToast } = useToast()

  const [slots, setSlots]            = useState(initial)
  const [editing, setEditing]        = useState<SlotConfig | null>(null)
  const [showForm, setShowForm]      = useState(false)
  const [form, setForm]              = useState(EMPTY_FORM)
  const [error, setError]            = useState('')
  const [isPending, startTransition] = useTransition()

  const openAdd = useCallback(() => {
    setEditing(null); setForm(EMPTY_FORM); setError(''); setShowForm(true)
  }, [])

  const openEdit = useCallback((slot: SlotConfig) => {
    // slot.days is already number[] (0=Mon..6=Sun) — straight from slot_configs,
    // no reverse-parsing needed.
    setEditing(slot)
    setForm({ start: slot.start, end: slot.end, days: [...slot.days], price: String(slot.price), discount: String(slot.discount || '') })
    setError(''); setShowForm(true)
    setTimeout(() => document.getElementById('slot-form')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  const toggleDay = useCallback((idx: number) => {
    setForm(f => ({
      ...f,
      days: f.days.includes(idx) ? f.days.filter(d => d !== idx) : [...f.days, idx],
    }))
  }, [])

  const handleSave = useCallback(() => {
    setError('')
    if (!form.start || !form.end)          { setError('Start and end time are required'); return }
    if (form.days.length === 0)            { setError('Select at least one day'); return }
    if (!form.price || isNaN(Number(form.price))) { setError('Enter a valid price'); return }
    if (form.start >= form.end)            { setError('End time must be after start time'); return }

    const payload: SlotConfigInput = {
      id:        editing?.id,
      start:     form.start, end: form.end,
      days:      [...form.days],   // number[] (0=Mon..6=Sun) — sent straight to slot_configs.days
      price:     Number(form.price),
      discount:  Number(form.discount || 0),
      is_active: editing?.is_active ?? true,
    }
    startTransition(async () => {
      const res = await upsertSlotConfig(libraryId, payload)
      if (res.success === false) { setError(res.error); return }
      if (editing) {
        setSlots(prev => prev.map(s => s.id === editing.id ? res.data : s))
        showToast('Slot updated')
      } else {
        router.refresh(); showToast('Slot added')
      }
      setShowForm(false); setEditing(null)
    })
  }, [form, editing, libraryId, showToast, router])

  const handleToggle = useCallback((slot: SlotConfig, val: boolean) => {
    startTransition(async () => {
      const res = await toggleSlotConfig(libraryId, slot.id, val)
      if (res.success) {
        setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, is_active: val } : s))
        showToast(`Slot ${val ? 'enabled' : 'disabled'}`)
      }
    })
  }, [libraryId, showToast])

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      <Toast toast={toast} />

      <PageHeader
        title="Slot Configuration"
        subtitle={`${libraryName} · Set time slots and pricing`}
        action={
          <button onClick={openAdd} style={{
            padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700,
            background: ACCENT, color: '#fff', border: 'none', cursor: 'pointer',
            fontFamily: FONT_DISPLAY, boxShadow: '0 2px 10px rgba(13,124,84,.25)',
          }}>
            + Add Slot
          </button>
        }
      />

      {/* Library picker — from shared, no more manual pills */}
      <LibraryPicker
        libraries={libraries}
        currentId={libraryId}
        buildHref={id => `/dashboard/slot-config?lib=${id}`}
      />

      {/* Slots table */}
      <Card padding={0} style={{ overflow: 'hidden', marginBottom: 16 }}>
        {slots.length === 0 ? (
          <EmptyState
            icon="⏰"
            title="No slots configured yet"
            subtitle="Add your first time slot to define when students can book"
            action={
              <button onClick={openAdd} style={{
                padding: '9px 20px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                background: ACCENT, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: FONT_DISPLAY,
              }}>
                + Add First Slot
              </button>
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Time Slot', 'Days', 'Price / hr', 'Last-min Discount', 'Status', ''].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700,
                      color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '.05em',
                      borderBottom: `1px solid ${BORDER}`, background: '#F9F8F5', whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map(slot => (
                  <tr key={slot.id} style={{ borderBottom: '1px solid #F0EDE8' }}>
                    <td style={{ padding: '13px 16px', fontWeight: 700, color: TEXT_PRIMARY, whiteSpace: 'nowrap' }}>
                      {slot.start} – {slot.end}
                    </td>
                    <td style={{ padding: '13px 16px', color: TEXT_SECONDARY }}>{daysDisplay(slot.days)}</td>
                    <td style={{ padding: '13px 16px', fontWeight: 700, color: TEXT_PRIMARY }}>₹{slot.price}</td>
                    <td style={{ padding: '13px 16px', color: slot.discount ? TEXT_PRIMARY : TEXT_MUTED }}>
                      {slot.discount ? `₹${slot.discount} off` : 'No discount'}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <Toggle on={slot.is_active} onChange={v => handleToggle(slot, v)} disabled={isPending} />
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <button onClick={() => openEdit(slot)} style={{
                        padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                        border: `1.5px solid ${BORDER}`, background: BG_CARD, color: '#3A4A5C',
                        cursor: 'pointer', fontFamily: FONT_BODY,
                      }}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit form */}
      {showForm && (
        <Card id="slot-form" padding="22px 24px">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY }}>
              {editing ? `Edit Slot — ${editing.start} – ${editing.end}` : 'Add New Slot'}
            </div>
            <button onClick={() => { setShowForm(false); setEditing(null) }} style={{
              width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${BORDER}`,
              background: BG_CARD, color: TEXT_SECONDARY, cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          </div>

          {/* Time row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {(['start', 'end'] as const).map(field => (
              <div key={field}>
                <label style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, display: 'block', marginBottom: 5 }}>
                  {field === 'start' ? 'Start time' : 'End time'}
                </label>
                <input type="time" value={form[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  style={INP_STYLE} />
              </div>
            ))}
          </div>

          {/* Day chips */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, display: 'block', marginBottom: 8 }}>
              Active days
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DAYS.map((day, idx) => {
                const on = form.days.includes(idx)
                return (
                  <button key={day} type="button" onClick={() => toggleDay(idx)} style={{
                    width: 40, height: 40, borderRadius: 9, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1.5px solid ${on ? BLUE : BORDER}`,
                    background: on ? BLUE_LIGHT : '#F9F8F5',
                    color: on ? BLUE : TEXT_MUTED, transition: 'all .12s', fontFamily: FONT_BODY,
                  }}>
                    {day}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Price row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, display: 'block', marginBottom: 5 }}>
                Base price / hr (₹) *
              </label>
              <input type="number" min="0" placeholder="25" value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))} style={INP_STYLE} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, display: 'block', marginBottom: 5 }}>
                Discount (₹/hr, optional)
              </label>
              <input type="number" min="0" placeholder="e.g. 5" value={form.discount}
                onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} style={INP_STYLE} />
            </div>
          </div>

          {/* Preview */}
          {form.price && form.start && form.end && (
            <div style={{
              background: ACCENT_LIGHT, border: `1px solid rgba(13,124,84,.2)`,
              borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#0A5E3F',
            }}>
              <strong>Preview:</strong> {form.start}–{form.end} · {daysDisplay(form.days)} · ₹{form.price}/hr
              {form.discount ? ` · ₹${form.discount} discount` : ''}
            </div>
          )}

          <ErrorBanner error={error} />

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setShowForm(false); setEditing(null) }} style={{
              flex: 1, padding: '11px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
              border: `1.5px solid ${BORDER}`, background: BG_CARD, color: '#3A4A5C',
              cursor: 'pointer', fontFamily: FONT_BODY,
            }}>Cancel</button>
            <button onClick={handleSave} disabled={isPending} style={{
              flex: 2, padding: '11px 0', borderRadius: 9, fontSize: 14, fontWeight: 700,
              border: 'none', background: ACCENT, color: '#fff',
              cursor: isPending ? 'not-allowed' : 'pointer', fontFamily: FONT_DISPLAY,
              boxShadow: '0 2px 10px rgba(13,124,84,.25)', opacity: isPending ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {isPending && <Spinner />}
              {isPending ? 'Saving…' : editing ? 'Update Slot' : 'Save Slot'}
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}