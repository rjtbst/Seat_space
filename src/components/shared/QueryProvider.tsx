'use client'
// src/components/shared/QueryProvider.tsx
//
// @tanstack/react-query has been a dependency but was never actually wired
// to a QueryClientProvider anywhere in the app — so it's unused today.
// This wires it up so future data-fetching (seat availability polling,
// subscriber lists, etc.) can adopt query's caching + built-in optimistic
// mutation support incrementally, without a big-bang rewrite.
//
// SAFE BY CONSTRUCTION: nothing currently calls useQuery/useMutation
// anywhere in the codebase, so adding this provider changes zero existing
// behavior — it only makes the hooks available for future use.
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState (not a module-level singleton) so each request/browser tab
  // gets its own client — the standard Next.js App Router pattern, avoids
  // leaking cached data across users on the server.
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Data like seat availability or booking status is only "fresh"
        // for a few seconds in practice; this avoids the default
        // aggressive refetch-on-every-focus behavior surprising anyone
        // who adopts it later, while still keeping things reasonably live.
        staleTime: 10_000,
        refetchOnWindowFocus: false,
      },
    },
  }))

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
