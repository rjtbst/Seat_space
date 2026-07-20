'use client'

import { useState } from 'react'
import type { ComponentType } from 'react'
import {
  MapPin,
  SlidersHorizontal,
  MousePointerClick,
  ArrowRight,
  Repeat,
  Tag,
  Bell,
  Calendar,
  ScanLine,
  UserPlus,
  BookOpen,
  ClipboardList,
  GraduationCap,
  Building2,
  Users,
} from 'lucide-react'
import SeatGrid from './SeatGrid'
import { useAmbientSeats } from './useAmbientSeats'
import OwnersOutcomes from './OwnersOutcomes'

type RoleKey = 'students' | 'owners' | 'staff'

// lucide-react icon components accept size as string | number; widen here to match
type IconType = ComponentType<{ size?: number | string; className?: string }>

interface Capability {
  icon: IconType
  label: string
}

const ROLE_TABS: {
  key: RoleKey
  label: string
  icon: IconType
  blurb: string
}[] = [
  {
    key: 'students',
    label: 'Students',
    icon: GraduationCap,
    blurb: 'This is what fills your seats \u2014 the search that ends at your front door.',
  },
  {
    key: 'owners',
    label: 'Library owners',
    icon: Building2,
    blurb: 'The business outcomes you actually care about.',
  },
  {
    key: 'staff',
    label: 'Front-desk staff',
    icon: Users,
    blurb: 'The floor, without a paper register.',
  },
]

const JOURNEY_STEPS = [
  { icon: MapPin, label: 'Search nearby' },
  { icon: SlidersHorizontal, label: 'Compare & filter' },
  { icon: MousePointerClick, label: 'Book the exact seat' },
]

const STUDENT_FOLLOWUP_CAPS: Capability[] = [
  { icon: Repeat, label: 'Buy a membership plan' },
  { icon: Tag, label: 'Apply a coupon code' },
  { icon: Bell, label: 'Get booking & due-date reminders' },
  { icon: Calendar, label: 'Manage upcoming bookings' },
]

const STAFF_CAPS: Capability[] = [
  { icon: ScanLine, label: 'Scan a code to check someone in' },
  { icon: UserPlus, label: 'Seat a walk-in on the same map' },
  { icon: BookOpen, label: 'Issue and return books' },
  { icon: ClipboardList, label: "See today's bookings at the desk" },
]

function CapabilityChip({ icon: Icon, label, index }: Capability & { index: number }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-[11px] border border-divider bg-surface px-3.5 py-3 animate-fade-up"
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <Icon size={16} className="text-blue flex-shrink-0" />
      <span className="text-[13.5px] text-ink-2 leading-snug">{label}</span>
    </div>
  )
}

function StudentPanel() {
  const cells = useAmbientSeats(15, { tickMs: 1700 })
  const filters = ['Open now', 'Under \u20b920/hr', '< 1 km']

  return (
    <div className="space-y-6">
      {/* Discovery journey */}
      <div className="card p-6 md:p-7">
        <div className="flex items-center justify-center flex-wrap gap-3 md:gap-5">
          {JOURNEY_STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center gap-3 md:gap-5">
              <div className="flex flex-col items-center gap-2">
                <div className="w-11 h-11 rounded-[12px] bg-blue-lt flex items-center justify-center">
                  <step.icon size={18} className="text-blue-dk" />
                </div>
                <span className="text-[12.5px] font-semibold text-ink text-center">{step.label}</span>
              </div>
              {i < JOURNEY_STEPS.length - 1 && (
                <ArrowRight size={16} className="text-pale flex-shrink-0 -mt-5" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Live seats + filters */}
      <div className="card p-6 md:p-7">
        <div className="flex gap-2 mb-4 flex-wrap justify-center">
          {filters.map((f) => (
            <span key={f} className="chip chip-blue">
              {f}
            </span>
          ))}
        </div>
        <SeatGrid
          cells={cells}
          cols={15}
          cellSize={18}
          gap={4}
          className="mx-auto justify-center"
          label="A student's live view of seat availability"
        />
        <p className="text-[12.5px] text-pale mt-4 text-center">
          Live, before they've left home \u2014 no phone call needed.
        </p>
      </div>

      {/* After the booking */}
      <div className="grid sm:grid-cols-2 gap-3">
        {STUDENT_FOLLOWUP_CAPS.map((c, i) => (
          <CapabilityChip key={c.label} {...c} index={i} />
        ))}
      </div>
    </div>
  )
}

function StaffPanel() {
  const cells = useAmbientSeats(12, { tickMs: 1900 })
  return (
    <div className="grid md:grid-cols-[1fr_1.3fr] gap-6 items-start">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <ScanLine size={16} className="text-blue" />
          <span className="text-[13px] font-semibold text-ink">Front desk, today</span>
        </div>
        <SeatGrid cells={cells} cols={4} cellSize={20} gap={4} label="Front desk view of seats" />
        <p className="text-[12px] text-pale mt-4">Same map, same seat, whoever assigns it.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {STAFF_CAPS.map((c, i) => (
          <CapabilityChip key={c.label} {...c} index={i} />
        ))}
      </div>
    </div>
  )
}

export default function ExplorePlatform() {
  const [active, setActive] = useState<RoleKey>('students')

  return (
    <section id="explore-platform" className="py-20 md:py-28 px-6 md:px-10 bg-warm/40">
      <div className="max-w-[1100px] mx-auto">
        <div className="reveal text-center max-w-[640px] mx-auto mb-12">
          <span className="chip chip-gold mb-4">More than a dashboard</span>
          <h2 className="font-syne font-extrabold text-display-md text-ink mb-4">
            We don&apos;t just help you run the library.
            <br />
            We help students find it.
          </h2>
          <p className="text-[15px] text-muted">
            A management tool only matters if seats are filling. So half of
            seatspace is the part that puts your library in front of
            students searching nearby \u2014 the other half is what happens once
            they walk in.
          </p>
        </div>

        {/* Tabs */}
        <div className="reveal delay-200 flex justify-center gap-2 mb-10 flex-wrap">
          {ROLE_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = active === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActive(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-semibold transition-all duration-200 border ${
                  isActive
                    ? 'bg-ink text-white border-ink shadow-sm'
                    : 'bg-surface text-muted border-divider hover:border-ink/30 hover:text-ink'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Panel */}
        <div key={active} className="reveal visible">
          <p className="text-center text-[14px] text-muted mb-8 animate-fade-in">
            {ROLE_TABS.find((t) => t.key === active)?.blurb}
          </p>

          {active === 'students' && <StudentPanel />}
          {active === 'owners' && <OwnersOutcomes />}
          {active === 'staff' && <StaffPanel />}
        </div>
      </div>
    </section>
  )
}
