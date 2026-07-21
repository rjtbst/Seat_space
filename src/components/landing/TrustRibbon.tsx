import { ShieldCheck, Lock, Settings2 } from 'lucide-react'

const SIGNALS = [
  { icon: ShieldCheck, label: 'Verified libraries' },
  { icon: Lock, label: 'Secure payments' },
  { icon: Settings2, label: 'Reliable platform' },
]

const DESIGNED_FOR = ['Study libraries', 'Reading rooms', 'Exam-prep libraries', 'Co-learning spaces']

/**
 * A quiet, recurring credibility strip — not a scene, not a persona.
 * Trust is stated once, plainly, here, and otherwise shown through the
 * product itself (payouts arriving on schedule, listings being reviewed)
 * rather than argued for on its own.
 */
export default function TrustRibbon() {
  return (
    <div className="border-y border-divider bg-surface">
      <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-4 flex flex-col items-center gap-2.5">
        <div className="flex items-center justify-center gap-6 md:gap-10 flex-wrap">
          {SIGNALS.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon size={14} className="text-blue" />
              <span className="text-[12.5px] font-medium text-muted">{label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className="text-[11px] text-pale">Built for:</span>
          {DESIGNED_FOR.map((label) => (
            <span key={label} className="chip chip-muted text-[11px]">
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
