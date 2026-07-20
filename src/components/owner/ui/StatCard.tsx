import { ACCENT } from '@/lib/constants/theme'

interface StatCardProps {
  icon:        string
  label:       string
  value:       string
  delta?:      string
  deltaColor?: string
  sub?:        string
}

/**
 * Visual treatment (background/border/radius/shadow/typography) now lives
 * in .dash-stat-card / .dash-stat-card__* in globals.css. Layout (flex,
 * gaps, spacing between the icon row and value) stays inline since it's
 * structural to this specific component, not a reusable visual pattern.
 */
export function StatCard({ icon, label, value, delta, deltaColor: dc, sub }: StatCardProps) {
  return (
    <div className="dash-stat-card" style={{ padding: '16px 18px', flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span className="dash-stat-card__label">{label}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div className="dash-stat-card__value" style={{ marginBottom: 4 }}>
        {value}
      </div>
      {delta && (
        <div style={{ fontSize: 12, fontWeight: 600, color: dc ?? ACCENT }}>
          {delta}
          {sub && <span className="dash-stat-card__delta-sub" style={{ marginLeft: 4 }}>{sub}</span>}
        </div>
      )}
    </div>
  )
}