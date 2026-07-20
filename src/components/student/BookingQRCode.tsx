// components/student/BookingQRCode.tsx
'use client'

/**
 * Renders a booking's QR code + UUID for check-in.
 *
 * QR is generated client-side (no server round trip — `bookings.id` is
 * already available in the page's props, and QR encoding is a pure
 * function of the URL it encodes, so there's nothing sensitive or
 * server-only about doing this in the browser).
 *
 * The encoded URL ends in the bare booking UUID as its final path segment
 * (see lib/booking/qr.ts for why this matters — it's what the staff
 * scanner's parsing logic expects).
 */
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, Check, X } from 'lucide-react'
import { bookingScanUrl } from '@/lib/booking/qr'

export function BookingQRCode({ bookingId }: { bookingId: string }) {
  const canvasRef        = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)
  const [ready,  setReady]  = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!canvasRef.current) return
    QRCode.toCanvas(
      canvasRef.current,
      bookingScanUrl(bookingId),
      {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 200,
        color: { dark: '#0D1117', light: '#FFFFFF' },
      },
      (err) => {
        if (!cancelled && !err) setReady(true)
      },
    )
    return () => { cancelled = true }
  }, [bookingId])

  function handleCopy() {
    navigator.clipboard.writeText(bookingId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="bg-white p-3 rounded-2xl border border-[#E4EAF2] shadow-sm">
        <canvas ref={canvasRef} width={200} height={200} className={ready ? '' : 'opacity-0'} />
        {!ready && (
          <div className="w-[200px] h-[200px] flex items-center justify-center text-[11px] text-[#9AACBE]">
            Generating QR…
          </div>
        )}
      </div>

      <p className="text-[11px] text-[#9AACBE] text-center max-w-[260px]">
        Show this to library staff to check in or out.
      </p>

      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 text-[11px] font-mono text-[#6E7F94] bg-[#F4F7FB] hover:bg-[#E8EFFE] px-3 py-1.5 rounded-lg transition-colors"
        title="Copy booking ID"
      >
        {copied ? <Check className="w-3 h-3 text-[#0D7C54]" /> : <Copy className="w-3 h-3" />}
        <span className="truncate max-w-[200px]">{bookingId}</span>
      </button>
    </div>
  )
}

/**
 * Modal wrapper — full booking QR detail, opened from a tap on a
 * BookingCard. Kept as a separate export so BookingsClient can lazily
 * render it only when a card is expanded.
 */
export function BookingQRModal({
  bookingId,
  libraryName,
  seatLabel,
  onClose,
}: {
  bookingId:   string
  libraryName: string
  seatLabel:   string
  onClose:     () => void
}) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-[340px] w-full p-5 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-[#9AACBE] hover:text-[#0D1117] p-1"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-[14px] font-bold text-[#0D1117] mb-0.5 pr-6">
          {libraryName}
        </h3>
        <p className="text-[12px] text-[#9AACBE] mb-3">Seat {seatLabel}</p>

        <BookingQRCode bookingId={bookingId} />
      </div>
    </div>
  )
}
