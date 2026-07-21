/* ─────────────────────────────────────────────────
   seatspace — Site Configuration
   Single source of truth for content & tokens
───────────────────────────────────────────────── */
export const STATE_CITY_MAP: Record<string, string[]> = {
   'Delhi': ['New Delhi', 'Dwarka', 'Rohini', 'Saket'],
  'Uttarakhand': ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani'],
  
}


export const SITE = {
  name: 'seatspace',
  tagline: 'Find a seat. Run a library.',
  description:
    'seatspace connects students to real study libraries nearby with live seat availability, and gives owners one dashboard to run seats, staff, payments and books.',
  url: 'https://seatspace.in',
  location: 'Haldwani, UP',
  contact: {
    email: 'support@seatspace.in',
    whatsapp: '+91-XXXXXXXXXX',
  },
  social: {
    twitter: 'https://twitter.com/seatspace',
    instagram: 'https://instagram.com/seatspace',
  },
} as const

/* ─── Colour tokens (mirrors globals.css for JS use) ─── */
export const COLORS = {
  ink: '#0A0D12',
  blue: '#1246FF',
  blueLight: '#E8EFFE',
  blueDark: '#0D3AE0',
  cream: '#F5F0E8',
  warm: '#EDE8DC',
  gold: '#C8A84B',
  green: '#0D7C54',
  green2: '#12B07A',
  red: '#D42B2B',
  muted: '#6B7689',
  pale: '#9AAAB8',
  divider: '#E2DDD4',
  surface: '#FDFCF9',
} as const

/* ─── Navigation ───
   `type: 'section'` links live on the homepage as in-page anchors. From any
   other page the navbar routes home first and then scrolls to the section.
   `type: 'page'` links are real routes and navigate normally. */
export const NAV_LINKS = [
  { label: 'How it works',         href: '#transformation',    type: 'section' },
  { label: 'Explore the platform', href: '#explore-platform',  type: 'section' },
  { label: 'Pricing',              href: '#pricing',           type: 'section' },
  { label: 'About',                href: '/about',             type: 'page' },
  { label: 'Contact',              href: '/contact',           type: 'page' },
] as const

/* ─── Features ─── */
export interface Feature {
  icon: string
  title: string
  description: string
  accent: 'blue' | 'green' | 'gold'
  large?: boolean
}

export const FEATURES: Feature[] = [
  {
    icon: '🗺️',
    title: 'Live Seat Grid',
    description:
      'See exactly which seats are free, taken, or reserved in real time. No more calling ahead or wasting a trip.',
    accent: 'blue',
    // large: true,
  },
  {
    icon: '⚡',
    title: 'Book in 60 Seconds',
    description:
      'Select library, pick your seat, choose a time slot, pay — your seat is confirmed on the spot.',
    accent: 'green',
  },
  {
    icon: '📱',
    title: 'QR Check-In',
    description:
      'Show your QR code at the door. Staff scan it in under 3 seconds. No paper registers.',
    accent: 'gold',
  },
  {
    icon: '📚',
    title: 'Book Lending',
    description:
      'Browse the catalog, reserve a book, and get reminded when your due date approaches.',
    accent: 'blue',
  },
  {
    icon: '💳',
    title: 'Membership Plans',
    description:
      'Monthly, weekly, or per-session passes. Cross-library plans for students who use multiple branches.',
    accent: 'green',
  },
  {
    icon: '📊',
    title: 'Owner Dashboard',
    description:
      'Real-time occupancy, revenue charts, today\'s bookings, and staff management — all from one screen.',
    accent: 'gold',
  },
] as const

/* ─── How it works (student flow) ─── */
export interface Step {
  num: number
  icon: string
  title: string
  description: string
}

export const STEPS_STUDENT: Step[] = [
  {
    num: 1,
    icon: '📍',
    title: 'Find a library',
    description: 'Search by area, rating, or availability. See live seat counts before you leave home.',
  },
  {
    num: 2,
    icon: '🪑',
    title: 'Pick your seat',
    description: 'Interactive seat map shows free, taken, and reserved spots colour-coded.',
  },
  {
    num: 3,
    icon: '💳',
    title: 'Pay & confirm',
    description: 'UPI, card, or membership balance. Booking confirmed in under 60 seconds.',
  },
  {
    num: 4,
    icon: '✅',
    title: 'Scan & sit',
    description: 'Show your QR at the door. Staff scan it — you\'re in. No queues, no registers.',
  },
] as const

