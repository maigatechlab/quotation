import { APIError } from "better-auth"
import { eq, sql } from "drizzle-orm"
import { db } from "./db"
import { user as userTable } from "./schema"

// NOTE: db.query.* (relational API) fails inside Better Auth plugin hooks in Next.js 16.
// Use db.select() instead throughout this file.

export const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_TTL_MS = 30 * 60 * 1000 // 30 minutes

export async function checkAccountLockout(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase()
  const rows = await db
    .select({ lockedAt: userTable.lockedAt, loginAttempts: userTable.loginAttempts })
    .from(userTable)
    .where(eq(userTable.email, normalizedEmail))
    .limit(1)
  const found = rows[0]

  if (found?.lockedAt) {
    const elapsed = Date.now() - found.lockedAt.getTime()
    if (elapsed < LOCKOUT_TTL_MS) {
      throw new APIError("FORBIDDEN", {
        code: "ACCOUNT_LOCKED",
        message: "Account is locked due to too many failed attempts",
      })
    }
    // TTL expired — auto-unlock
    await db
      .update(userTable)
      .set({ loginAttempts: 0, lockedAt: null })
      .where(eq(userTable.email, normalizedEmail))
    return
  }

  // TOCTOU mitigation: also block if counter reached threshold before lockedAt was written
  if (found && found.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
    throw new APIError("FORBIDDEN", {
      code: "ACCOUNT_LOCKED",
      message: "Account is locked due to too many failed attempts",
    })
  }
}

// Single atomic SQL statement: increment counter and conditionally set lockedAt.
// PostgreSQL evaluates the CASE with the pre-update row values, so
// `loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS` correctly tests the new count.
export async function recordLoginAttempt(email: string, succeeded: boolean): Promise<void> {
  const normalizedEmail = email.toLowerCase()
  if (succeeded) {
    await db
      .update(userTable)
      .set({ loginAttempts: 0, lockedAt: null })
      .where(eq(userTable.email, normalizedEmail))
  } else {
    await db
      .update(userTable)
      .set({
        loginAttempts: sql`${userTable.loginAttempts} + 1`,
        lockedAt: sql`CASE WHEN ${userTable.loginAttempts} + 1 >= ${MAX_LOGIN_ATTEMPTS} THEN NOW() ELSE ${userTable.lockedAt} END`,
      })
      .where(eq(userTable.email, normalizedEmail))
  }
}
