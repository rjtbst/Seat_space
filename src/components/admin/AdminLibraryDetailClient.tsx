// src/components/admin/AdminLibraryDetailClient.tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  approveLibrary, rejectLibrary, suspendLibrary, reactivateLibrary,
} from '@/lib/actions/admin-libraries'
import type { AdminLibraryDetail } from '@/lib/actions/admin-libraries'

const ACCENT = '#7C3AED'


function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 11.5, color: '#A6AEBA', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</p>
      <p style={{ fontSize: 14, color: '#1A1D21', margin: '3px 0 0' }}>{value}</p>
    </div>
  )
}

export default function AdminLibraryDetailClient({ library }: { library: AdminLibraryDetail }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [showSuspendForm, setShowSuspendForm] = useState(false)
  const [reasonInput, setReasonInput] = useState('')
  const [notesInput, setNotesInput] = useState('')

  function handle(action: () => Promise<{ success: boolean; error?: string }>, successMsg: string) {
    setError(null); setSuccess(null)
    startTransition(async () => {
      const res = await action()
      if (!res.success) setError(res.error ?? 'Something went wrong')
      else { setSuccess(successMsg); setShowRejectForm(false); setShowSuspendForm(false) }
    })
  }

  // Separate from the generic handle() above because approveLibrary's
  // success case now carries an `activatedNow` flag — approval and
  // activation are decoupled (see admin-libraries.ts), so "approved" can
  // mean either "approved AND live" or "approved, but still waiting on
  // the owner's ₹399/month subscription payment" — these need different
  // messages, not the fixed successMsg the generic helper shows.
  function handleApprove() {
    setError(null); setSuccess(null)
    startTransition(async () => {
      const res = await approveLibrary(library.id, notesInput || undefined)
      if (!res.success) { setError(res.error ?? 'Something went wrong'); return }
      setSuccess(
        res.data.activatedNow
          ? 'Library approved and is now live'
          : 'Library approved — it will go live automatically once the owner completes their ₹399/month platform subscription (they\'ll see a Subscribe button on their My Libraries page)',
      )
      setShowRejectForm(false); setShowSuspendForm(false)
    })
  }

  function handleReactivate() {
    setError(null); setSuccess(null)
    startTransition(async () => {
      const res = await reactivateLibrary(library.id, notesInput || undefined)
      if (!res.success) { setError(res.error ?? 'Something went wrong'); return }
      setSuccess(
        res.data.activatedNow
          ? 'Library reactivated and is now live'
          : 'Library reactivated — it will go live automatically once the owner completes their ₹399/month platform subscription',
      )
      setShowRejectForm(false); setShowSuspendForm(false)
    })
  }

  const canApprove = library.approvalStatus === 'pending' || library.approvalStatus === 'rejected'
  const canReject = library.approvalStatus === 'pending'
  const canSuspend = library.approvalStatus === 'approved'
  const canReactivate = library.approvalStatus === 'suspended'

  return (
    <div>
      <Link href="/admin/libraries" style={{ color: '#8B95A5', fontSize: 13, textDecoration: 'none' }}>← Back to libraries</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, fontFamily: 'Syne, sans-serif' }}>{library.name}</h1>
          <p style={{ color: '#8B95A5', fontSize: 13, margin: '4px 0 0' }}>{library.address}</p>
        </div>
        <span style={{
          background: library.approvalStatus === 'approved' ? '#D1FAE5' : library.approvalStatus === 'rejected' ? '#FEE2E2' : library.approvalStatus === 'suspended' ? '#F3E8FF' : '#FEF3C7',
          color: library.approvalStatus === 'approved' ? '#065F46' : library.approvalStatus === 'rejected' ? '#991B1B' : library.approvalStatus === 'suspended' ? '#6B21A8' : '#92400E',
          fontSize: 12.5, fontWeight: 700, padding: '5px 14px', borderRadius: 999, textTransform: 'capitalize',
        }}>
          {library.approvalStatus}
        </span>
      </div>

      {error && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13.5 }}>{error}</div>}
      {success && <div style={{ background: '#D1FAE5', color: '#065F46', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13.5 }}>{success} (refresh to see updated state)</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #ECE7DC' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <Field label="Owner" value={`${library.ownerName ?? '—'} (${library.ownerPhone ?? 'no phone'})`} />
            <Field label="Location" value={`${library.area}, ${library.city}`} />
            <Field label="Seats" value={library.seatCount} />
            <Field label="Subscription" value={library.subscriptionStatus ?? 'Not set up'} />
            <Field label="Submitted for review" value={library.submittedForReviewAt ? new Date(library.submittedForReviewAt).toLocaleString('en-IN') : '—'} />
            <Field label="Last reviewed" value={library.reviewedAt ? new Date(library.reviewedAt).toLocaleString('en-IN') : 'Never'} />
          </div>

          {library.description && (
            <div style={{ marginBottom: 20 }}>
              <Field label="Description" value={library.description} />
            </div>
          )}

          <Field label="Amenities" value={library.amenityNames.length > 0 ? library.amenityNames.join(', ') : 'None listed'} />

          {library.approvalNotes && (
            <div style={{ marginTop: 20, padding: '12px 14px', background: '#FAF8F4', borderRadius: 10 }}>
              <Field label="Admin notes" value={library.approvalNotes} />
            </div>
          )}

          {library.suspendedReason && (
            <div style={{ marginTop: 12, padding: '12px 14px', background: '#FEE2E2', borderRadius: 10 }}>
              <Field label="Suspension reason" value={library.suspendedReason} />
            </div>
          )}

          {library.photoUrls.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 11.5, color: '#A6AEBA', margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase' }}>Photos</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {library.photoUrls.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={url} alt={`${library.name} photo ${i + 1}`} style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8 }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action panel */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #ECE7DC', height: 'fit-content' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>Actions</h3>

          {canApprove && !showRejectForm && (
            <button disabled={isPending} onClick={handleApprove} style={{
              width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: '#10B981', color: '#fff',
              fontWeight: 700, fontSize: 13.5, cursor: 'pointer', marginBottom: 8,
            }}>
              ✓ Approve library
            </button>
          )}

          {canReject && !showRejectForm && (
            <button onClick={() => setShowRejectForm(true)} style={{
              width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid #DC2626', background: '#fff', color: '#DC2626',
              fontWeight: 700, fontSize: 13.5, cursor: 'pointer', marginBottom: 8,
            }}>
              ✕ Reject library
            </button>
          )}

          {showRejectForm && (
            <div style={{ marginBottom: 12 }}>
              <textarea
                placeholder="Reason for rejection (shown to owner)…"
                value={reasonInput}
                onChange={e => setReasonInput(e.target.value)}
                style={{ width: '100%', minHeight: 70, padding: 10, borderRadius: 8, border: '1px solid #ECE7DC', fontSize: 13, marginBottom: 8, fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={isPending} onClick={() => handle(() => rejectLibrary(library.id, reasonInput), 'Library rejected')} style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}>Confirm reject</button>
                <button onClick={() => setShowRejectForm(false)} style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #ECE7DC', background: '#fff', color: '#6B7689', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}>Cancel</button>
              </div>
            </div>
          )}

          {canSuspend && !showSuspendForm && (
            <button onClick={() => setShowSuspendForm(true)} style={{
              width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid #6B21A8', background: '#fff', color: '#6B21A8',
              fontWeight: 700, fontSize: 13.5, cursor: 'pointer', marginBottom: 8,
            }}>
              ⏸ Suspend library
            </button>
          )}

          {showSuspendForm && (
            <div style={{ marginBottom: 12 }}>
              <textarea
                placeholder="Reason for suspension (shown to owner)…"
                value={reasonInput}
                onChange={e => setReasonInput(e.target.value)}
                style={{ width: '100%', minHeight: 70, padding: 10, borderRadius: 8, border: '1px solid #ECE7DC', fontSize: 13, marginBottom: 8, fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={isPending} onClick={() => handle(() => suspendLibrary(library.id, reasonInput), 'Library suspended')} style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: '#6B21A8', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}>Confirm suspend</button>
                <button onClick={() => setShowSuspendForm(false)} style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #ECE7DC', background: '#fff', color: '#6B7689', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}>Cancel</button>
              </div>
            </div>
          )}

          {canReactivate && (
            <button disabled={isPending} onClick={handleReactivate} style={{
              width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff',
              fontWeight: 700, fontSize: 13.5, cursor: 'pointer', marginBottom: 8,
            }}>
              ↻ Reactivate library
            </button>
          )}

          <div style={{ marginTop: 16 }}>
            <textarea
              placeholder="Optional review notes (kept internally + shown to owner on approve)…"
              value={notesInput}
              onChange={e => setNotesInput(e.target.value)}
              style={{ width: '100%', minHeight: 60, padding: 10, borderRadius: 8, border: '1px solid #ECE7DC', fontSize: 12.5, fontFamily: 'inherit' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