/* ─── Roles ─── */
export interface RoleCard {
  emoji: string
  title: string
  subtitle: string
  features: string[]
  accent: string
  variant: 'student' | 'owner' | 'staff'
}

export const ROLES: RoleCard[] = [
  {
    emoji: '🎓',
    title: 'Students',
    subtitle: 'Stop wasting time on commutes to full libraries. Book your seat the night before.',
    features: [
      'Live seat availability map',
      'Instant booking & QR check-in',
      'Membership plans & top-up wallet',
      'Book borrowing with reminders',
      'WhatsApp-verified account, no spam sign-ups',
    ],
    accent: '#1246FF',
    variant: 'student',
  },
  {
    emoji: '🏛️',
    title: 'Library Owners',
    subtitle: 'Fill every seat. Eliminate no-shows. Run multiple branches from one dashboard.',
    features: [
      'Real-time occupancy dashboard',
      'Revenue & analytics reports',
      'Multi-library management',
      'Custom slot & pricing config',
      'Staff access management',
    ],
    accent: '#0D7C54',
    variant: 'owner',
  },
  {
    emoji: '🔑',
    title: 'Library Staff',
    subtitle: 'No more paper registers. Just scan QR codes and manage the floor smoothly.',
    features: [
      'QR check-in scanner',
      'Today\'s bookings at a glance',
      'Book issuance & return desk',
      'Overdue book alerts',
      'Walk-in seat assignment',
    ],
    accent: '#C8A84B',
    variant: 'staff',
  },
] as const

/* ─── Pricing & testimonials ───
   Intentionally removed: this file used to hardcode a 3-tier Free / Growth /
   Enterprise pricing table and six named customer testimonials. Neither was
   ever rendered anywhere (PricingCta.tsx has always shown the real, single
   ₹399/month-per-library model instead), and the testimonials were invented
   quotes attributed to people who don't exist — that's a real liability, not
   just dead code, so it's gone rather than left to be wired in by accident.
   The true pricing model lives in PricingCta.tsx and in
   src/lib/actions/library.ts (first-library 14-day trial, ₹399/month
   thereafter). If real testimonials are collected later, add a typed
   Testimonial[] back here with verifiable names/roles. */

/* ─── Demo libraries (hero / map) ─── */
export const DEMO_LIBRARIES = [
  { name: 'Silence Study Hub', area: 'Civil Lines', rating: 4.8, distance: '0.8 km', seats: 18, open: true, pricePerHr: 25, color: '#10B981', top: '20%', left: '22%' },
  { name: 'Knowledge Park',    area: 'Shastri Nagar', rating: 4.6, distance: '1.2 km', seats: 6,  open: true, pricePerHr: 20, color: '#F59E0B', top: '50%', left: '58%' },
  { name: 'EduNest',           area: 'Cantonment', rating: 4.9, distance: '2.1 km', seats: 22, open: true, pricePerHr: 30, color: '#10B981', top: '30%', left: '72%' },
  { name: 'ReadSpace Centre',  area: 'Hapur Road', rating: 4.2, distance: '3.0 km', seats: 0,  open: false, pricePerHr: 15, color: '#EF4444', top: '65%', left: '35%' },
] as const

/* ─── Footer links ───
   Every href below must resolve to a route or homepage anchor that actually
   exists in src/app — 'Blog' and 'Careers' were removed because no such
   pages exist yet (add them back once those routes are built). */
export const FOOTER_LINKS = {
  Product: [
    { label: 'How it works',         href: '/#transformation' },
    { label: 'The platform',         href: '/#operating-system' },
    { label: 'Explore the platform', href: '/#explore-platform' },
    { label: 'FAQ',                  href: '/#faq' },
    { label: 'Pricing',              href: '/#pricing' },
  ],
  For: [
    { label: 'Library owners',   href: '/#recognition' },
    { label: 'Students',         href: '/#explore-platform' },
    { label: 'Front-desk staff', href: '/#explore-platform' },
  ],
  Company: [
    { label: 'About',      href: '/about' },
    { label: 'Contact',    href: '/contact' },
  ],
  Legal: [
    { label: 'Privacy',    href: '/privacy' },
    { label: 'Terms',      href: '/terms' },
    { label: 'Refunds',    href: '/refunds' },
  ],
} as const