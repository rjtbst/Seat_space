'use client'

// src/app/(staff)/staff/scanner/page.tsx
/**
 * Was previously its own ~500-line inline scanner implementation
 * (duplicating everything in src/components/shared/ScannerView.tsx,
 * including the BarcodeDetector-only scan loop that silently doesn't work
 * on most Android Chrome / all iOS Safari — ScannerView's jsQR-based loop
 * works everywhere). Switched to the shared component so booking AND
 * subscription QR scanning (see ScannerView's doc comment) only need to
 * be built once. Behavior for booking scans is unchanged.
 */
import ScannerView from '@/components/shared/ScannerView'
import { lookupBookingForScan, staffCheckIn, lookupSubscriptionForScan, staffCheckInSubscription } from '@/lib/actions/staff'

export default function StaffScannerPage() {
  return (
    <ScannerView
      lookupBooking={lookupBookingForScan}
      checkIn={staffCheckIn}
      lookupSubscription={lookupSubscriptionForScan}
      checkInSubscription={staffCheckInSubscription}
      subtitle="Scan a student's booking or membership QR code to check them in"
    />
  )
}
