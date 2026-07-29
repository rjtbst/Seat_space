// lib/actions/student-discovery.ts
'use server'

/**
 * Student server actions — library browsing, search, and price/seat availability previews.
 *
 * Split out of the former monolithic lib/actions/student.ts (2,279 lines,
 * 26 exported functions across ~10 unrelated concerns) into focused
 * per-concern files. See lib/actions/student-discovery.ts,
 * student-bookings.ts, student-subscriptions.ts, student-books.ts,
 * student-profile.ts for the full set.
 *
 * Booking payments settle to the platform's own Razorpay account and are
 * held in escrow (payments.escrow_status) until the booking is checked in
 * and has ended — see lib/booking/escrow.ts for the fee-on-top split used
 * when computing the eventual owner payout.
 * All timestamps are plain IST wall-clock strings (no Z / offset suffix).
 * See lib/ist.ts for the convention.
 */

import { revalidatePath } from 'next/cache'
import {
  createServerSupabaseClient,
  getSupabaseUser,
} from '@/lib/supabase/server'
import { getAllAmenitiesCached } from '@/lib/booking/amenitiesCache'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { z } from 'zod'
import {
  nowIST,
  monthRangeIST,
  validateISTRange,
  inputToDB,
} from '@/lib/ist'
import { fetchActiveSlotConfigs, fetchSlotConfigs, fetchActiveSlotConfigsCached } from '@/lib/booking/slotConfigService'
import { getActiveCitiesCached } from '@/lib/booking/citiesCache'
import { calculateBookingAmount }   from '@/lib/booking/pricing'
import { computeEscrowSplit, computeFeeOnTopSplit, DEFAULT_COMMISSION_BPS } from '@/lib/booking/escrow'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { validateBooking } from '@/lib/booking/slotBoundaryValidation'
import { resolveLibraryStatus, type LibraryStatus } from '@/lib/booking/libraryStatus'
import type { SlotConfig }          from '@/lib/booking/types'
import { listSeatLayout } from '@/repositories/seats.repository'
// Static import — avoids TypeScript losing track of exported types
// when called via dynamic `await import()` inside server action functions.
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
} from '@/lib/razorpay/server'
import {
  IS_TEST_MODE,
  makeTestOrderId,
  makeTestPaymentId,
  TEST_SIGNATURE,
  isTestPayload,
} from '@/lib/testMode'

/* ─── Shared result type ─────────────────────────────────────────────────── */
import type { ActionResult, ActionOk, ActionErr } from '@/lib/actions/shared/action-result'
export type { ActionResult, ActionOk, ActionErr }

/* ══════════════════════════════════════════════════════════════════════════$
   PUBLIC TYPES
══════════════════════════════════════════════════════════════════════════ */

export type LibraryPlan = {
  id:            string
  name:          string
  price:         number
  duration_days: number
  scope:         string
  time_window_start: string | null
  time_window_end:   string | null
  days_of_week:      number[] | null
}

export type LibraryCard = {
  id:              string
  name:            string
  city:            string
  area:            string
  address:         string
  description:     string | null
  latitude:        number | null
  longitude:       number | null
  rating:          number
  total_reviews:   number
  is_active:       boolean
  cover_url:       string | null
  image_urls:      string[]
  amenities:       string[]
  total_seats:     number
  available_seats: number
  plans:           LibraryPlan[]
  distance_km:     number | null
  /** All slot configs (active + inactive) — slot-only architecture: this
   *  replaces base_price/open_time/close_time as the source of pricing AND
   *  operating hours. */
  slots:           SlotConfig[]
  /** Derived from `slots` via lib/booking/libraryStatus.ts — single source
   *  of truth for open/closed badges everywhere. */
  status:          LibraryStatus
}

export type SeatAvailability = {
  id:            string
  row_label:     string
  column_number: number
  label:         string
  is_available:  boolean
}

export type ExploreFilters = {
  lat?:           number
  lng?:           number
  search?:        string
  city?:          string          // explicit city filter from URL param
  area?:          string
  open_now?:      boolean
  amenities?:     string[]
  page?:          number
  limit?:         number
  radius_km?:     number          // GPS bounding box radius; default 50 km
  // ↓ passed from the server page when no lat/lng and no ?city param
  profile_city?:  string         // from users.city
  profile_state?: string         // from users.state — for state-level fallback
}


