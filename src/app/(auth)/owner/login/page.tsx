import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { LoginForm } from "@/components/auth/login-form"
import { auth } from "@/lib/auth"

export default async function OwnerLoginPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session) {
    const role = (session.user as Record<string, unknown>).role ?? "commercial"
    redirect(role === "superadmin" ? "/owner" : "/")
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center">
      <LoginForm owner />
    </div>
  )
}
