/**
 * Inline error display used in forms.
 * <ErrorBanner error={error} />
 */
export function ErrorBanner({ error }: { error: string }) {
  if (!error) return null
  return (
    <div className="clay-raised-sm" style={{
      background: '#FDEAEA', border: 'none',
      padding: '9px 14px', marginBottom: 14,
      fontSize: 13, color: '#9B1C1C', display: 'flex', gap: 8, alignItems: 'center',
    }}>
      <span>⚠️</span> {error}
    </div>
  )
}