/* ══════════════════════════════════════════════════════════════════════════$
   PRIVATE HELPERS
══════════════════════════════════════════════════════════════════════════ */

function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R  = 6371
  const dL = ((lat2 - lat1) * Math.PI) / 180
  const dG = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dL / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dG / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function buildCard(
  lib:          Record<string, any>,
  bookedIds:    Set<string>,
  plansByLib:   Record<string, LibraryPlan[]>,
  slotsByLib:   Record<string, SlotConfig[]>,
  userLat:      number | null,
  userLng:      number | null,
): LibraryCard {
  const images: { image_url: string; is_cover: boolean }[] = lib.library_images ?? []
  const cover      = images.find((i) => i.is_cover)?.image_url ?? images[0]?.image_url ?? null
  const amenities  = (lib.library_amenities ?? [])
    .map((la: any) => la.amenities?.name as string | undefined)
    .filter((n): n is string => !!n)
  const allSeats: { id: string; is_active: boolean }[] = lib.seats ?? []
  const active     = allSeats.filter((s) => s.is_active)
  const booked     = active.filter((s) => bookedIds.has(s.id)).length
  const available  = Math.max(0, active.length - booked)
  const libLat     = lib.latitude  != null ? Number(lib.latitude)  : null
  const libLng     = lib.longitude != null ? Number(lib.longitude) : null
  const distanceKm =
    userLat != null && userLng != null && libLat != null && libLng != null
      ? parseFloat(haversineKm(userLat, userLng, libLat, libLng).toFixed(1))
      : null

  const slots = slotsByLib[lib.id] ?? []

  return {
    id:              lib.id,
    name:            lib.name     ?? '',
    city:            lib.city     ?? '',
    area:            lib.area     ?? '',
    address:         lib.address  ?? '',
    description:     lib.description ?? null,
    latitude:        libLat,
    longitude:       libLng,
    rating:          Number(lib.rating        ?? 0),
    total_reviews:   Number(lib.total_reviews ?? 0),
    is_active:       lib.is_active  ?? false,
    cover_url:       cover,
    image_urls:      images.map((i) => i.image_url),
    amenities,
    total_seats:     active.length,
    available_seats: available,
    plans:           plansByLib[lib.id] ?? [],
    distance_km:     distanceKm,
    slots,
    status:          resolveLibraryStatus(slots),
  }
}


/* ══════════════════════════════════════════════════════════════════════════$
   EXPLORE LIBRARIES
══════════════════════════════════════════════════════════════════════════ */

