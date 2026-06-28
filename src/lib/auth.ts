import { APIError, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { eq } from "drizzle-orm"
import { emitLoginAudit, emitLogoutAudit } from "./audit"
import { db } from "./db"
import { buildResetPasswordHtml, isEmailDeliveryConfigured, sendEmail } from "./email"
import { checkAccountLockout, recordLoginAttempt } from "./lockout"
import { recordPasswordResetAttempt } from "./password-reset-rate-limit"
import { session as sessionTable, user as userTable } from "./schema"

// Better Auth v1.6 has no built-in maxLoginAttempts. This plugin implements
// account lockout by tracking failed attempts in the user table directly.
const accountLockoutPlugin = {
  id: "account-lockout",
  hooks: {
    before: [
      {
        matcher(context: Record<string, unknown>) {
          return context["path"] === "/sign-in/email"
        },
        async handler(context: Record<string, unknown>) {
          const body = context["body"] as Record<string, unknown> | undefined
          const email = typeof body?.["email"] === "string" ? body["email"] : undefined
          if (!email) return {}
          await checkAccountLockout(email)
          return {}
        },
      },
    ],
    after: [
      {
        matcher(context: Record<string, unknown>) {
          return context["path"] === "/sign-in/email"
        },
        async handler(context: Record<string, unknown>) {
          const body = context["body"] as Record<string, unknown> | undefined
          const email = typeof body?.["email"] === "string" ? body["email"] : undefined
          if (!email) return {}

          const returnStatus = context["returnStatus"] as number | undefined
          if (typeof returnStatus === "number") {
            await recordLoginAttempt(email, returnStatus < 400)
          }
          return {}
        },
      },
    ],
  },
}

// Best-effort audit plugin — never blocks auth flow on failure
const auditPlugin = {
  id: "audit-trail",
  hooks: {
    after: [
      {
        matcher(context: Record<string, unknown>) {
          return context["path"] === "/sign-in/email"
        },
        async handler(context: Record<string, unknown>) {
          const returnStatus = context["returnStatus"] as number | undefined
          if (typeof returnStatus !== "number" || returnStatus >= 400) return {}
          const body = context["body"] as Record<string, unknown> | undefined
          const email = typeof body?.["email"] === "string" ? body["email"] : undefined
          if (!email) return {}
          try {
            const rows = await db
              .select({ id: userTable.id, companyId: userTable.companyId })
              .from(userTable)
              .where(eq(userTable.email, email))
              .limit(1)
            if (rows[0]) {
              const request = context["request"] as Request | undefined
              await emitLoginAudit({
                userId: rows[0].id,
                companyId: rows[0].companyId ?? null,
                ipAddress: request?.headers?.get("x-forwarded-for") ?? null,
                userAgent: request?.headers?.get("user-agent") ?? null,
              })
            }
          } catch {
            // best-effort — do not block login
          }
          return {}
        },
      },
    ],
    before: [
      {
        matcher(context: Record<string, unknown>) {
          return context["path"] === "/sign-out"
        },
        async handler(context: Record<string, unknown>) {
          try {
            const request = context["request"] as Request | undefined
            const cookieHeader = request?.headers?.get("cookie") ?? ""
            // Match both HTTP and HTTPS (Secure-prefixed) session cookie names
            const match = cookieHeader.match(/(?:__Secure-)?better-auth\.session_token=([^;]+)/)
            const token = match?.[1]
            if (!token) return {}
            const rows = await db
              .select({
                userId: sessionTable.userId,
                ipAddress: sessionTable.ipAddress,
                companyId: userTable.companyId,
              })
              .from(sessionTable)
              .leftJoin(userTable, eq(userTable.id, sessionTable.userId))
              .where(eq(sessionTable.token, decodeURIComponent(token)))
              .limit(1)
            if (rows[0]) {
              await emitLogoutAudit({
                userId: rows[0].userId,
                companyId: rows[0].companyId ?? null,
                ipAddress: rows[0].ipAddress ?? null,
              })
            }
          } catch {
            // best-effort — do not block logout
          }
          return {}
        },
      },
    ],
  },
}

const passwordResetRateLimitPlugin = {
  id: "password-reset-rate-limit",
  hooks: {
    before: [
      {
        matcher(context: Record<string, unknown>) {
          return context["path"] === "/request-password-reset"
        },
        async handler(context: Record<string, unknown>) {
          const body = context["body"] as Record<string, unknown> | undefined
          const email = typeof body?.["email"] === "string" ? body["email"] : undefined
          if (!email) return

          if (!isEmailDeliveryConfigured()) {
            throw new APIError("SERVICE_UNAVAILABLE", {
              code: "EMAIL_DELIVERY_NOT_CONFIGURED",
              message: "Email delivery is not configured",
            })
          }

          recordPasswordResetAttempt(email)
        },
      },
    ],
  },
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  plugins: [accountLockoutPlugin, passwordResetRateLimitPlugin, auditPlugin],
  emailAndPassword: {
    enabled: true,
    resetPasswordTokenExpiresIn: 86400, // 24 heures (FR-4)
    sendResetPassword: async ({ user, url }) => {
      try {
        await sendEmail({
          to: user.email,
          subject: "Réinitialisation de votre mot de passe — Quotation Logistique",
          html: buildResetPasswordHtml(user.email, url),
          text: `Réinitialisez votre mot de passe : ${url}\nCe lien expire dans 24h.`,
        })
      } catch (error) {
        // Do not leak whether the submitted email belongs to an account.
        console.error("Password reset email failed", error)
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      // eslint-disable-next-line no-console
      console.log(`\n${"=".repeat(60)}\nEMAIL VERIFICATION\nUser: ${user.email}\nVerification URL: ${url}\n${"=".repeat(60)}\n`)
    },
  },
})
