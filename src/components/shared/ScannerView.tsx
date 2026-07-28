'use client'

// src/components/shared/ScannerView.tsx
/**
 * Shared QR scanner UI — used by both:
 *   - src/app/(staff)/staff/scanner/page.tsx       (via lookupBookingForScan / staffCheckIn)
 *   - src/app/(owner)/dashboard/scanner/page.tsx   (via lookupBookingForOwnerScan / checkInBooking)
 *
 * Scans TWO kinds of QR code, told apart by URL shape (both still end
 * with the UUID as the final "/"-separated path segment):
 *   - a BOOKING QR      "…/booking/<uuid>"       — single hourly booking
 *   - a SUBSCRIPTION QR "…/subscription/<uuid>"  — a student's digital
 *     library pass, valid for their whole membership duration. Scanning it
 *     records a check-in, or a check-out if they already have an open
 *     visit today (see lib/booking/subscriptionScan.ts).
 *
 * Identical UI and scanning mechanics either way — only the four server
 * actions passed in differ, since "who is allowed to check in this
 * booking/subscription" is scoped differently for staff (via the `staff`
 * table) vs owner (via `libraries.owner_id`). Extracted here so a future
 * fix to the camera/scan loop/UI only needs to happen once.
 */
import { useEffect, useRef, useState, useTransition } from 'react'
import jsQR from 'jsqr'
import { fmtIST } from '@/lib/ist'
import type { ActionResult } from '@/lib/actions/auth'

const ACCENT       = '#0597A7'
const ACCENT_LIGHT = '#E0F6F8'
const GREEN        = '#0D7C54'
const GREEN_LIGHT  = '#D1FAE5'

type BookingPreview = {
  id:          string
  seatLabel:   string
  studentName: string
  startTime:   string
  endTime:     string
  status:      string
}

type SubscriptionPreview = {
  id:              string
  studentName:     string
  planName:        string
  libraryId:       string
  libraryName:     string
  seatLabel:       string
  status:          string
  startDate:       string
  endDate:         string
  timeWindowStart: string | null
  timeWindowEnd:   string | null
  daysOfWeek:      number[] | null
}

type ScanState = 'idle' | 'scanning' | 'found' | 'success' | 'error'
type ScanKind  = 'booking' | 'subscription'

export interface ScannerViewProps {
  lookupBooking:        (bookingId: string) => Promise<ActionResult<BookingPreview>>
  checkIn:              (bookingId: string) => Promise<ActionResult>
  lookupSubscription?:  (subscriptionId: string) => Promise<ActionResult<SubscriptionPreview>>
  checkInSubscription?: (subscriptionId: string, libraryId: string) => Promise<ActionResult<{ action: 'checked_in' | 'checked_out' }>>
  title?:        string
  subtitle?:     string
}

