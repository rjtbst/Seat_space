import { FONT_DISPLAY, TEXT_PRIMARY, TEXT_SECONDARY } from '@/lib/constants/theme'
import { useIsMobile } from '@/hooks/useIsMobile'

interface PageHeaderProps {
  title:    string
  subtitle: string
  action?:  React.ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      marginBottom: isMobile ? 16 : 24, flexWrap: 'wrap', gap: 12,
    }}>
      <div>
        <h1 style={{
          fontFamily: FONT_DISPLAY, fontWeight: 800,
          fontSize: isMobile ? 20 : 24, color: TEXT_PRIMARY,
          letterSpacing: '-0.03em', margin: 0, marginBottom: 4,
        }}>
          {title}
        </h1>
        <div style={{ fontSize: isMobile ? 12 : 13, color: TEXT_SECONDARY }}>{subtitle}</div>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}