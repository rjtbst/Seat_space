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
  tagline: 'Book Your Study Seat',
  description:
    'Find the perfect study library near you, see live seat availability, and reserve your spot — all before you leave home.',
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

/* ─── Navigation ─── */
export const NAV_LINKS = [
  { label: 'How it changes things', href: '#transformation' },
  { label: 'Explore the platform',  href: '#explore-platform' },
  { label: 'Pricing',               href: '#pricing' },
] as const

/* ─── Stats band ─── */
export const STATS = [
  { value: 2400,  suffix: '+', label: 'Students active' },
  { value: 48,    suffix: '',  label: 'Libraries onboarded' },
  { value: 96,    suffix: '%', label: 'Occupancy rate' },
  { value: 12000, suffix: '+', label: 'Bookings made' },
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
      'Select library, pick your seat, choose a time slot, pay — done. Confirmation lands on WhatsApp instantly.',
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
      'WhatsApp booking confirmations',
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

/* ─── Pricing ─── */
export interface PricingPlan {
  name: string
  price: string
  period: string
  description: string
  features: string[]
  cta: string
  featured?: boolean
  badge?: string
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: 'Basic',
    price: 'Free',
    period: 'forever',
    description: 'For libraries just getting started.',
    features: [
      'Up to 1 library',
      '30 seats max',
      'Online booking page',
      'QR check-in',
      'Email support',
    ],
    cta: 'Start free',
  },
  {
    name: 'Growth',
    price: '₹999',
    period: '/month',
    description: 'For serious library businesses.',
    features: [
      'Up to 3 libraries',
      'Unlimited seats',
      'Membership plan builder',
      'WhatsApp notifications',
      'Revenue dashboard',
      'Book lending module',
      'Priority support',
    ],
    cta: 'Start 14-day trial',
    featured: true,
    badge: 'Most Popular',
  },
  {
    name: 'Enterprise',
    price: '₹2,499',
    period: '/month',
    description: 'For chains and franchise networks.',
    features: [
      'Unlimited libraries',
      'Cross-library plans',
      'Custom domain',
      'API access',
      'Dedicated account manager',
      'Custom integrations',
    ],
    cta: 'Contact sales',
  },
] as const

/* ─── Testimonials ─── */
export interface Testimonial {
  text: string
  name: string
  role: string
  color: string
}

export const TESTIMONIALS: Testimonial[] = [
  {
    text: 'I used to waste 30 minutes every morning checking if my favourite seat was free. seatspace ended that. Book in 60 seconds the night before.',
    name: 'Aarav Sharma',
    role: 'UPSC Aspirant, Haldwani',
    color: '#1246FF',
  },
  {
    text: 'Our occupancy went from 60% to 92% in the first month. The real-time seat grid convinced students — they could see available seats before leaving home.',
    name: 'Rahul Gupta',
    role: 'Owner, Silence Study Hub',
    color: '#0D7C54',
  },
  {
    text: 'The QR check-in is magic. No more paper registers, no students claiming they booked when they didn\'t. Staff love it.',
    name: 'Mohit Verma',
    role: 'Staff, Silence Study Hub',
    color: '#C8A84B',
  },
  {
    text: 'The book due-date reminders are genius. We had chronic late returns before. Now 95% of books come back on time.',
    name: 'Sunita Devi',
    role: 'Librarian, Knowledge Park',
    color: '#6B3FD4',
  },
  {
    text: 'I manage 3 libraries from one dashboard. Revenue, occupancy, today\'s bookings — all in one view. Game changer for multi-branch ops.',
    name: 'Priya Mishra',
    role: 'Owner, 3 libraries in Haldwani',
    color: '#D42B2B',
  },
  {
    text: 'WhatsApp confirmations feel more personal than email. Students actually show up to their sessions now. No-show rate dropped massively.',
    name: 'Vikas Agarwal',
    role: 'Owner, EduNest Study Room',
    color: '#0597A7',
  },
] as const

/* ─── Demo libraries (hero / map) ─── */
export const DEMO_LIBRARIES = [
  { name: 'Silence Study Hub', area: 'Civil Lines', rating: 4.8, distance: '0.8 km', seats: 18, open: true, pricePerHr: 25, color: '#10B981', top: '20%', left: '22%' },
  { name: 'Knowledge Park',    area: 'Shastri Nagar', rating: 4.6, distance: '1.2 km', seats: 6,  open: true, pricePerHr: 20, color: '#F59E0B', top: '50%', left: '58%' },
  { name: 'EduNest',           area: 'Cantonment', rating: 4.9, distance: '2.1 km', seats: 22, open: true, pricePerHr: 30, color: '#10B981', top: '30%', left: '72%' },
  { name: 'ReadSpace Centre',  area: 'Hapur Road', rating: 4.2, distance: '3.0 km', seats: 0,  open: false, pricePerHr: 15, color: '#EF4444', top: '65%', left: '35%' },
] as const

/* ─── Footer links ─── */
export const FOOTER_LINKS = {
  Product: [
    { label: 'How it works',        href: '/#transformation' },
    { label: 'Explore the platform', href: '/#explore-platform' },
    { label: 'Pricing',              href: '/#pricing' },
  ],
  For: [
    { label: 'Library owners',   href: '/#recognition' },
    { label: 'Students',         href: '/#explore-platform' },
    { label: 'Front-desk staff', href: '/#explore-platform' },
  ],
  Company: [
    { label: 'About',      href: '/about' },
    { label: 'Blog',       href: '/blog' },
    { label: 'Careers',    href: '/careers' },
    { label: 'Contact',    href: '/contact' },
  ],
  Legal: [
    { label: 'Privacy',    href: '/privacy' },
    { label: 'Terms',      href: '/terms' },
    { label: 'Refunds',    href: '/refunds' },
  ],
} as const