export default function ScannerView({
  lookupBooking,
  checkIn,
  lookupSubscription,
  checkInSubscription,
  title    = 'QR Scanner',
  subtitle = "Scan a student's booking or membership QR code",
}: ScannerViewProps) {
  const videoRef                      = useRef<HTMLVideoElement>(null)
  const streamRef                     = useRef<MediaStream | null>(null)
  const canvasRef                     = useRef<HTMLCanvasElement | null>(null)
  const rafRef                        = useRef<number>(0)
  const scanningRef                   = useRef(false)

  const [scanState, setScanState]     = useState<ScanState>('idle')
  const [scanKind,  setScanKind]      = useState<ScanKind>('booking')
  const [booking,   setBooking]       = useState<BookingPreview | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionPreview | null>(null)
  const [scanAction, setScanAction]   = useState<'checked_in' | 'checked_out' | null>(null)
  const [errorMsg,  setErrorMsg]      = useState('')
  const [manualId,  setManualId]      = useState('')
  const [hasCam,    setHasCam]        = useState(true)
  const [isPending, startTransition]  = useTransition()

  // Start camera + scanning loop
  const startCamera = async () => {
    setScanState('scanning')
    setErrorMsg('')
    setBooking(null)
    setSubscription(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas')
      }

      // jsQR works on every browser (unlike the native BarcodeDetector API,
      // which is missing on most Android Chrome builds and all of iOS Safari)
      scanningRef.current = true
      scanLoop()
    } catch {
      setHasCam(false)
      setScanState('idle')
      setErrorMsg('Camera access denied. Use manual entry below.')
    }
  }

  const scanLoop = () => {
    rafRef.current = requestAnimationFrame(() => {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!scanningRef.current || !video || !canvas) return

      if (video.readyState < 2 || video.videoWidth === 0) {
        scanLoop()
        return
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        scanLoop()
        return
      }

      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        })
        if (code && code.data) {
          stopCamera()
          resolveScan(code.data)
          return
        }
      } catch { /* frame not ready / decode hiccup — just retry */ }

      scanLoop()
    })
  }

  const stopCamera = () => {
    scanningRef.current = false
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  // Clean up on unmount (e.g. navigating away mid-scan)
  useEffect(() => () => stopCamera(), [])

  /**
   * A raw scan is either a bare UUID (manual entry) or a full URL like
   * https://app.com/booking/UUID or https://app.com/subscription/UUID.
   * The kind is decided by whichever path segment precedes the UUID —
   * defaults to "booking" for a bare UUID (existing behavior, unchanged).
   */
  const resolveScan = async (rawId: string) => {
    const trimmed = rawId.trim()
    const parts   = trimmed.split('/').filter(Boolean)
    const id      = parts[parts.length - 1] ?? trimmed
    const kind: ScanKind = parts[parts.length - 2] === 'subscription' ? 'subscription' : 'booking'

    setScanKind(kind)
    setScanState('found')

    startTransition(async () => {
      if (kind === 'subscription') {
        if (!lookupSubscription) {
          setScanState('error')
          setErrorMsg('Membership scanning is not available here')
          return
        }
        const res = await lookupSubscription(id)
        if (res.success) {
          setSubscription(res.data)
        } else {
          setScanState('error')
          setErrorMsg((res as any).error ?? 'Membership pass not found')
        }
        return
      }

      const res = await lookupBooking(id)
      if (res.success) {
        setBooking(res.data)
      } else {
        setScanState('error')
        setErrorMsg((res as any).error ?? 'Booking not found')
      }
    })
  }

  const handleCheckIn = () => {
    if (scanKind === 'subscription') {
      if (!subscription || !checkInSubscription) return
      startTransition(async () => {
        const res = await checkInSubscription(subscription.id, subscription.libraryId)
        if (res.success) {
          setScanAction(res.data.action)
          setScanState('success')
        } else {
          setScanState('error')
          setErrorMsg((res as any).error ?? 'Scan failed')
        }
      })
      return
    }

    if (!booking) return
    startTransition(async () => {
      const res = await checkIn(booking.id)
      if (res.success) {
        setScanState('success')
      } else {
        setScanState('error')
        setErrorMsg((res as any).error ?? 'Check-in failed')
      }
    })
  }

  const handleReset = () => {
    setScanState('idle')
    setBooking(null)
    setSubscription(null)
    setScanAction(null)
    setErrorMsg('')
    setManualId('')
    stopCamera()
  }

  const handleManualLookup = () => {
    if (!manualId.trim()) return
    resolveScan(manualId.trim())
  }

  return (
    <div style={{ padding: '20px 16px', maxWidth: 400, margin: '0 auto', fontFamily: 'DM Sans, sans-serif' }}>

      <h1 style={{
        fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22,
        color: '#0A0D12', letterSpacing: '-0.03em', margin: 0, marginBottom: 4,
      }}>
        {title}
      </h1>
      <p style={{ fontSize: 12, color: '#9AAAB8', marginBottom: 20, margin: '0 0 20px' }}>
        {subtitle}
      </p>

      {/* ── IDLE ── */}
      {scanState === 'idle' && (
        <div>
          {hasCam && (
            <button
              onClick={startCamera}
              style={{
                width:      '100%',
                padding:    '20px',
                borderRadius: 16,
                border:     `2px dashed ${ACCENT}`,
                background: ACCENT_LIGHT,
                color:      ACCENT,
                fontSize:   15,
                fontWeight: 700,
                fontFamily: 'Syne, sans-serif',
                cursor:     'pointer',
                marginBottom: 16,
                display:    'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap:        8,
              }}
            >
              <span style={{ fontSize: 40 }}>📷</span>
              Tap to Open Camera
              <span style={{ fontSize: 12, fontWeight: 400, color: '#5BA8B5' }}>
                Points camera at the student's QR code
              </span>
            </button>
          )}

          {errorMsg && (
            <div style={{
              background: '#FEE2E2', borderRadius: 10, padding: '10px 14px',
              fontSize: 13, color: '#9B1C1C', marginBottom: 14,
              display: 'flex', gap: 8,
            }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Manual ID fallback */}
          <div style={{ borderTop: '1px solid #E2DDD4', paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7689', marginBottom: 8 }}>
              Or enter Booking / Membership ID manually
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={manualId}
                onChange={e => setManualId(e.target.value)}
                placeholder="Paste booking or membership UUID…"
                style={{
                  flex: 1, padding: '10px 12px',
                  border: '1.5px solid #E2DDD4', borderRadius: 9,
                  fontSize: 13, color: '#0A0D12', outline: 'none',
                  fontFamily: 'DM Sans, sans-serif', background: '#FDFCF9',
                }}
                onKeyDown={e => e.key === 'Enter' && handleManualLookup()}
              />
              <button
                onClick={handleManualLookup}
                disabled={!manualId.trim()}
                style={{
                  padding:    '10px 16px',
                  borderRadius: 9,
                  border:     'none',
                  background: manualId.trim() ? ACCENT : '#C8D4C8',
                  color:      '#fff',
                  fontSize:   13,
                  fontWeight: 700,
                  cursor:     manualId.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'Syne, sans-serif',
                }}
              >
                Look up
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SCANNING (camera live) ── */}
      {scanState === 'scanning' && (
        <div>
          <div style={{
            position:     'relative',
            borderRadius: 16,
            overflow:     'hidden',
            background:   '#0A0D12',
            aspectRatio:  '1 / 1',
            marginBottom: 14,
          }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {['tl','tr','bl','br'].map(pos => (
              <div key={pos} style={{
                position:    'absolute',
                width:       28,
                height:      28,
                borderColor: ACCENT,
                borderStyle: 'solid',
                borderWidth: 0,
                ...(pos === 'tl' ? { top: '20%', left: '20%', borderTopWidth: 3, borderLeftWidth:  3, borderRadius: '4px 0 0 0' } : {}),
                ...(pos === 'tr' ? { top: '20%', right: '20%', borderTopWidth: 3, borderRightWidth: 3, borderRadius: '0 4px 0 0' } : {}),
                ...(pos === 'bl' ? { bottom: '20%', left: '20%', borderBottomWidth: 3, borderLeftWidth:  3, borderRadius: '0 0 0 4px' } : {}),
                ...(pos === 'br' ? { bottom: '20%', right: '20%', borderBottomWidth: 3, borderRightWidth: 3, borderRadius: '0 0 4px 0' } : {}),
              }} />
            ))}
            <div style={{
              position:   'absolute',
              left:       '20%',
              right:      '20%',
              height:     2,
              background: ACCENT,
              opacity:    0.8,
              animation:  'scanLine 2s ease-in-out infinite',
            }} />
          </div>

          <div style={{ textAlign: 'center', fontSize: 13, color: '#6B7689', marginBottom: 14 }}>
            Point the camera at the student's QR code
          </div>

          <button
            onClick={handleReset}
            style={{
              width:      '100%',
              padding:    '11px 0',
              borderRadius: 10,
              border:     '1.5px solid #E2DDD4',
              background: '#FDFCF9',
              color:      '#6B7689',
              fontSize:   13,
              fontWeight: 600,
              cursor:     'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── FOUND (looking up in DB) ── */}
      {scanState === 'found' && !booking && !subscription && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{
            width: 40, height: 40, border: `3px solid ${ACCENT_LIGHT}`,
            borderTopColor: ACCENT, borderRadius: '50%',
            margin: '0 auto 16px', animation: 'spin .65s linear infinite',
          }} />
          <div style={{ fontSize: 14, color: '#6B7689' }}>Looking up {scanKind === 'subscription' ? 'membership' : 'booking'}…</div>
        </div>
      )}

      {/* ── FOUND + booking loaded → confirm check-in ── */}
      {scanState === 'found' && booking && (
        <div>
          <div style={{
            background:   GREEN_LIGHT,
            border:       `1.5px solid rgba(13,124,84,.3)`,
            borderRadius: 16,
            padding:      '18px',
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7689', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Booking Found
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: ACCENT_LIGHT, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
              }}>
                🎓
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#0A0D12', fontFamily: 'Syne, sans-serif' }}>
                  {booking.studentName}
                </div>
                <div style={{ fontSize: 13, color: '#6B7689' }}>
                  Seat <strong style={{ color: '#0A0D12' }}>{booking.seatLabel}</strong>
                </div>
              </div>
            </div>
            <div style={{
              background: '#fff', borderRadius: 10, padding: '10px 14px',
              fontSize: 12, color: '#3A4A5C', lineHeight: 1.8,
            }}>
              📅 {fmtIST(booking.startTime)}<br />
              ⏰ Until {fmtIST(booking.endTime)}<br />
              🏷️ Status: <strong style={{ textTransform: 'capitalize' }}>{booking.status.replace('_', ' ')}</strong>
            </div>
          </div>

          {booking.status === 'confirmed' || booking.status === 'held' ? (
            <button
              onClick={handleCheckIn}
              disabled={isPending}
              style={{
                width:        '100%',
                padding:      '14px 0',
                borderRadius: 12,
                border:       'none',
                background:   GREEN,
                color:        '#fff',
                fontSize:     15,
                fontWeight:   700,
                fontFamily:   'Syne, sans-serif',
                cursor:       'pointer',
                marginBottom: 10,
                opacity:      isPending ? 0.7 : 1,
                boxShadow:    '0 4px 16px rgba(13,124,84,.3)',
              }}
            >
              {isPending ? 'Processing…' : '✓ Confirm Check-In'}
            </button>
          ) : (
            <div style={{
              padding:      '12px 14px',
              background:   '#FEF3E2',
              borderRadius: 12,
              fontSize:     13,
              color:        '#92400E',
              marginBottom: 10,
              fontWeight:   600,
            }}>
              ⚠️ Cannot check in — booking is already <strong>{booking.status.replace('_', ' ')}</strong>
            </div>
          )}

          <button
            onClick={handleReset}
            style={{
              width:        '100%',
              padding:      '11px 0',
              borderRadius: 10,
              border:       '1.5px solid #E2DDD4',
              background:   '#FDFCF9',
              color:        '#6B7689',
              fontSize:     13,
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            Scan Another
          </button>
        </div>
      )}

      {/* ── FOUND + subscription loaded → confirm check-in/out ── */}
      {scanState === 'found' && subscription && (
        <div>
          <div style={{
            background:   GREEN_LIGHT,
            border:       `1.5px solid rgba(13,124,84,.3)`,
            borderRadius: 16,
            padding:      '18px',
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7689', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Membership Pass
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: ACCENT_LIGHT, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
              }}>
                🪪
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#0A0D12', fontFamily: 'Syne, sans-serif' }}>
                  {subscription.studentName}
                </div>
                <div style={{ fontSize: 13, color: '#6B7689' }}>
                  {subscription.planName} — Seat <strong style={{ color: '#0A0D12' }}>{subscription.seatLabel}</strong>
                </div>
              </div>
            </div>
            <div style={{
              background: '#fff', borderRadius: 10, padding: '10px 14px',
              fontSize: 12, color: '#3A4A5C', lineHeight: 1.8,
            }}>
              🏛️ {subscription.libraryName}<br />
              📅 Valid {fmtIST(subscription.startDate)} – {fmtIST(subscription.endDate)}<br />
              🏷️ Status: <strong style={{ textTransform: 'capitalize' }}>{subscription.status}</strong>
            </div>
          </div>

          {subscription.status === 'active' ? (
            <button
              onClick={handleCheckIn}
              disabled={isPending}
              style={{
                width:        '100%',
                padding:      '14px 0',
                borderRadius: 12,
                border:       'none',
                background:   GREEN,
                color:        '#fff',
                fontSize:     15,
                fontWeight:   700,
                fontFamily:   'Syne, sans-serif',
                cursor:       'pointer',
                marginBottom: 10,
                opacity:      isPending ? 0.7 : 1,
                boxShadow:    '0 4px 16px rgba(13,124,84,.3)',
              }}
            >
              {isPending ? 'Processing…' : '✓ Confirm Scan'}
            </button>
          ) : (
            <div style={{
              padding:      '12px 14px',
              background:   '#FEF3E2',
              borderRadius: 12,
              fontSize:     13,
              color:        '#92400E',
              marginBottom: 10,
              fontWeight:   600,
            }}>
              ⚠️ Cannot scan — membership is <strong>{subscription.status}</strong>
            </div>
          )}

          <button
            onClick={handleReset}
            style={{
              width:        '100%',
              padding:      '11px 0',
              borderRadius: 10,
              border:       '1.5px solid #E2DDD4',
              background:   '#FDFCF9',
              color:        '#6B7689',
              fontSize:     13,
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            Scan Another
          </button>
        </div>
      )}

      {/* ── SUCCESS ── */}
      {scanState === 'success' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{
            width:        72,
            height:       72,
            borderRadius: '50%',
            background:   GREEN_LIGHT,
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            fontSize:     36,
            margin:       '0 auto 16px',
            border:       `2px solid rgba(13,124,84,.2)`,
          }}>
            ✓
          </div>
          <div style={{
            fontSize:     22,
            fontWeight:   800,
            fontFamily:   'Syne, sans-serif',
            color:        GREEN,
            marginBottom: 6,
          }}>
            {scanKind === 'subscription'
              ? (scanAction === 'checked_out' ? 'Checked Out!' : 'Checked In!')
              : 'Checked In!'}
          </div>
          <div style={{ fontSize: 14, color: '#6B7689', marginBottom: 6 }}>
            {scanKind === 'subscription'
              ? `${subscription?.studentName} — Seat ${subscription?.seatLabel}`
              : `${booking?.studentName} — Seat ${booking?.seatLabel}`}
          </div>
          <div style={{ fontSize: 12, color: '#9AAAB8', marginBottom: 24 }}>
            {scanKind === 'subscription' ? 'Attendance recorded' : 'Entry recorded in system'}
          </div>
          <button
            onClick={handleReset}
            style={{
              padding:      '12px 32px',
              borderRadius: 10,
              border:       'none',
              background:   ACCENT,
              color:        '#fff',
              fontSize:     14,
              fontWeight:   700,
              fontFamily:   'Syne, sans-serif',
              cursor:       'pointer',
            }}
          >
            Scan Next →
          </button>
        </div>
      )}

      {/* ── ERROR ── */}
      {scanState === 'error' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            background:   '#FEE2E2',
            border:       '1px solid rgba(220,38,38,.2)',
            borderRadius: 14,
            padding:      '20px',
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>❌</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#9B1C1C', marginBottom: 4 }}>Scan Failed</div>
            <div style={{ fontSize: 13, color: '#9B1C1C' }}>{errorMsg}</div>
          </div>
          <button
            onClick={handleReset}
            style={{
              width:        '100%',
              padding:      '12px 0',
              borderRadius: 10,
              border:       'none',
              background:   ACCENT,
              color:        '#fff',
              fontSize:     14,
              fontWeight:   700,
              fontFamily:   'Syne, sans-serif',
              cursor:       'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes scanLine {
          0%   { top: 20%; }
          50%  { top: 80%; }
          100% { top: 20%; }
        }
      `}} />
    </div>
  )
}
