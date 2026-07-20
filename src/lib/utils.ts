import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/* ─── Normalize an Indian phone number for lookup ───
   Strips whitespace, a leading +91, and a leading 0 — so "+91 98765 43210",
   "098765 43210", and "9876543210" all normalize to the same 10-digit
   value for a .eq('phone', …) lookup. Shared between owner-staff.ts (add
   staff by phone) and student-subscription-booking.ts (staff looking up a
   walk-in student's subscription by phone) — was previously duplicated. */
export function normalisePhone(raw: string): string {
  return raw.replace(/\s/g, '').replace(/^\+91/, '').replace(/^0/, '')
}

/* ─── Tailwind class merge (shadcn pattern) ─── */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* ─── Format currency (Indian locale) ─── */
export function formatINR(amount: number, compact = false): string {
  if (compact && amount >= 100_000) {
    return `₹${(amount / 100_000).toFixed(1)}L`
  }
  if (compact && amount >= 1_000) {
    return `₹${(amount / 1_000).toFixed(1)}k`
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/* ─── Format numbers (Indian locale) ─── */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n)
}

/* ─── Clamp a number ─── */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/* ─── Truncate text ─── */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + '…'
}

/* ─── Get initials from a name ─── */
export function getInitials(name: string, maxChars = 2): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, maxChars)
    .map((w) => w[0].toUpperCase())
    .join('')
}

/* ─── Slugify ─── */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

/* ─── Sleep (for animations / mock delays) ─── */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ─── Debounce ─── */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

/* ─── Seat grid helpers ─── */
export type SeatStatus = 'free' | 'taken' | 'selected' | 'reserved'

export interface Seat {
  id: string
  row: number
  col: number
  status: SeatStatus
  label: string
}

export function buildSeatGrid(
  rows: number,
  cols: number,
  takenPercent = 0.45
): Seat[] {
  const seats: Seat[] = []
  const rowLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const status: SeatStatus = Math.random() < takenPercent ? 'taken' : 'free'
      seats.push({
        id: `${rowLabels[r]}${c + 1}`,
        row: r,
        col: c,
        status,
        label: `${rowLabels[r]}${c + 1}`,
      })
    }
  }
  return seats
}

export function seatStatusColor(status: SeatStatus): string {
  switch (status) {
    case 'free':     return '#D1FAE5'
    case 'taken':    return '#FEE2E2'
    case 'selected': return '#DBEAFE'
    case 'reserved': return '#FEF3E2'
    default:         return '#E2DDD4'
  }
}

/* ─── Time slots ─── */
export function generateTimeSlots(
  openHour = 6,
  closeHour = 22,
  intervalMins = 60
): string[] {
  const slots: string[] = []
  for (let h = openHour; h < closeHour; h += intervalMins / 60) {
    const hour = Math.floor(h)
    const mins = (h - hour) * 60
    const period = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
    slots.push(
      `${displayHour}:${String(mins).padStart(2, '0')} ${period}`
    )
  }
  return slots
}

/* ─── Relative time ─── */
export function relativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diffMs = Date.now() - d.getTime()
  const diffMins = Math.round(diffMs / 60_000)

  if (diffMins < 1)   return 'just now'
  if (diffMins < 60)  return `${diffMins}m ago`
  const diffHrs = Math.round(diffMins / 60)
  if (diffHrs < 24)   return `${diffHrs}h ago`
  const diffDays = Math.round(diffHrs / 24)
  if (diffDays < 7)   return `${diffDays}d ago`
  return d.toLocaleDateString('en-IN')
}

/* ─── Format date (Indian style) ─── */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/* ─── Random colour from palette (for avatars) ─── */
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #1246FF, #4A7CFF)',
  'linear-gradient(135deg, #0D7C54, #12B07A)',
  'linear-gradient(135deg, #C8A84B, #E8C56A)',
  'linear-gradient(135deg, #6B3FD4, #A855F7)',
  'linear-gradient(135deg, #D42B2B, #F87171)',
  'linear-gradient(135deg, #0597A7, #22D3EE)',
]

export function avatarGradient(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffffff
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

/* ─── Count-up animation helper (returns RAF cleanup) ─── */
export function animateCountUp(
  el: HTMLElement,
  target: number,
  duration = 1500,
  locale = 'en-IN'
): () => void {
  const start = performance.now()
  let raf: number

  const step = (now: number) => {
    const elapsed = now - start
    const progress = Math.min(elapsed / duration, 1)
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3)
    const current = Math.round(eased * target)
    el.textContent = new Intl.NumberFormat(locale).format(current)
    if (progress < 1) {
      raf = requestAnimationFrame(step)
    }
  }

  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}