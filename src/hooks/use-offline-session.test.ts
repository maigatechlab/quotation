import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
// eslint-disable-next-line import/order
import {
  checkSessionExpiry,
  enforceExpiry,
  handleRevocationCheck,
  LAST_ONLINE_KEY,
  markOnline,
  SESSION_MAX_OFFLINE_MS,
} from "@/hooks/use-offline-session"

vi.mock("@/lib/auth-client", () => ({
  useSession: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock("@/lib/local-purge", () => ({
  purgeLocalData: vi.fn().mockResolvedValue(undefined),
  LAST_ONLINE_KEY: "quotation_last_online_at",
}))

import { getSession, signOut } from "@/lib/auth-client"
import { purgeLocalData } from "@/lib/local-purge"

describe("markOnline", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it("met à jour lastOnlineAt quand navigator.onLine est true", () => {
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true })

    markOnline()

    const stored = localStorage.getItem(LAST_ONLINE_KEY)
    expect(stored).not.toBeNull()
    expect(parseInt(stored ?? "0", 10)).toBeGreaterThan(0)
  })

  it("ne met pas à jour lastOnlineAt quand navigator.onLine est false", () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true })

    markOnline()

    expect(localStorage.getItem(LAST_ONLINE_KEY)).toBeNull()
  })
})

describe("checkSessionExpiry", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it("redirige et retourne true si > 7 jours hors ligne", () => {
    const push = vi.fn()
    const oldTs = Date.now() - SESSION_MAX_OFFLINE_MS - 1000
    localStorage.setItem(LAST_ONLINE_KEY, oldTs.toString())

    const result = checkSessionExpiry(push)

    expect(result).toBe(true)
    expect(push).toHaveBeenCalledWith("/login?reason=session-expired")
  })

  it("ne redirige pas et retourne false si dans la fenêtre des 7 jours", () => {
    const push = vi.fn()
    const recentTs = Date.now() - 1000
    localStorage.setItem(LAST_ONLINE_KEY, recentTs.toString())

    const result = checkSessionExpiry(push)

    expect(result).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })

  it("ne fait rien et retourne false si localStorage ne contient pas lastOnlineAt", () => {
    const push = vi.fn()

    const result = checkSessionExpiry(push)

    expect(result).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })

  it("supprime la clé et retourne false si la valeur est corrompue (NaN)", () => {
    const push = vi.fn()
    localStorage.setItem(LAST_ONLINE_KEY, "corrupted_value")

    const result = checkSessionExpiry(push)

    expect(result).toBe(false)
    expect(push).not.toHaveBeenCalled()
    expect(localStorage.getItem(LAST_ONLINE_KEY)).toBeNull()
  })
})

describe("enforceExpiry", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(signOut).mockResolvedValue({ success: true } as never)
    vi.mocked(purgeLocalData).mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("sign out, purge et redirige si > 7 jours, retourne true", async () => {
    const push = vi.fn()
    const oldTs = Date.now() - SESSION_MAX_OFFLINE_MS - 1000
    localStorage.setItem(LAST_ONLINE_KEY, oldTs.toString())

    const result = await enforceExpiry(push)

    expect(result).toBe(true)
    expect(signOut).toHaveBeenCalled()
    expect(purgeLocalData).toHaveBeenCalled()
    expect(localStorage.getItem(LAST_ONLINE_KEY)).toBeNull()
    expect(push).toHaveBeenCalledWith("/login?reason=session-expired")
  })

  it("redirige et purge même si signOut échoue (best effort)", async () => {
    vi.mocked(signOut).mockRejectedValue(new Error("network"))
    const push = vi.fn()
    const oldTs = Date.now() - SESSION_MAX_OFFLINE_MS - 1000
    localStorage.setItem(LAST_ONLINE_KEY, oldTs.toString())

    const result = await enforceExpiry(push)

    expect(result).toBe(true)
    expect(purgeLocalData).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith("/login?reason=session-expired")
  })

  it("ne fait rien si dans la fenêtre des 7 jours, retourne false", async () => {
    const push = vi.fn()
    localStorage.setItem(LAST_ONLINE_KEY, (Date.now() - 1000).toString())

    const result = await enforceExpiry(push)

    expect(result).toBe(false)
    expect(signOut).not.toHaveBeenCalled()
    expect(purgeLocalData).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it("retourne false si pas de lastOnlineAt", async () => {
    const push = vi.fn()

    const result = await enforceExpiry(push)

    expect(result).toBe(false)
    expect(signOut).not.toHaveBeenCalled()
  })

  it("supprime la clé et retourne false si la valeur est corrompue (NaN)", async () => {
    const push = vi.fn()
    localStorage.setItem(LAST_ONLINE_KEY, "not_a_number")

    const result = await enforceExpiry(push)

    expect(result).toBe(false)
    expect(signOut).not.toHaveBeenCalled()
    expect(purgeLocalData).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(localStorage.getItem(LAST_ONLINE_KEY)).toBeNull()
  })
})

describe("handleRevocationCheck", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true })
    vi.mocked(signOut).mockResolvedValue({ success: true } as never)
    vi.mocked(purgeLocalData).mockResolvedValue(undefined)
  })

  it("sign out, purge et redirige si session révoquée (data null)", async () => {
    vi.mocked(getSession).mockResolvedValue({ data: null, error: null })
    const push = vi.fn()

    await handleRevocationCheck(push)

    expect(signOut).toHaveBeenCalled()
    expect(purgeLocalData).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith("/login?reason=session-revoked")
  })

  it("met à jour lastOnlineAt si session toujours valide", async () => {
    vi.mocked(getSession).mockResolvedValue({
      data: {
        session: { id: "s1" } as never,
        user: { id: "u1" } as never,
      },
      error: null,
    })
    const push = vi.fn()

    await handleRevocationCheck(push)

    expect(signOut).not.toHaveBeenCalled()
    expect(purgeLocalData).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(localStorage.getItem(LAST_ONLINE_KEY)).not.toBeNull()
  })

  it("ne fait rien en cas d'erreur réseau", async () => {
    vi.mocked(getSession).mockRejectedValue(new Error("Network error"))
    const push = vi.fn()

    await expect(handleRevocationCheck(push)).resolves.toBeUndefined()
    expect(signOut).not.toHaveBeenCalled()
    expect(purgeLocalData).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})
