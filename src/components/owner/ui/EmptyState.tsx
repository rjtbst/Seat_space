interface EmptyStateProps {
  icon?:     string
  title:     string
  subtitle?: string
  action?:   React.ReactNode
}

/**
 * Visual treatment now lives in .dash-empty-state / .dash-empty-state__*
 * in globals.css. (Also fixes a small pre-existing inconsistency: the
 * outer wrapper's color was hardcoded as '#9AAAB8' instead of referencing
 * TEXT_MUTED from theme.ts, even though they're the same value — the new
 * .dash-empty-state class uses the shared --dash-text-muted variable, so
 * this can no longer drift if the muted color ever changes.)
 */
export function EmptyState({ icon = '📭', title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="dash-empty-state">
      <div className="dash-empty-state__icon">{icon}</div>
      <div className="dash-empty-state__title">{title}</div>
      {subtitle && <div className="dash-empty-state__subtitle">{subtitle}</div>}
      {action}
    </div>
  )
}