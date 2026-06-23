import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { LoginForm } from "@/components/auth/login-form"
import { auth } from "@/lib/auth"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; reset?: string }>
}) {
  const { reason, reset } = await searchParams
  const isForced = reason === "session-expired" || reason === "session-revoked"

  // Skip the "already authenticated → redirect to /" check when the user was
  // sent here by the offline-session guard. The guard signs out before pushing,
  // but we bypass as a safety net in case the cookie clears asynchronously.
  if (!isForced) {
    const session = await auth.api.getSession({ headers: await headers() })
    if (session) {
      redirect("/")
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center">
      {reason === "session-expired" && (
        <div
          role="alert"
          className="mb-4 w-full max-w-sm rounded-xl border border-status-expire-bg bg-status-expire-bg px-4 py-3 text-sm text-status-expire-text"
        >
          Session expirée. Reconnectez-vous pour continuer.
        </div>
      )}
      {reason === "session-revoked" && (
        <div
          role="alert"
          className="mb-4 w-full max-w-sm rounded-xl border border-status-expire-bg bg-status-expire-bg px-4 py-3 text-sm text-status-expire-text"
        >
          Session révoquée. Reconnectez-vous.
        </div>
      )}
      {reset === "success" && (
        <div
          role="alert"
          className="mb-4 w-full max-w-sm rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          Mot de passe réinitialisé avec succès. Reconnectez-vous.
        </div>
      )}
      <LoginForm />
    </div>
  )
}
