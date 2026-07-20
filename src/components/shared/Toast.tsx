/**
 * Drop-in toast notification. Rendered conditionally at the top of any client component.
 * <Toast toast={toast} />
 */
export function Toast({ toast }: { toast: { msg: string; ok?: boolean } | null }) {
  if (!toast) return null
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 200,
      background: toast.ok !== false ? '#0A0D12' : '#C5282C',
      color: '#fff', padding: '10px 18px',
      borderRadius: 10, fontSize: 13, fontWeight: 600,
      boxShadow: '0 4px 20px rgba(0,0,0,.2)',
      animation: 'fadeIn .2s ease',
      pointerEvents: 'none',
    }}>
      {toast.msg}
    </div>
  )
}