'use client'

// src/app/(staff)/staff/_components/StaffStateBanner.tsx
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MyStaffRequest } from '@/lib/actions/staff'
import { cancelStaffRequest } from '@/lib/actions/staff'

const ACCENT       = '#0597A7'
const ACCENT_LIGHT = '#E0F6F8'
const AMBER        = '#D97706'
const AMBER_LIGHT  = '#FEF3E2'
const RED          = '#DC2626'
const RED_LIGHT    = '#FEE2E2'

export default function StaffStateBanner({ request }: { request: MyStaffRequest }) {
  const router                       = useRouter()
  const [isPending, startTransition] = useTransition()
  const [cancelled, setCancelled]    = useState(false)

  const handleCancel = () => {
    startTransition(async () => {
      const res = await cancelStaffRequest(request.requestId)
      if (res.success) {
        setCancelled(true)
        router.push('/staff/request')
      }
    })
  }

  if (cancelled) return null

  // ── PENDING ───────────────────────────────────────────────────────────────
  if (request.status === 'pending') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '24px 20px',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        <div style={{ maxWidth: 400, width: '100%' }}>
          {/* Spinner */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: AMBER_LIGHT, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 36, margin: '0 auto 16px',
              border: '2px solid rgba(217,119,6,.2)',
            }}>
              ⏳
            </div>
            <h2 style={{
              fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22,
              color: '#0A0D12', marginBottom: 6, letterSpacing: '-0.03em',
            }}>
              Request Pending
            </h2>
            <p style={{ fontSize: 14, color: '#6B7689', lineHeight: 1.6, margin: 0 }}>
              Your request to join <strong style={{ color: '#0A0D12' }}>{request.libraryName}</strong> is
              waiting for the owner to review it.
            </p>
          </div>

          {/* Library card */}
          <div style={{
            background: AMBER_LIGHT, border: '1px solid rgba(217,119,6,.25)',
            borderRadius: 14, padding: '14px 16px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#92400E', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Request sent to
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0A0D12', marginBottom: 3 }}>
              {request.libraryName}
            </div>
            <div style={{ fontSize: 12, color: '#6B7689' }}>
              📍 {[request.area, request.city].filter(Boolean).join(', ')}
            </div>
            {request.message && (
              <div style={{
                marginTop: 10, padding: '8px 10px', background: 'rgba(255,255,255,.6)',
                borderRadius: 8, fontSize: 12, color: '#3A4A5C', fontStyle: 'italic',
              }}>
                "{request.message}"
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{
            background: ACCENT_LIGHT, border: '1px solid rgba(5,151,167,.2)',
            borderRadius: 12, padding: '12px 14px', marginBottom: 16,
            fontSize: 13, color: '#0A5F6B', lineHeight: 1.6,
          }}>
            💡 Share your phone number with the owner to speed up approval.
            Once they accept, you'll be able to access this dashboard.
          </div>

          {/* Cancel */}
          <button
            onClick={handleCancel}
            disabled={isPending}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 10,
              border: '1.5px solid #E2DDD4', background: '#FDFCF9',
              color: '#6B7689', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? 'Cancelling…' : 'Cancel Request — Choose Different Library'}
          </button>
        </div>
      </div>
    )
  }

  // ── REJECTED ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px 20px',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{ maxWidth: 400, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: RED_LIGHT, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 36, margin: '0 auto 16px',
            border: '2px solid rgba(220,38,38,.2)',
          }}>
            ✕
          </div>
          <h2 style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22,
            color: '#0A0D12', marginBottom: 6, letterSpacing: '-0.03em',
          }}>
            Request Declined
          </h2>
          <p style={{ fontSize: 14, color: '#6B7689', lineHeight: 1.6, margin: 0 }}>
            Your request to join <strong style={{ color: '#0A0D12' }}>{request.libraryName}</strong> was
            not approved. You can apply to a different library.
          </p>
        </div>

        <button
          onClick={() => router.push('/staff/request')}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 10,
            border: 'none', background: ACCENT, color: '#fff',
            fontSize: 14, fontWeight: 700, fontFamily: 'Syne, sans-serif',
            cursor: 'pointer', marginBottom: 10,
            boxShadow: '0 4px 16px rgba(5,151,167,.3)',
          }}
        >
          Search for Another Library →
        </button>

        <div style={{
          fontSize: 12, color: '#9AAAB8', textAlign: 'center', lineHeight: 1.5,
        }}>
          You can also contact a library owner directly and ask them to add you using your phone number.
        </div>
      </div>
    </div>
  )
}