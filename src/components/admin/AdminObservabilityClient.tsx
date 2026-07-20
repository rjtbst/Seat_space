// src/components/admin/AdminObservabilityClient.tsx
'use client'

import { useState, useEffect } from 'react'
import { getDeadLetterPayload } from '@/lib/actions/admin-observability'
import type { DeadLetterRow, AlertRow } from '@/lib/actions/admin-observability'

const SEVERITY_COLORS: Record<string, { bg: string; fg: string }> = {
  info:     { bg: '#DBEAFE', fg: '#1E40AF' },
  warning:  { bg: '#FEF3C7', fg: '#92400E' },
  critical: { bg: '#FEE2E2', fg: '#991B1B' },
}

const DELIVERY_COLORS: Record<string, { bg: string; fg: string }> = {
  pending:   { bg: '#FEF3C7', fg: '#92400E' },
  delivered: { bg: '#D1FAE5', fg: '#065F46' },
  failed:    { bg: '#FEE2E2', fg: '#991B1B' },
}

function Badge({ value, colorMap }: { value: string; colorMap: Record<string, { bg: string; fg: string }> }) {
  const c = colorMap[value] ?? { bg: '#F1F1F1', fg: '#555' }
  return (
    <span style={{ background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, textTransform: 'capitalize' }}>
      {value}
    </span>
  )
}

function PayloadViewer({ webhookEventId, onClose }: { webhookEventId: string; onClose: () => void }) {
  const [payload, setPayload] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDeadLetterPayload(webhookEventId).then(res => {
      if (!res.success) setError(res.error)
      else setPayload(res.data.payload)
      setLoading(false)
    })
  }, [webhookEventId])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 600, maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>Webhook payload</h3>
        {loading && <p style={{ color: '#8B95A5' }}>Loading…</p>}
        {error && <p style={{ color: '#991B1B' }}>{error}</p>}
        {!loading && !error && (
          <pre style={{ background: '#FAF8F4', padding: 14, borderRadius: 10, fontSize: 11.5, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(payload, null, 2)}
          </pre>
        )}
        <button onClick={onClose} style={{
          marginTop: 14, padding: '8px 16px', borderRadius: 8, border: '1px solid #ECE7DC',
          background: '#fff', color: '#6B7689', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>
          Close
        </button>
      </div>
    </div>
  )
}

export default function AdminObservabilityClient({
  deadLetters, alerts, loadError,
}: { deadLetters: DeadLetterRow[]; alerts: AlertRow[]; loadError: string | null }) {
  const [viewingPayload, setViewingPayload] = useState<string | null>(null)

  if (loadError) return <div style={{ padding: 40, color: '#B91C1C' }}>Failed to load observability data: {loadError}</div>

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px', fontFamily: 'Syne, sans-serif' }}>Observability</h1>
      <p style={{ fontSize: 13, color: '#8B95A5', margin: '0 0 24px' }}>
        Webhook dead-letters and recent system alerts. This is where webhook/payout failures actually surface — see also your configured Slack channel for real-time delivery.
      </p>

      <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>
        Webhook dead-letters {deadLetters.length > 0 && <span style={{ color: '#991B1B' }}>({deadLetters.length})</span>}
      </h3>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ECE7DC', overflow: 'hidden', marginBottom: 28 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: '#FAF8F4', textAlign: 'left' }}>
              {['Provider', 'Event type', 'Error', 'Retries', 'Received', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', fontWeight: 700, color: '#6B7689', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deadLetters.map(d => (
              <tr key={d.id} style={{ borderTop: '1px solid #F3F1EC' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{d.provider}</td>
                <td style={{ padding: '12px 16px', color: '#4B5160' }}>{d.eventType}</td>
                <td style={{ padding: '12px 16px', color: '#991B1B', fontSize: 12.5, maxWidth: 280 }}>{d.errorMessage ?? (d.processedAt ? '—' : 'Stuck mid-processing')}</td>
                <td style={{ padding: '12px 16px', color: '#4B5160' }}>{d.retryCount}</td>
                <td style={{ padding: '12px 16px', color: '#A6AEBA', fontSize: 12 }}>{new Date(d.receivedAt).toLocaleString('en-IN')}</td>
                <td style={{ padding: '12px 16px' }}>
                  <button onClick={() => setViewingPayload(d.id)} style={{
                    background: 'none', border: 'none', color: '#7C3AED', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                  }}>
                    View payload
                  </button>
                </td>
              </tr>
            ))}
            {deadLetters.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#A6AEBA' }}>No dead-lettered webhooks. Everything's processing cleanly.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>Recent alerts</h3>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ECE7DC', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: '#FAF8F4', textAlign: 'left' }}>
              {['Severity', 'Source', 'Title', 'Delivery', 'When'].map(h => (
                <th key={h} style={{ padding: '12px 16px', fontWeight: 700, color: '#6B7689', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alerts.map(a => (
              <tr key={a.id} style={{ borderTop: '1px solid #F3F1EC' }}>
                <td style={{ padding: '12px 16px' }}><Badge value={a.severity} colorMap={SEVERITY_COLORS} /></td>
                <td style={{ padding: '12px 16px', color: '#4B5160', fontSize: 12.5 }}>{a.source}</td>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{a.title}</td>
                <td style={{ padding: '12px 16px' }}><Badge value={a.deliveryStatus} colorMap={DELIVERY_COLORS} /></td>
                <td style={{ padding: '12px 16px', color: '#A6AEBA', fontSize: 12 }}>{new Date(a.createdAt).toLocaleString('en-IN')}</td>
              </tr>
            ))}
            {alerts.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#A6AEBA' }}>No alerts raised yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {viewingPayload && (
        <PayloadViewer webhookEventId={viewingPayload} onClose={() => setViewingPayload(null)} />
      )}
    </div>
  )
}
