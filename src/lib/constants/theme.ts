// ─── Colors ───────────────────────────────────────────────────────────────────
export const ACCENT       = '#0D7C54'
export const ACCENT_LIGHT = '#D1FAE5'
export const BLUE         = '#1E5CFF'
export const BLUE_DARK    = '#1447D4'
export const BLUE_LIGHT   = '#E8EFFE'
export const TEAL         = '#0597A7'
export const PURPLE       = '#7C3AED'
export const AMBER        = '#F59E0B'
export const RED          = '#EF4444'

// ─── Neutrals ─────────────────────────────────────────────────────────────────
export const TEXT_PRIMARY   = '#0A0D12'
export const TEXT_SECONDARY = '#6B7689'
export const TEXT_MUTED     = '#9AAAB8'
export const BORDER         = '#E2DDD4'
export const BG_CARD        = '#FDFCF9'
export const BG_PAGE        = '#F4F7FB'
export const BG_HOVER       = '#F0EDE8'

// ─── Status badge styles — one place, consumed everywhere ────────────────────
export const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  confirmed:  { bg: BLUE_LIGHT,   color: BLUE_DARK, label: 'Booked'        },
  checked_in: { bg: ACCENT_LIGHT, color: '#0A5E3F', label: '✓ Checked In'  },
  held:       { bg: '#FEF3E2',    color: '#92400E', label: 'Held'          },
  cancelled:  { bg: '#FEE2E2',    color: '#9B1C1C', label: 'Cancelled'     },
  no_show:    { bg: '#FEE2E2',    color: '#9B1C1C', label: 'No-show'       },
  completed:  { bg: '#F0FDF4',    color: '#14532D', label: 'Completed'     },
}

// ─── Typography ───────────────────────────────────────────────────────────────
export const FONT_DISPLAY = 'Syne, sans-serif'
export const FONT_BODY    = 'DM Sans, sans-serif'

// ─── Shadows ──────────────────────────────────────────────────────────────────
export const SHADOW_SM   = '0 2px 8px rgba(10,13,18,.04)'
export const SHADOW_MD   = '0 6px 24px rgba(10,13,18,.10)'
export const SHADOW_ACCENT = '0 2px 10px rgba(13,124,84,.25)'

// Add to existing theme.ts — shared input style used across all forms
import type { CSSProperties } from 'react'

export const INP_STYLE: CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1.5px solid #E2DDD4', borderRadius: 9,
  fontSize: 13, color: '#0A0D12', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', background: '#FDFCF9',
  boxSizing: 'border-box',
}