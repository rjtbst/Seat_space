/* ─────────────────────────────────────────────────
   StudySpace — Domain Types
───────────────────────────────────────────────── */

/* ─── Roles ─── */
export type UserRole = 'student' | 'owner' | 'staff'

export interface User {
  id: string
  name: string
  phone: string
  email?: string
  role: UserRole
  avatarUrl?: string
  createdAt: string
}

/* ─── Library ─── */
export interface Library {
  id: string
  name: string
  slug: string
  ownerId: string
  address: string
  area: string
  city: string
  lat: number
  lng: number
  phone: string
  openTime: string    // "06:00"
  closeTime: string   // "22:00"
  totalSeats: number
  availableSeats: number
  rating: number
  reviewCount: number
  amenities: string[]
  images: string[]
  isOpen: boolean
  pricePerHour: number
}

/* ─── Seat ─── */
export type SeatStatus = 'free' | 'taken' | 'selected' | 'reserved'

export interface Seat {
  id: string
  libraryId: string
  label: string        // "A1", "B3", etc.
  row: number
  col: number
  status: SeatStatus
  hasSocket: boolean
  zone?: 'silent' | 'discussion' | 'computer'
}

/* ─── Time Slot ─── */
export interface TimeSlot {
  id: string
  start: string      // "09:00"
  end: string        // "10:00"
  label: string      // "9:00 AM – 10:00 AM"
  available: boolean
}

/* ─── Booking ─── */
export type BookingStatus = 'confirmed' | 'checked-in' | 'completed' | 'cancelled' | 'no-show'

export interface Booking {
  id: string
  bookingCode: string
  studentId: string
  libraryId: string
  seatId: string
  seatLabel: string
  date: string          // "2025-01-15"
  slotStart: string     // "09:00"
  slotEnd: string       // "11:00"
  durationHrs: number
  status: BookingStatus
  amountPaid: number
  paymentMethod: 'upi' | 'card' | 'wallet' | 'cash'
  qrCode: string
  createdAt: string
  checkedInAt?: string
}

/* ─── Membership Plan ─── */
export type PlanScope = 'library' | 'cross-library'
export type PlanDuration = '7d' | '30d' | '90d'
export type SessionQuota = 'unlimited' | '1/day' | '2/day' | number

export interface MembershipPlan {
  id: string
  libraryId: string | null   // null if cross-library
  name: string
  price: number              // per period
  duration: PlanDuration
  sessionQuota: SessionQuota
  scope: PlanScope
  features: string[]
  isActive: boolean
  subscriberCount: number
  color: string
}

/* ─── Subscription ─── */
export interface Subscription {
  id: string
  studentId: string
  planId: string
  libraryId: string | null
  startDate: string
  endDate: string
  sessionsUsed: number
  isActive: boolean
  autoRenew: boolean
}

/* ─── Book (Library catalog) ─── */
export type BookStatus = 'available' | 'borrowed' | 'reserved' | 'lost'

export interface Book {
  id: string
  libraryId: string
  title: string
  author: string
  isbn?: string
  genre: string
  cover?: string
  totalCopies: number
  availableCopies: number
  status: BookStatus
}

/* ─── Borrow record ─── */
export type BorrowStatus = 'active' | 'returned' | 'overdue'

export interface BorrowRecord {
  id: string
  bookId: string
  studentId: string
  libraryId: string
  borrowedAt: string
  dueAt: string
  returnedAt?: string
  status: BorrowStatus
  fine?: number
}

/* ─── Staff member ─── */
export type StaffRole = 'manager' | 'staff'

export interface StaffMember {
  id: string
  userId: string
  libraryId: string
  name: string
  phone: string
  role: StaffRole
  canScan: boolean
  canManageBooks: boolean
  canViewReports: boolean
  joinedAt: string
  isActive: boolean
}

/* ─── Notification ─── */
export type NotifType = 'booking' | 'payment' | 'reminder' | 'system' | 'overdue'

export interface Notification {
  id: string
  userId: string
  type: NotifType
  title: string
  message: string
  channel: 'whatsapp' | 'email' | 'push' | 'sms'
  status: 'sent' | 'delivered' | 'failed' | 'pending'
  sentAt: string
  readAt?: string
}

/* ─── Dashboard metrics ─── */
export interface OwnerDashMetrics {
  todayOccupancy: number      // 0-100 %
  todayBookings: number
  todayRevenue: number
  monthRevenue: number
  activeSubscriptions: number
  overdueBooks: number
  noShowRate: number
  avgRating: number
}

/* ─── API Response wrapper ─── */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

/* ─── Pagination ─── */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasNextPage: boolean
}

/* ─── Search / filter ─── */
export interface LibrarySearchParams {
  query?: string
  area?: string
  minRating?: number
  maxPrice?: number
  hasAvailableSeats?: boolean
  amenities?: string[]
  sortBy?: 'distance' | 'rating' | 'price' | 'availability'
}

/* ─── Navigation ─── */
export interface NavItem {
  label: string
  href: string
  icon?: string
  badge?: string | number
  children?: NavItem[]
}