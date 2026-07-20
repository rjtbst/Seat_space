'use client'
import { ACCENT } from '@/lib/constants/theme'

interface ToggleProps {
  on:        boolean
  onChange:  (v: boolean) => void
  disabled?: boolean
}

/**
 * Static visual treatment now lives in .dash-toggle / .dash-toggle__dot in
 * globals.css. The dot's horizontal position genuinely depends on `on` at
 * runtime, so it's still set inline — but via a single CSS variable
 * (--toggle-dot-left) rather than a full style object, which keeps the
 * "what's static vs dynamic" boundary explicit in the code. The track
 * color is also dynamic (on/off) and stays inline for the same reason.
 */
export function Toggle({ on, onChange, disabled }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      className="dash-toggle"
      style={{ background: on ? ACCENT : '#C8D4C8' }}
    >
      <div
        className="dash-toggle__dot"
        style={{ '--toggle-dot-left': on ? '19px' : '3px' } as React.CSSProperties}
      />
    </button>
  )
}