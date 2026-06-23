"use client"

import { db } from "@/lib/local-db"

export const LAST_ONLINE_KEY = "quotation_last_online_at"

export async function purgeLocalData(): Promise<void> {
  if (typeof window === "undefined") return
  try {
    // Race against a 5s timeout: if another tab holds the DB open, don't hang.
    await Promise.race([
      db.delete(),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ])
  } finally {
    localStorage.removeItem(LAST_ONLINE_KEY)
  }
}
