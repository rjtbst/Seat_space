// src/app/(admin)/admin/observability/page.tsx
import { listWebhookDeadLetters, listRecentAlerts } from '@/lib/actions/admin-observability'
import AdminObservabilityClient from '@/components/admin/AdminObservabilityClient'

export const dynamic = 'force-dynamic'

export default async function AdminObservabilityPage() {
  const [deadLettersRes, alertsRes] = await Promise.all([
    listWebhookDeadLetters(),
    listRecentAlerts(),
  ])

  return (
    <AdminObservabilityClient
      deadLetters={deadLettersRes.success ? deadLettersRes.data : []}
      alerts={alertsRes.success ? alertsRes.data : []}
      loadError={!deadLettersRes.success ? deadLettersRes.error : (!alertsRes.success ? alertsRes.error : null)}
    />
  )
}