export async function exploreLibraries(filters: ExploreFilters = {}): Promise<{
  libraries:    LibraryCard[]
  total:        number
  cities:       string[]
  // What filter mode is active — used by ExploreClient to show the right banner
  location_mode: 'gps' | 'profile_city' | 'profile_state' | 'all'
}> {
  const supabase = await createServerSupabaseClient()
  const {
    lat, lng, search, city, area, open_now,
    amenities = [], page = 1, limit = 12,
    profile_city, profile_state,
    radius_km = 50,
  } = filters

  /**
   * LOCATION MODE PRIORITY
   * ──────────────────────
   * 1. lat+lng present in URL  → GPS mode  (sort nearest first)
   * 2. ?city= param present    → explicit city filter (user picked a city)
   * 3. profile_city set        → auto-filter by student's home city
   * 4. profile_state set       → auto-filter by student's home state
   * 5. nothing                 → show all, sort by rating
   */
  const hasGPS          = lat != null && lng != null
  const hasExplicitCity = !!city
  const locationMode: 'gps' | 'profile_city' | 'profile_state' | 'all' =
    hasGPS          ? 'gps'
    : hasExplicitCity ? 'all'          // user overrode — treat as all with city filter
    : profile_city   ? 'profile_city'
    : profile_state  ? 'profile_state'
    : 'all'

  // Resolve effective city/state filter
  const effectiveCity  = city          // explicit URL param wins
    ?? (locationMode === 'profile_city'  ? profile_city  : undefined)
  const effectiveState = locationMode === 'profile_state' ? profile_state : undefined

  let allRows: any[]
  let total:   number

  if (hasGPS && lat != null && lng != null) {
    // ── GPS mode: PostGIS-backed distance search ──────────────────────────
    // Previously this fetched up to 200 bounding-box candidates and sorted
    // them by exact haversine distance IN JAVASCRIPT, then sliced for the
    // requested page. That silently capped total results at 200 and broke
    // pagination beyond page ~17 for any area with more than 200 nearby
    // libraries — invisible in testing, a real defect at 10,000+ libraries
    // with realistic density. search_libraries_by_distance() does the
    // radius filter, distance ordering (via the geo_point GiST index's <->
    // KNN operator), and LIMIT/OFFSET pagination all inside one indexed
    // query, with a TRUE total count via a window function.
    //
    // City/area/search filters, if present alongside GPS coordinates, are
    // applied as an additional pass over the distance-ranked page — this
    // mirrors the pre-existing behavior (GPS mode treated explicit filters
    // as refinements on top of "nearby"), but for the common case (GPS
    // only, no text filters) this is now a single efficient indexed query
    // with no row cap.
    // NOTE: unlike the non-GPS branch below (which filters only on
    // is_active and otherwise relies on RLS to hide unapproved/unsubscribed
    // libraries), search_libraries_by_distance explicitly filters on
    // approval_status='approved' AND has_active_platform_subscription() —
    // this is intentional and consistent with the public_view_approved_
    // active_libraries RLS policy's intent, closing a gap where GPS-mode
    // search could previously surface a library that was merely is_active
    // but not yet admin-approved or no longer subscribed.
    const offset = (page - 1) * limit
    const { data: nearby, error: nearbyErr } = await supabase.rpc('search_libraries_by_distance', {
      p_lat: lat,
      p_lng: lng,
      p_radius_km: radius_km,
      p_limit: limit,
      p_offset: offset,
    })

    if (nearbyErr) {
      console.error('[exploreLibraries] search_libraries_by_distance failed:', nearbyErr.message)
      allRows = []
      total = 0
    } else {
      const nearbyIds = (nearby ?? []).map((r: any) => r.id)
      total = (nearby as any)?.[0]?.total_count ?? 0

      if (nearbyIds.length === 0) {
        allRows = []
      } else {
        // Fetch full details for exactly this page's IDs (already the
        // correct page via OFFSET above — no further slicing needed).
        let detailQuery = supabase
          .from('libraries')
          .select(`id, name, city, area, address, latitude, longitude,
             rating, total_reviews, is_active,
             library_images(image_url, is_cover),
             library_amenities(amenities(name)),
             seats(id, is_active)`)
          .in('id', nearbyIds)

        if (effectiveCity)  detailQuery = (detailQuery as any).ilike('city',  `%${effectiveCity}%`)
        if (effectiveState) detailQuery = (detailQuery as any).ilike('state', `%${effectiveState}%`)
        if (area)           detailQuery = detailQuery.ilike('area',  `%${area}%`)
        if (search) {
          detailQuery = detailQuery.or(
            `name.ilike.%${search}%,city.ilike.%${search}%,area.ilike.%${search}%,address.ilike.%${search}%`,
          )
        }

        const { data: details } = await detailQuery
        // Re-order to match the distance ranking from the RPC — the .in()
        // fetch above does not preserve order.
        const byId = new Map((details ?? []).map((d: any) => [d.id, d]))
        const distanceById = new Map((nearby ?? []).map((r: any) => [r.id, r.distance_km]))
        allRows = nearbyIds
          .filter((id: string) => byId.has(id))
          .map((id: string) => ({ ...byId.get(id), _distance_km: distanceById.get(id) }))

        // If city/area/search filtering above dropped rows, the reported
        // total should reflect the geo-search total, not the post-filter
        // count — matches the pre-existing semantics where total described
        // "how many nearby libraries exist", with the text filter as a
        // client-visible refinement. (If you want total to reflect the
        // filtered count instead, this is the line to change.)
      }
    }
  } else {
    // Build base query for non-GPS mode (city/state/profile-based browsing)
    let query = supabase
      .from('libraries')
      .select(
        `id, name, city, area, address, latitude, longitude,
         rating, total_reviews, is_active,
         library_images(image_url, is_cover),
         library_amenities(amenities(name)),
         seats(id, is_active)`,
        { count: 'exact' },
      )
      .eq('is_active', true)

    if (effectiveCity)  query = (query as any).ilike('city',  `%${effectiveCity}%`)
    if (effectiveState) query = (query as any).ilike('state', `%${effectiveState}%`)
    if (area)           query = query.ilike('area',  `%${area}%`)
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,city.ilike.%${search}%,area.ilike.%${search}%,address.ilike.%${search}%`,
      )
    }

    const from = (page - 1) * limit
    const { data, count } = await query
      .order('rating', { ascending: false })
      .range(from, from + limit - 1)
    allRows = data ?? []
    total   = count ?? 0
  }

  // Cities dropdown (always all active cities for the switcher).
  // Cached — this list only changes when a library is published/unpublished
  // in a city, not on every explore page load/filter change/pagination
  // click. See lib/booking/citiesCache.ts.
  const cities = await getActiveCitiesCached()

  if (!allRows.length) return { libraries: [], total: 0, cities, location_mode: locationMode }

  const libIds = allRows.map((l) => l.id as string)
  const now    = nowIST()

  const { data: activeBkgs } = await supabase
    .from('bookings')
    .select('seat_id, library_id')
    .in('library_id', libIds)
    .lte('start_time', now)
    .gte('end_time', now)
    .in('status', ['confirmed', 'checked_in', 'held'] as never[])

  const bookedByLib: Record<string, Set<string>> = {}
  for (const b of activeBkgs ?? []) {
    const bl = b as { seat_id: string; library_id: string }
    if (!bookedByLib[bl.library_id]) bookedByLib[bl.library_id] = new Set()
    bookedByLib[bl.library_id].add(bl.seat_id)
  }

  const { data: planLibsData } = await supabase
    .from('plan_libraries')
    .select('library_id, plans(id, name, price, duration_days, scope, time_window_start, time_window_end, days_of_week)')
    .in('library_id', libIds)

  const plansByLib: Record<string, LibraryPlan[]> = {}
  for (const pl of planLibsData ?? []) {
    const row = pl as any
    const p   = row.plans
    if (!p) continue
    if (!plansByLib[row.library_id]) plansByLib[row.library_id] = []
    plansByLib[row.library_id].push({
      id:            p.id,
      name:          p.name          ?? '',
      price:         Number(p.price  ?? 0),
      duration_days: p.duration_days ?? 30,
      scope:         p.scope         ?? 'library',
      time_window_start: p.time_window_start ?? null,
      time_window_end:   p.time_window_end   ?? null,
      days_of_week:      p.days_of_week ?? null,
    })
  }

  // Slot-only architecture: fetch all slot configs for every library in this
  // result set in one query, so buildCard can derive pricing AND open/closed
  // status from slot_configs (lib/booking/libraryStatus.ts) — no more
  // base_price/open_time/close_time on the libraries row.
  const { data: slotsData } = await supabase
    .from('slot_configs')
    .select('id, library_id, start_time, end_time, days, price, discount, is_active')
    .in('library_id', libIds)

  const slotsByLib: Record<string, SlotConfig[]> = {}
  for (const row of (slotsData ?? []) as any[]) {
    if (!slotsByLib[row.library_id]) slotsByLib[row.library_id] = []
    slotsByLib[row.library_id].push({
      id:         row.id,
      library_id: row.library_id,
      start:      String(row.start_time).slice(0, 5),
      end:        String(row.end_time).slice(0, 5),
      days:       row.days ?? [],
      price:      Number(row.price ?? 0),
      discount:   Number(row.discount ?? 0),
      is_active:  row.is_active,
    })
  }

  const cards = allRows
    .map((lib) => buildCard(lib, bookedByLib[lib.id] ?? new Set(), plansByLib, slotsByLib, lat ?? null, lng ?? null))
    .filter((card) => {
      if (open_now && !card.status.isOpen) return false
      if (amenities.length > 0 && !amenities.every((a) => card.amenities.includes(a))) return false
      return true
    })

  // NOTE: for GPS mode, ordering and pagination already happened in SQL
  // via search_libraries_by_distance (using the geo_point GiST index's <->
  // KNN operator) — `allRows` arrives in correct distance order and is
  // already exactly one page. The old code re-sorted and re-sliced here in
  // JavaScript with `total = cards.length`, which silently capped the
  // reported total at whatever subset had been fetched (200 rows) rather
  // than the true count — that bug is fixed by computing `total` from the
  // RPC's window-function count above, not from the in-memory array length.5
  // The open_now/amenities filters above can still drop a few cards from
  // this page client-side; `total` intentionally still reflects the
  // geo-search total (pre-filter) to match prior semantics — see comment
  // at the GPS branch above if you want it to reflect the filtered count.
 
  return { libraries: cards, total, cities, location_mode: locationMode }
}



export async function getLibraryDetail(
  libraryId: string,
  userLat?:  number,
  userLng?:  number,
): Promise<LibraryCard | null> {
  const supabase = await createServerSupabaseClient()

  const { data: lib, error } = await supabase
    .from('libraries')
    .select(
      `id, name, city, area, address, description, latitude, longitude,
       rating, total_reviews, is_active,
       library_images(image_url, is_cover),
       library_amenities(amenities(name)),
       seats(id, is_active)`,
    )
    .eq('id', libraryId)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !lib) return null

  const now = nowIST()
  const { data: activeBkgs } = await supabase
    .from('bookings')
    .select('seat_id')
    .eq('library_id', libraryId)
    .lte('start_time', now)
    .gte('end_time', now)
    .in('status', ['confirmed', 'checked_in', 'held'] as never[])

  const bookedIds = new Set((activeBkgs ?? []).map((b: any) => b.seat_id as string))

  const { data: planLibs } = await supabase
    .from('plan_libraries')
    .select('library_id, plans(id, name, price, duration_days, scope, time_window_start, time_window_end, days_of_week)')
    .eq('library_id', libraryId)

  const plans: LibraryPlan[] = (planLibs ?? [])
    .map((pl: any) => pl.plans)
    .filter(Boolean)
    .map((p: any): LibraryPlan => ({
      id:            p.id,
      name:          p.name          ?? '',
      price:         Number(p.price  ?? 0),
      duration_days: p.duration_days ?? 30,
      scope:         p.scope         ?? 'library',
      time_window_start: p.time_window_start ?? null,
      time_window_end:   p.time_window_end   ?? null,
      days_of_week:      p.days_of_week ?? null,
    }))

  const slots = await fetchSlotConfigs(supabase, libraryId)

  return buildCard(
    lib as any,
    bookedIds,
    { [libraryId]: plans },
    { [libraryId]: slots },
    userLat ?? null,
    userLng ?? null,
  )
}

/**
 * Active slot configurations for a library — used on the library detail
 * page to display "Available Time Slots" with their rates. Public read:
 * any signed-in (or anonymous) visitor may view a library's slot pricing.
 *
 * This is the SAME data used by lib/booking/pricing.ts to resolve the price
 * of a booking — what the student sees here is exactly what they'll be
 * charged if their booking's start time falls in one of these slots.
 *
 * Uses the cached read path (fetchActiveSlotConfigsCached) since this is a
 * pure display call with no payment decision riding on it directly — the
 * actual charge is always re-validated against fresh data in
 * getBookingPricePreview/initiateBooking, which deliberately do NOT use the
 * cache. Slots are invalidated immediately on any owner edit via
 * revalidateSlotConfigsCache(), so staleness here is a non-issue in
 * normal operation.
 */
export async function getLibrarySlots(libraryId: string): Promise<SlotConfig[]> {
  return fetchActiveSlotConfigsCached(libraryId)
}

/**
 * Price preview for the booking UI — called as the student picks a date/time,
 * before initiateBooking is invoked. Uses the EXACT same resolution
 * (lib/booking/pricing.ts + slotBoundaryValidation.ts) as initiateBooking,
 * owner.manualBookSeat, and staff.seniorManualBook, so the number shown here
 * always matches what gets charged.
 *
 * SLOT-ONLY ARCHITECTURE: if the selected [start, end) doesn't fit entirely
 * inside one active slot, this returns an error (the booking UI should
 * disable seat selection / payment until a valid range is chosen) — there
 * is no base_price fallback to fall back to.
 *
 * `startTime`/`endTime` are datetime-local input values ("YYYY-MM-DDTHH:mm").
 */
export async function getBookingPricePreview(
  libraryId: string,
  startTime: string,
  endTime:   string,
): Promise<ActionResult<{
  amount: number       // library's listed price — unchanged, what the owner will receive
  platformFee: number  // fee added on top, shown as a separate line at checkout
  totalPayable: number // amount + platformFee — what the student actually pays
  hourlyRate: number
  slot: SlotConfig
}>> {
  const start = inputToDB(startTime)
  const end   = inputToDB(endTime)

  const rangeCheck = validateISTRange(start, end, 12)
  if (rangeCheck.ok === false) return { success: false, error: rangeCheck.error }

  const supabase = await createServerSupabaseClient()
  const { data: lib, error } = await supabase
    .from('libraries')
    .select('id, is_active')
    .eq('id', libraryId)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !lib) return { success: false, error: 'Library not found or inactive' }

  const slots = await fetchActiveSlotConfigs(supabase, libraryId)

  const windowCheck = validateBooking({ slots, startTime: start, endTime: end, graceMinutes: 5 })
  if (windowCheck.ok === false) return { success: false, error: windowCheck.error }

  const { amount, hourlyRate, matchedSlot } = calculateBookingAmount(slots, start, end)
  const { platformFee, totalPayable } = computeFeeOnTopSplit(amount, DEFAULT_COMMISSION_BPS)

  return { success: true, data: { amount, platformFee, totalPayable, hourlyRate, slot: matchedSlot } }
}

/**
 * Returns the current student's active subscription for this library, if any
 * — used to show the "Active membership" badge on the library detail page.
 * A subscription is "for this library" if its plan is library-scoped to
 * this library, OR the plan has no library_libraries rows (i.e. a
 * city/global-scope plan) and is the user's active plan.
 *
 * Returns null if the user is signed out or has no active subscription
 * covering this library.
 */
/**
 * Returns the current student's active subscription for this library, if any
 * — used to show the "Active membership" badge on the library detail page.
 *
 * plan_scope is either:
 *   'library' — the plan applies to exactly one library
 *   'cross'   — the plan applies to a set of libraries (e.g. a multi-branch
 *               pass) — still scoped via plan_libraries, just potentially
 *               with multiple rows.
 *
 * Either way, a plan applies to `libraryId` iff plan_libraries has a
 * matching (plan_id, library_id) row — there is no "applies to everything"
 * scope value, so we always check the junction table.
 *
 * Returns null if the user is signed out or has no active subscription
 * covering this library.
 */
export async function getActiveSubscriptionForLibrary(
  libraryId: string,
): Promise<{ planName: string; endDate: string } | null> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return null

  const now = nowIST()
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('id, end_date, status, plans(id, name, scope)')
    .eq('user_id', user.id)
    .eq('status', 'active' as never)
    .gte('end_date', now)

  if (!subs?.length) return null

  for (const sub of subs as any[]) {
    const plan = sub.plans
    if (!plan) continue

    const { data: planLib } = await supabase
      .from('plan_libraries')
      .select('library_id')
      .eq('plan_id', plan.id)
      .eq('library_id', libraryId)
      .maybeSingle()

    if (!planLib) continue

    return { planName: plan.name ?? '', endDate: sub.end_date }
  }

  return null
}




export async function getSeatAvailability(
  libraryId: string,
  startTime: string,
  endTime:   string,
): Promise<SeatAvailability[]> {
  const supabase = await createServerSupabaseClient()

  const [seatData, conflictRes] = await Promise.all([
    listSeatLayout(supabase, libraryId, { activeOnly: true }),
    supabase
      .from('bookings')
      .select('seat_id, status, hold_expires_at')
      .eq('library_id', libraryId)
      .in('status', ['confirmed', 'checked_in', 'held'] as never[])
      .lt('start_time', endTime)
      .gt('end_time', startTime),
  ])

  const nowMs = Date.now()

  // Option B: filter out held bookings whose hold window has expired.
  // These seats are effectively free — no cron needed to release them.
  const bookedIds = new Set(
    (conflictRes.data ?? [])
      .filter((b: any) => {
        if (b.status !== 'held') return true           // confirmed / checked_in always block
        if (!b.hold_expires_at) return true            // held with no expiry — treat as active
        return new Date(b.hold_expires_at).getTime() > nowMs  // active hold blocks
      })
      .map((b: any) => b.seat_id as string)
  )

  return seatData.map((s: any) => ({
    id:            s.id as string,
    row_label:     s.row_label     ?? '',
    column_number: s.column_number ?? 0,
    label:         `${s.row_label}${s.column_number}`,
    is_available:  !bookedIds.has(s.id),
  }))
}


export async function getAllAmenities(): Promise<string[]> {
  // Cached — see lib/booking/amenitiesCache.ts. This is a small, effectively
  // static reference list; no need to hit the DB on every explore page load.
  return getAllAmenitiesCached()
}

