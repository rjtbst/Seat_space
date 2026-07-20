// components/student/PaymentsClient.tsx
'use client'

import type { PaymentRecord } from '@/lib/actions/students/student-profile'
import { Receipt, CheckCircle2, XCircle, Clock3, ExternalLink, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtIST } from '@/lib/ist'
import { toast } from 'sonner'

const STATUS_CFG: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  paid:               { label: 'Paid',               cls: 'bg-[#D1FAE5] text-[#0D7C54]', Icon: CheckCircle2 },
  pending:            { label: 'Pending',             cls: 'bg-[#FEF3C7] text-[#B45309]', Icon: Clock3       },
  failed:             { label: 'Failed',              cls: 'bg-[#FEE2E2] text-[#C5282C]', Icon: XCircle      },
  refunded:           { label: 'Refunded',            cls: 'bg-[#F3E8FF] text-[#6B3FD4]', Icon: CheckCircle2 },
  partially_refunded: { label: 'Partially Refunded',  cls: 'bg-[#F3E8FF] text-[#6B3FD4]', Icon: CheckCircle2 },
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  } catch {
    toast.error('Failed to copy')
  }
}

function PaymentCard({ payment }: { payment: PaymentRecord }) {
  const cfg = STATUS_CFG[payment.status] ?? STATUS_CFG.pending
  const StatusIcon = cfg.Icon

  return (
    <div className="bg-white rounded-xl border border-[#E4EAF2] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-extrabold text-[#0D1117]">
              ₹{payment.amount.toLocaleString('en-IN')}
            </span>
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1', cfg.cls)}>
              <StatusIcon className="w-2.5 h-2.5" />
              {cfg.label}
            </span>
          </div>
          <p className="text-[11px] text-[#9AACBE] mt-0.5">
            {fmtIST(payment.created_at)}
          </p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-[#F4F7FB] flex items-center justify-center flex-shrink-0">
          <Receipt className="w-4 h-4 text-[#6E7F94]" />
        </div>
      </div>

      {payment.base_amount != null && payment.platform_fee != null && (
        <div className="flex items-center gap-3 text-[11px] text-[#9AACBE]">
          <span>Seat ₹{payment.base_amount}</span>
          <span>+</span>
          <span>Platform fee ₹{payment.platform_fee}</span>
        </div>
      )}

      {payment.refunded_amount > 0 && (
        <div className="flex items-center justify-between text-[11px] bg-[#F3E8FF] text-[#6B3FD4] rounded-lg px-2.5 py-1.5">
          <span>Refunded</span>
          <span className="font-semibold">
            ₹{payment.refunded_amount}{payment.refunded_amount < payment.amount && ` · Net paid ₹${payment.amount - payment.refunded_amount}`}
          </span>
        </div>
      )}

      {payment.booking && (
        <div className="bg-[#F4F7FB] rounded-xl p-3 space-y-1">
          <p className="text-[12px] font-semibold text-[#0D1117]">{payment.booking.library_name}</p>
          <p className="text-[11px] text-[#6E7F94]">
            Seat {payment.booking.seat_label} · {fmtIST(payment.booking.start_time).split(',').slice(0, 2).join(',')}
            {' → '}
            {new Date(payment.booking.end_time + '+05:30').toLocaleTimeString('en-IN', {
              hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
            })}
          </p>
        </div>
      )}

      {payment.razorpay_payment_id && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] text-[#9AACBE] uppercase tracking-wide mb-0.5">Razorpay Payment ID</p>
            <p className="text-[11px] font-mono text-[#0D1117] truncate">{payment.razorpay_payment_id}</p>
          </div>
          <button
            onClick={() => copyToClipboard(payment.razorpay_payment_id!)}
            className="flex-shrink-0 w-7 h-7 rounded-lg bg-[#F4F7FB] border border-[#E4EAF2] flex items-center justify-center hover:border-[#1246FF] transition-colors"
          >
            <Copy className="w-3 h-3 text-[#6E7F94]" />
          </button>
        </div>
      )}

      {payment.razorpay_order_id && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] text-[#9AACBE] uppercase tracking-wide mb-0.5">Order ID</p>
            <p className="text-[11px] font-mono text-[#0D1117] truncate">{payment.razorpay_order_id}</p>
          </div>
          <button
            onClick={() => copyToClipboard(payment.razorpay_order_id!)}
            className="flex-shrink-0 w-7 h-7 rounded-lg bg-[#F4F7FB] border border-[#E4EAF2] flex items-center justify-center hover:border-[#1246FF] transition-colors"
          >
            <Copy className="w-3 h-3 text-[#6E7F94]" />
          </button>
        </div>
      )}
    </div>
  )
}

export default function PaymentsClient({ payments }: { payments: PaymentRecord[] }) {
  const totalPaid = payments
    .filter((p) => p.status === 'paid' || p.status === 'partially_refunded')
    .reduce((sum, p) => sum + (p.amount - p.refunded_amount), 0)

  return (
    <div className="p-5 md:p-7 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[20px] font-bold text-[#0D1117]">Payment History</h1>
        <p className="text-[13px] text-[#9AACBE] mt-0.5">
          {payments.length} transaction{payments.length !== 1 ? 's' : ''} ·{' '}
          ₹{totalPaid.toLocaleString('en-IN')} total paid
        </p>
      </div>

      {payments.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F4F7FB] flex items-center justify-center mb-4">
            <Receipt className="w-6 h-6 text-[#C4CDD8]" />
          </div>
          <h3 className="text-[14px] font-semibold text-[#0D1117] mb-1">No Payments Yet</h3>
          <p className="text-[12px] text-[#9AACBE] max-w-xs">
            Your payment history will appear here after your first booking.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <PaymentCard key={p.id} payment={p} />
          ))}
        </div>
      )}
    </div>
  )
}