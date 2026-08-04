// components/student/LibraryCard.tsx
'use client'

import Image from 'next/image'
import type { LibraryCard } from '@/lib/actions/students/student-discovery'
import { effectiveSlotRate } from '@/lib/booking/types'
import { MapPin, Star, Clock, Navigation2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClayCard, ClayChip } from '@/components/ui/Clay'

const AMENITY_ICON: Record<string, string> = {
  WiFi: '📶', AC: '❄️', Parking: '🅿️', Cafeteria: '☕',
  Locker: '🔐', Printing: '🖨️', CCTV: '📹', 'Power Backup': '⚡',
}

/**
 * SLOT-ONLY ARCHITECTURE — pricing display.
 *
 * There is no longer a single "library price" (base_price). A library can
 * have multiple active slots with different rates throughout the day, so
 * the card shows:
 *   - if the library is OPEN right now: the rate of the CURRENT slot
 *     (status.currentSlot), prefixed "Now:" — this is exactly the rate
 *     lib/booking/pricing.ts would apply to a booking starting right now.
 *   - if CLOSED, or no slots configured at all: the lowest active rate
 *     across all slots ("From ₹X/hr"), or nothing if there are no active
 *     slots.
 *
 * This keeps the card consistent with lib/booking/pricing.ts — it never
 * shows a number that initiateBooking/calculateBookingAmount couldn't
 * also produce for *some* booking at this library.
 */
function priceDisplay(library: LibraryCard): { label: string; rate: number } | null {
  const activeSlots = library.slots.filter((s) => s.is_active)
  if (activeSlots.length === 0) return null

  if (library.status.isOpen && library.status.currentSlot) {
    return { label: 'Now', rate: effectiveSlotRate(library.status.currentSlot) }
  }

  const lowest = [...activeSlots].sort(
    (a, b) => effectiveSlotRate(a) - effectiveSlotRate(b),
  )[0]
  return { label: 'From', rate: effectiveSlotRate(lowest) }
}

export default function LibraryCardTile({ library }: { library: LibraryCard }) {
  const open      = library.status.isOpen
  const occupancy = library.total_seats > 0
    ? Math.round(((library.total_seats - library.available_seats) / library.total_seats) * 100)
    : 0
  const price = priceDisplay(library)

  return (
    <ClayCard href={`/library/${library.id}`} className="group block">
      {/* Image */}
      <div className="relative h-44 bg-[#F0EDE8] rounded-t-[20px] overflow-hidden">
        {library.cover_url ? (
          <Image
            src={library.cover_url}
            alt={library.name}
            fill
            sizes="(max-width:640px)100vw,(max-width:1024px)50vw,33vw"
            className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-30 text-5xl">📚</div>
        )}

        {/* Open/Closed badge — driven by slot_configs via resolveLibraryStatus */}
        <div className="absolute top-2.5 left-2.5">
          <ClayChip tone={open ? 'success' : 'dark'}>{open ? '● Open' : '○ Closed'}</ClayChip>
        </div>

        {/* Full badge */}
        {library.available_seats === 0 && library.total_seats > 0 && (
          <div className="absolute top-2.5 right-2.5">
            <ClayChip tone="danger">Full</ClayChip>
          </div>
        )}

        {/* Rating */}
        {library.rating > 0 && (
          <ClayChip tone="neutral" className="absolute bottom-2.5 right-2.5 gap-1 bg-white/95 text-[#1A1714]">
            <Star className="w-3 h-3 text-[#F59E0B] fill-[#F59E0B]" />
            {library.rating.toFixed(1)}
          </ClayChip>
        )}
      </div>

      {/* Body */}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-[#1A1714] leading-snug line-clamp-1 group-hover:text-[#1246FF] transition-colors">
            {library.name}
          </h3>
          {library.distance_km != null && (
            <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] text-[#9B9591]">
              <Navigation2 className="w-2.5 h-2.5" />
              {library.distance_km < 1
                ? `${(library.distance_km * 1000).toFixed(0)}m`
                : `${library.distance_km.toFixed(1)}km`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 mt-0.5 text-[11px] text-[#9B9591]">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="line-clamp-1">
            {[library.area, library.city].filter(Boolean).join(', ')}
          </span>
        </div>

        {/* Today's hours — derived from slot_configs (lib/booking/libraryStatus.ts) */}
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[#6B6560]">
          <Clock className="w-3 h-3 flex-shrink-0" />
          {library.status.todayHoursLabel}
        </div>

        {/* Seat availability bar — sunken clay groove with a raised fill */}
        {library.total_seats > 0 && (
          <div className="mt-2.5">
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-[#9B9591]">
                {library.available_seats}/{library.total_seats} seats free
              </span>
              <span className={cn(
                'text-[10px] font-semibold',
                library.available_seats === 0 ? 'text-[#C5282C]'
                : library.available_seats <= 3 ? 'text-[#D97706]'
                : 'text-[#0D7C54]',
              )}>
                {library.available_seats === 0 ? 'Full' : `${library.available_seats} left`}
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ boxShadow: 'inset 1px 1px 3px rgba(163,177,198,.3), inset -1px -1px 2px rgba(255,255,255,.5)' }}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  occupancy >= 100 ? 'bg-[#C5282C]'
                  : occupancy >= 80  ? 'bg-[#D97706]'
                  : 'bg-[#0D7C54]',
                )}
                style={{ width: `${Math.min(occupancy, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Amenities */}
        {library.amenities.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            {library.amenities.slice(0, 3).map((a) => (
              <ClayChip key={a} tone="neutral" className="text-[9px] px-2 py-1">
                {AMENITY_ICON[a] ?? ''} {a}
              </ClayChip>
            ))}
            {library.amenities.length > 3 && (
              <span className="text-[9px] text-[#9B9591]">+{library.amenities.length - 3}</span>
            )}
          </div>
        )}

        {/* Price — slot-based, see priceDisplay() above */}
        <div
          className="flex items-center justify-between mt-3 pt-3"
          style={{ boxShadow: 'inset 0 1px 0 rgba(163,177,198,.25)' }}
        >
          <div>
            {price ? (
              <>
                <span className="text-[10px] text-[#9B9591] mr-1">{price.label}</span>
                <span className="text-[13px] font-bold text-[#1A1714]">₹{price.rate}</span>
                <span className="text-[10px] text-[#9B9591]">/hr</span>
              </>
            ) : (
              <span className="text-[11px] text-[#9B9591]">No slots configured</span>
            )}
          </div>
          {library.plans.length > 0 && (
            <ClayChip tone="info">
              {library.plans.length} plan{library.plans.length > 1 ? 's' : ''}
            </ClayChip>
          )}
        </div>
      </div>
    </ClayCard>
  )
}
