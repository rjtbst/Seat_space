'use client'

// src/app/(staff)/staff/scanner/page.tsx
import { useEffect, useRef, useState, useTransition } from 'react'
import { lookupBookingForScan, staffCheckIn } from '@/lib/actions/staff'
import { fmtIST } from '@/lib/ist'

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

type ScanState = 'idle' | 'scanning' | 'found' | 'success' | 'error'

export default function ScannerPage() {
  const videoRef                      = useRef<HTMLVideoElement>(null)
  const streamRef                     = useRef<MediaStream | null>(null)
  const detectorRef                   = useRef<any>(null)
  const rafRef                        = useRef<number>(0)

  const [scanState, setScanState]     = useState<ScanState>('idle')
  const [booking,   setBooking]       = useState<BookingPreview | null>(null)
  const [errorMsg,  setErrorMsg]      = useState('')
  const [manualId,  setManualId]      = useState('')
  const [hasCam,    setHasCam]        = useState(true)
  const [isPending, startTransition]  = useTransition()

  // Start camera + scanning loop
  const startCamera = async () => {
    setScanState('scanning')
    setErrorMsg('')
    setBooking(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Use BarcodeDetector if available (Chrome 83+, Safari 17+)
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
        detectorRef.current = detector
        scanLoop(detector)
      } else {
        // No native API — show manual fallback
        setHasCam(false)
        setScanState('idle')
        stopCamera()
      }
    } catch (err: any) {
      setHasCam(false)
      setScanState('idle')
      setErrorMsg('Camera access denied. Use manual entry below.')
    }
  }

  const scanLoop = (detector: any) => {
    rafRef.current = requestAnimationFrame(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        scanLoop(detector)
        return
      }
      try {
        const barcodes = await detector.detect(videoRef.current)
        if (barcodes.length > 0) {
          const raw = barcodes[0].rawValue as string
          stopCamera()
          await resolveBookingId(raw)
          return
        }
      } catch { /* detector can throw on empty frame */ }
      scanLoop(detector)
    })
  }

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  // Clean up on unmount
  useEffect(() => () => stopCamera(), [])

  const resolveBookingId = async (rawId: string) => {
    // Normalize — QR might encode a full URL like https://app.com/booking/UUID
    const id = rawId.trim().split('/').pop() ?? rawId.trim()
    setScanState('found')
    startTransition(async () => {
      const res = await lookupBookingForScan(id)
      if (res.success) {
        setBooking(res.data)
      } else {
        setScanState('error')
        setErrorMsg((res as any).error ?? 'Booking not found')
      }
    })
  }

  const handleCheckIn = () => {
    if (!booking) return
    startTransition(async () => {
      const res = await staffCheckIn(booking.id)
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
    setErrorMsg('')
    setManualId('')
    stopCamera()
  }

  const handleManualLookup = () => {
    if (!manualId.trim()) return
    resolveBookingId(manualId.trim())
  }

  return (
    <div style={{ padding: '20px 16px', maxWidth: 400, margin: '0 auto', fontFamily: 'DM Sans, sans-serif' }}>

      <h1 style={{
        fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22,
        color: '#0A0D12', letterSpacing: '-0.03em', margin: 0, marginBottom: 4,
      }}>
        QR Scanner
      </h1>
      <p style={{ fontSize: 12, color: '#9AAAB8', marginBottom: 20, margin: '0 0 20px' }}>
        Scan student's booking QR code to check them in
      </p>

      {/* ── IDLE ── */}
      {scanState === 'idle' && (
        <div>
          {/* Camera button */}
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
              Or enter Booking ID manually
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={manualId}
                onChange={e => setManualId(e.target.value)}
                placeholder="Paste booking UUID…"
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
            {/* Viewfinder corners */}
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
            {/* Scan line animation */}
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
      {scanState === 'found' && !booking && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{
            width: 40, height: 40, border: `3px solid ${ACCENT_LIGHT}`,
            borderTopColor: ACCENT, borderRadius: '50%',
            margin: '0 auto 16px', animation: 'spin .65s linear infinite',
          }} />
          <div style={{ fontSize: 14, color: '#6B7689' }}>Looking up booking…</div>
        </div>
      )}

      {/* ── FOUND + booking loaded → confirm check-in ── */}
      {(scanState === 'found') && booking && (
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

          {booking.status === 'confirmed' ? (
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
            Checked In!
          </div>
          <div style={{ fontSize: 14, color: '#6B7689', marginBottom: 6 }}>
            {booking?.studentName} — Seat {booking?.seatLabel}
          </div>
          <div style={{ fontSize: 12, color: '#9AAAB8', marginBottom: 24 }}>
            Entry recorded in system
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
            <div style={{ fontSize: 14, fontWeight: 700, color: '#9B1C1C', marginBottom: 4 }}>Check-in Failed</div>
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