/**
 * Inline button spinner. Use inside submit buttons when isPending=true.
 * <Spinner /> — automatically 14×14 white border spinner.
 */
export function Spinner() {
  return (
    <span style={{
      width: 14, height: 14,
      border: '2px solid rgba(255,255,255,.35)',
      borderTopColor: '#fff', borderRadius: '50%',
      display: 'inline-block',
      animation: 'spin .65s linear infinite',
      flexShrink: 0,
    }} />
  )
}