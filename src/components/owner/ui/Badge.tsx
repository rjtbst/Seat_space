import { STATUS_STYLE } from '@/lib/constants/theme'

type StatusKey = keyof typeof STATUS_STYLE

/**
 * Shared layout (padding/radius/font) now lives in .dash-badge in
 * globals.css. Background/color stay inline since they're genuinely
 * per-status/per-call-site data, not a fixed visual constant.
 */
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status as StatusKey] ?? STATUS_STYLE.confirmed
  return (
    <span className="dash-badge" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

export function ColorBadge({
  children, bg, color,
}: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span className="dash-badge" style={{ background: bg, color }}>
      {children}
    </span>
  )
}