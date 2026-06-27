import { APIError } from "better-auth"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { checkAccountLockout, recordLoginAttempt } from "./lockout"

const { mockUpdateWhere, mockUpdateSet, mockUpdate } = vi.hoisted(() => ({
  mockUpdateWhere: vi.fn().mockResolvedValue([]),
  mockUpdateSet: vi.fn(),
  mockUpdate: vi.fn(),
}))

vi.mock("./db", () => {
  const mockLimit = vi.fn()
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })

  // expose mockLimit so tests can set the resolved value
  ;(globalThis as Record<string, unknown>).__mockLimit = mockLimit

  return {
    db: {
      select: mockSelect,
      update: mockUpdateWhere,
    },
  }
})

function setSelectRows(rows: unknown[]) {
  const mockLimit = (globalThis as Record<string, unknown>).__mockLimit as ReturnType<typeof vi.fn>
  mockLimit.mockResolvedValue(rows)
}

describe("checkAccountLockout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateWhere.mockResolvedValue([])
    mockUpdateSet.mockReturnValue({ where: vi.fn().mockResolvedValue([]) })
    mockUpdate.mockReturnValue({ set: mockUpdateSet })
    // reset the chained mocks
    const mockLimit = (globalThis as Record<string, unknown>).__mockLimit as ReturnType<typeof vi.fn>
    mockLimit.mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("ne lève pas d'erreur si lockedAt est null", async () => {
    setSelectRows([{ lockedAt: null, loginAttempts: 0 }])
    await expect(checkAccountLockout("user@example.com")).resolves.toBeUndefined()
  })

  it("ne lève pas d'erreur si l'utilisateur est introuvable", async () => {
    setSelectRows([])
    await expect(checkAccountLockout("ghost@example.com")).resolves.toBeUndefined()
  })

  it("lève APIError FORBIDDEN si le compte est verrouillé (lockedAt défini)", async () => {
    setSelectRows([{ lockedAt: new Date(), loginAttempts: 5 }])
    await expect(checkAccountLockout("locked@example.com")).rejects.toThrow(APIError)
  })

  it("normalise l'email en lowercase avant la requête DB", async () => {
    setSelectRows([{ lockedAt: new Date(), loginAttempts: 5 }])
    await expect(checkAccountLockout("LOCKED@EXAMPLE.COM")).rejects.toThrow(APIError)
  })
})

describe("recordLoginAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateWhere.mockReturnValue({ set: mockUpdateSet })
    mockUpdateSet.mockReturnValue({ where: vi.fn().mockResolvedValue([]) })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("sur succès : remet loginAttempts à 0 et efface lockedAt", async () => {
    await recordLoginAttempt("user@example.com", true)
    expect(mockUpdateWhere).toHaveBeenCalled()
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ loginAttempts: 0, lockedAt: null })
    )
  })

  it("sur échec : incrémente atomiquement via SQL (pas de nombre littéral)", async () => {
    await recordLoginAttempt("user@example.com", false)
    expect(mockUpdateWhere).toHaveBeenCalled()
    const setArgs = mockUpdateSet.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArgs).toHaveProperty("loginAttempts")
    expect(setArgs).toHaveProperty("lockedAt")
    expect(typeof setArgs["loginAttempts"]).not.toBe("number")
  })
})
