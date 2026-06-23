"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { enforceExpiry, useOfflineSession } from "@/hooks/use-offline-session"

export function SessionGuard() {
  const router = useRouter()

  // Cold-start: enforce 7-day expiry once on mount — both online and offline.
  // Runs before useOfflineSession's effects. Signs out the server session before
  // redirecting so login/page.tsx doesn't bounce back due to a valid cookie.
  useEffect(() => {
    void enforceExpiry(router.push.bind(router))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useOfflineSession()
  return null
}
