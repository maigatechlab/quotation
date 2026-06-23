import { beforeEach, describe, expect, it } from "vitest"
import {
  normalizePasswordResetEmail,
  recordPasswordResetAttempt,
  resetPasswordRateLimitForTests,
} from "./password-reset-rate-limit"

describe("password reset rate limit", () => {
  beforeEach(() => {
    resetPasswordRateLimitForTests()
  })

  it("normalizes email keys", () => {
    expect(normalizePasswordResetEmail(" User@Example.COM ")).toBe("user@example.com")
  })

  it("blocks the fourth request in a sliding hour", () => {
    const now = 1_000_000

    recordPasswordResetAttempt("User@Example.com", now)
    recordPasswordResetAttempt(" user@example.com ", now + 1)
    recordPasswordResetAttempt("USER@example.com", now + 2)

    expect(() => recordPasswordResetAttempt("user@example.com", now + 3)).toThrow(
      "RESET_RATE_LIMIT_EXCEEDED"
    )
  })
})
