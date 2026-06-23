import { APIError, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "./db"
import { buildResetPasswordHtml, isEmailDeliveryConfigured, sendEmail } from "./email"
import { checkAccountLockout, recordLoginAttempt } from "./lockout"
import { recordPasswordResetAttempt } from "./password-reset-rate-limit"

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
          if (!email) return
          await checkAccountLockout(email)
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
          if (!email) return

          const ctx = context["context"] as Record<string, unknown> | undefined
          const returned = ctx?.["returned"]

          // Only record when we can positively determine the outcome.
          // Ambiguous shape (no statusCode) -> skip to avoid false resets.
          if (returned === null || returned === undefined || typeof returned !== "object") return
          const statusCode = (returned as Record<string, unknown>)["statusCode"]
          if (typeof statusCode !== "number") return

          await recordLoginAttempt(email, statusCode < 400)
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
  plugins: [accountLockoutPlugin, passwordResetRateLimitPlugin],
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
