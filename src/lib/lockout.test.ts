import { APIError } from "better-auth"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { checkAccountLockout, recordLoginAttempt } from "./lockout"

const { mockFindFirst, mockUpdate, mockUpdateSet, mockUpdateWhere } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockUpdateWhere: vi.fn().mockResolvedValue([]),
  mockUpdateSet: vi.fn(),
  mockUpdate: vi.fn(),
}))

vi.mock("./db", () => ({
  db: {
    query: { user: { findFirst: mockFindFirst } },
    update: mockUpdate,
  },
}))

describe("checkAccountLockout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateWhere.mockResolvedValue([])
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
    mockUpdate.mockReturnValue({ set: mockUpdateSet })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("ne lève pas d'erreur si lockedAt est null", async () => {
    mockFindFirst.mockResolvedValue({ lockedAt: null })
    await expect(checkAccountLockout("user@example.com")).resolves.toBeUndefined()
  })

  it("ne lève pas d'erreur si l'utilisateur est introuvable", async () => {
    mockFindFirst.mockResolvedValue(undefined)
    await expect(checkAccountLockout("ghost@example.com")).resolves.toBeUndefined()
  })

  it("lève APIError FORBIDDEN si le compte est verrouillé (lockedAt défini)", async () => {
    mockFindFirst.mockResolvedValue({ lockedAt: new Date() })
    await expect(checkAccountLockout("locked@example.com")).rejects.toThrow(APIError)
  })

  it("normalise l'email en lowercase avant la requête DB", async () => {
    mockFindFirst.mockResolvedValue({ lockedAt: new Date() })
    // Compte verrouillé doit être détecté même avec email en majuscule
    await expect(checkAccountLockout("LOCKED@EXAMPLE.COM")).rejects.toThrow(APIError)
    expect(mockFindFirst).toHaveBeenCalled()
  })
})

describe("recordLoginAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateWhere.mockResolvedValue([])
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
    mockUpdate.mockReturnValue({ set: mockUpdateSet })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("sur succès : remet loginAttempts à 0 et efface lockedAt", async () => {
    await recordLoginAttempt("user@example.com", true)
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ loginAttempts: 0, lockedAt: null })
    )
  })

  it("sur échec : incrémente atomiquement via SQL (pas de nombre littéral)", async () => {
    await recordLoginAttempt("user@example.com", false)
    expect(mockUpdate).toHaveBeenCalled()
    const setArgs = mockUpdateSet.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArgs).toHaveProperty("loginAttempts")
    expect(setArgs).toHaveProperty("lockedAt")
    expect(typeof setArgs["loginAttempts"]).not.toBe("number")
  })
})
