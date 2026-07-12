import { createAuthClient } from "better-auth/react"

// Use the current origin in the browser: pages served from tenant subdomains
// ({slug}.APEX_DOMAIN) must call /api/auth on their own host — a hardcoded apex
// baseURL makes those calls cross-origin and the browser blocks them (no CORS
// headers on /api/auth).
export const authClient = createAuthClient({
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
})

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  getSession,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
} = authClient