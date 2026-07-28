// src/app/(owner)/dashboard/scanner/page.tsx
import ScannerView from '@/components/shared/ScannerView'
import { lookupBookingForOwnerScan, checkInBooking } from '@/lib/actions/owner'
import { lookupSubscriptionForOwnerScan, ownerCheckInSubscription } from '@/lib/actions/owner/subscription-attendance'

export default function OwnerScannerPage() {
  return (
    <ScannerView
      lookupBooking={lookupBookingForOwnerScan}
      checkIn={checkInBooking}
      lookupSubscription={lookupSubscriptionForOwnerScan}
      checkInSubscription={ownerCheckInSubscription}
    />
  )
}
