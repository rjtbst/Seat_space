// src/components/admin/AdminDashboardClient.tsx
'use client'

import { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { PlatformOverview, TrendPoint } from '@/lib/actions/admin-dashboard'

const ACCENT = '#7C3AED'
const COLORS = { gmv: '#7C3AED', commission: '#10B981', subscription: '#F59E0B', students: '#3B82F6', owners: '#EC4899', staff: '#06B6D4' }

function formatINR(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function Card({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '18px 20px',
      border: '1px solid #ECE7DC', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
    }}>
      <p style={{ fontSize: 12.5, color: '#8B95A5', margin: 0, fontWeight: 600 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, margin: '6px 0 0', color: accent ?? '#1A1D21', fontFamily: 'Syne, sans-serif' }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: '#A6AEBA', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  )
}

export default function AdminDashboardClient({
  overview, bookingTrend, revenueTrend, userGrowth, loadError,
}: {
  overview: PlatformOverview | null
  bookingTrend: TrendPoint[]
  revenueTrend: TrendPoint[]
  userGrowth: TrendPoint[]
  loadError: string | null
}) {
  const [chartRange, setChartRange] = useState<'30' | '90'>('30')

  if (loadError) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#B91C1C' }}>
        Failed to load dashboard: {loadError}
      </div>
    )
  }
  if (!overview) return <div style={{ padding: 40, color: '#8B95A5' }}>Loading…</div>

  const sliceLen = chartRange === '30' ? 30 : 90
  const bookingData = bookingTrend.slice(-sliceLen)
  const revenueData = revenueTrend.slice(-sliceLen)
  const growthData = userGrowth.slice(-sliceLen)

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, fontFamily: 'Syne, sans-serif' }}>Platform Dashboard</h1>
        <div style={{ display: 'flex', gap: 6, background: '#fff', borderRadius: 10, padding: 4, border: '1px solid #ECE7DC' }}>
          {(['30', '90'] as const).map(r => (
            <button key={r} onClick={() => setChartRange(r)} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600,
              background: chartRange === r ? ACCENT : 'transparent',
              color: chartRange === r ? '#fff' : '#6B7689',
            }}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      {/* Headline metric grid */}
      <div className="admin-grid-5" style={{ marginBottom: 16 }}>
        <Card label="Total GMV" value={formatINR(overview.totalGmv)} sub="Gross collected from students" accent={COLORS.gmv} />
        <Card label="Platform Revenue" value={formatINR(overview.totalPlatformRevenue)} sub="Commission + subscriptions" accent={COLORS.commission} />
        <Card label="Owner Payouts" value={formatINR(overview.totalOwnerPayouts)} sub="Paid/owed to library owners" accent={COLORS.owners} />
        <Card label="Active Libraries" value={String(overview.activeLibraries)} sub={`${overview.totalLibraries} total registered`} />
        <Card label="Pending Approvals" value={String(overview.pendingApprovals)} accent={overview.pendingApprovals > 0 ? '#D97706' : undefined} />
      </div>

      <div className="admin-grid-4" style={{ marginBottom: 16 }}>
        <Card label="Students" value={overview.totalStudents.toLocaleString('en-IN')} accent={COLORS.students} />
        <Card label="Owners" value={overview.totalOwners.toLocaleString('en-IN')} accent={COLORS.owners} />
        <Card label="Staff" value={overview.totalStaff.toLocaleString('en-IN')} accent={COLORS.staff} />
        <Card label="Bookings Today" value={String(overview.bookingsToday)} sub={`${overview.bookingsLast7d} this week · ${overview.bookingsLast30d} this month`} />
      </div>

      <div className="admin-grid-4" style={{ marginBottom: 28 }}>
        <Card label="Active Subscriptions" value={String(overview.activeSubscriptions)} accent="#10B981" />
        <Card label="Past Due Subscriptions" value={String(overview.pastDueSubscriptions)} accent={overview.pastDueSubscriptions > 0 ? '#DC2626' : undefined} />
        <Card label="Pending Refunds" value={String(overview.pendingRefunds)} accent={overview.pendingRefunds > 0 ? '#D97706' : undefined} />
        <Card label="Refunded (30d)" value={formatINR(overview.refundedLast30d)} />
      </div>

      {/* Revenue trend */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #ECE7DC', marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px' }}>Revenue trend</h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={revenueData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE5" />
            <XAxis dataKey="date" tickFormatter={fmtDate} fontSize={11} stroke="#A6AEBA" />
            <YAxis fontSize={11} stroke="#A6AEBA" tickFormatter={(v) => formatINR(v)} />
            <Tooltip formatter={(v: number) => formatINR(v)} labelFormatter={fmtDate} />
            <Legend />
            <Area type="monotone" dataKey="gmv" name="GMV" stroke={COLORS.gmv} fill={COLORS.gmv} fillOpacity={0.08} strokeWidth={2} />
            <Area type="monotone" dataKey="commission" name="Commission" stroke={COLORS.commission} fill={COLORS.commission} fillOpacity={0.12} strokeWidth={2} />
            <Area type="monotone" dataKey="subscriptionRevenue" name="Subscriptions" stroke={COLORS.subscription} fill={COLORS.subscription} fillOpacity={0.12} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="admin-grid-2">
        {/* Booking trend */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #ECE7DC' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px' }}>Booking trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bookingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE5" />
              <XAxis dataKey="date" tickFormatter={fmtDate} fontSize={11} stroke="#A6AEBA" />
              <YAxis fontSize={11} stroke="#A6AEBA" />
              <Tooltip labelFormatter={fmtDate} />
              <Bar dataKey="bookings" name="Bookings" fill={ACCENT} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* User growth */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #ECE7DC' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px' }}>User growth</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={growthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE5" />
              <XAxis dataKey="date" tickFormatter={fmtDate} fontSize={11} stroke="#A6AEBA" />
              <YAxis fontSize={11} stroke="#A6AEBA" />
              <Tooltip labelFormatter={fmtDate} />
              <Legend />
              <Line type="monotone" dataKey="students" name="Students" stroke={COLORS.students} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="owners" name="Owners" stroke={COLORS.owners} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="staff" name="Staff" stroke={COLORS.staff} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
