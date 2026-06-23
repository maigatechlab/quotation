"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { getSession, signOut, useSession } from "@/lib/auth-client"
import { LAST_ONLINE_KEY, purgeLocalData } from "@/lib/local-purge"

export { LAST_ONLINE_KEY }
export const SESSION_MAX_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000

export function markOnline(): void {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    localStorage.setItem(LAST_ONLINE_KEY, Date.now().toString())
  }
}

export function checkSessionExpiry(push: (url: string) => void): boolean {
  const stored = localStorage.getItem(LAST_ONLINE_KEY)
  if (!stored) return false
  const elapsed = Date.now() - parseInt(stored, 10)
  if (isNaN(elapsed)) {
    localStorage.removeItem(LAST_ONLINE_KEY)
    return false
  }
  if (elapsed > SESSION_MAX_OFFLINE_MS) {
    push("/login?reason=session-expired")
    return true
  }
  return false
}

export async function enforceExpiry(push: (url: string) => void): Promise<boolean> {
  const stored = localStorage.getItem(LAST_ONLINE_KEY)
  if (!stored) return false
  const elapsed = Date.now() - parseInt(stored, 10)
  if (isNaN(elapsed)) {
    localStorage.removeItem(LAST_ONLINE_KEY)
    return false
  }
  if (elapsed > SESSION_MAX_OFFLINE_MS) {
    try {
      await signOut()
    } catch {
      // best effort
    }
    localStorage.removeItem(LAST_ONLINE_KEY)
    await purgeLocalData()
    push("/login?reason=session-expired")
    return true
  }
  return false
}

export async function handleRevocationCheck(push: (url: string) => void): Promise<void> {
  try {
    const result = await getSession()
    if (!result.data) {
      try {
        await signOut()
      } catch {
        // best effort
      }
      await purgeLocalData()
      push("/login?reason=session-revoked")
    } else {
      localStorage.setItem(LAST_ONLINE_KEY, Date.now().toString())
    }
  } catch {
    // erreur réseau transitoire — rester offline, ne rien faire
  }
}

export function useOfflineSession(): void {
  const { data: session } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (!session) return
    let intervalId: ReturnType<typeof setInterval> | undefined
    let aborted = false

    void enforceExpiry(router.push.bind(router)).then((expired) => {
      if (aborted || expired) return
      markOnline()
      intervalId = setInterval(markOnline, 60_000)
    })

    return () => {
      aborted = true
      if (intervalId !== undefined) clearInterval(intervalId)
    }
  }, [session, router])

  useEffect(() => {
    if (!session) return
    let isHandling = false
    const handleOnline = async () => {
      if (isHandling) return
      isHandling = true
      try {
        const expired = await enforceExpiry(router.push.bind(router))
        if (!expired) {
          await handleRevocationCheck(router.push.bind(router))
        }
      } finally {
        isHandling = false
      }
    }
    window.addEventListener("online", handleOnline)
    return () => window.removeEventListener("online", handleOnline)
  }, [session, router])
}
