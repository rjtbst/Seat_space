import { CSSProperties, HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  style?: CSSProperties
  className?: string
  padding?: string | number
  hoverable?: boolean
}

/**
 * Visual styling (background/border/radius/shadow) now lives in
 * .dash-card / .dash-card--hoverable in globals.css — see the
 * "DASHBOARD COMPONENT CLASSES" section there. Padding stays inline since
 * it varies per call site; the hover shadow swap is now a plain CSS :hover
 * rule instead of onMouseEnter/onMouseLeave handlers.
 */
export function Card({
  children,
  style,
  className,
  padding = '18px 20px',
  hoverable,
  ...props
}: CardProps) {
  return (
    <div
      className={['dash-card', hoverable && 'dash-card--hoverable', className].filter(Boolean).join(' ')}
      style={{ padding, ...style }}
      {...props}
    >
      {children}
    </div>
  )
}