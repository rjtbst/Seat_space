/**
 * Inline error display used in forms.
 * <ErrorBanner error={error} />
 */
export function ErrorBanner({ error }: { error: string }) {
  if (!error) return null
  return (
    <div style={{
      background: '#FDEAEA', border: '1px solid rgba(212,43,43,.2)',
      borderRadius: 9, padding: '9px 14px', marginBottom: 14,
      fontSize: 13, color: '#9B1C1C', display: 'flex', gap: 8, alignItems: 'center',
    }}>
      <span>⚠️</span> {error}
    </div>
  )
}