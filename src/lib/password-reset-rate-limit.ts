import { APIError } from "better-auth"

const RESET_PASSWORD_WINDOW_MS = 3_600_000
const MAX_PASSWORD_RESET_ATTEMPTS = 3

const passwordResetAttempts = new Map<string, number[]>()

export function normalizePasswordResetEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function resetPasswordRateLimitForTests(): void {
  passwordResetAttempts.clear()
}

export function recordPasswordResetAttempt(email: string, now = Date.now()): void {
  const normalizedEmail = normalizePasswordResetEmail(email)
  const attempts = (passwordResetAttempts.get(normalizedEmail) ?? []).filter(
    (timestamp) => now - timestamp < RESET_PASSWORD_WINDOW_MS
  )

  if (attempts.length >= MAX_PASSWORD_RESET_ATTEMPTS) {
    throw new APIError("TOO_MANY_REQUESTS", {
      code: "RESET_RATE_LIMIT_EXCEEDED",
      message: "RESET_RATE_LIMIT_EXCEEDED",
    })
  }

  attempts.push(now)
  passwordResetAttempts.set(normalizedEmail, attempts)
}
