"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { markOnline } from "@/hooks/use-offline-session"
import { getSession, signIn, signOut } from "@/lib/auth-client"
import { type Role } from "@/lib/permissions"
import { cn } from "@/lib/utils"

const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Administrateur" },
  { value: "commercial", label: "Commercial" },
  { value: "operateur", label: "Opérateur" },
]

const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  commercial: "Commercial",
  operateur: "Opérateur",
}

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [selectedRole, setSelectedRole] = useState<Role>("commercial")
  const [error, setError] = useState<string>("")
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsPending(true)

    try {
      const result = await signIn.email({
        email,
        password,
      })

      if (result.error) {
        const code = result.error.code ?? ""
        if (code === "ACCOUNT_LOCKED" || code === "TOO_MANY_REQUESTS") {
          setError(
            "Compte temporairement verrouillé. Contactez l'administrateur pour déverrouiller."
          )
        } else {
          setError("Email ou mot de passe incorrect.")
        }
      } else {
        const sessionData = await getSession();
        const actualRole = ((sessionData?.data?.user as Record<string, unknown>)?.role ?? "commercial") as Role;

        if (actualRole !== selectedRole) {
          await signOut({ fetchOptions: { onSuccess: () => {} } });
          setError(`Rôle incorrect. Votre rôle est ${ROLE_LABELS[actualRole]}.`);
          setIsPending(false);
          return;
        }

        markOnline();
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center px-7 py-12">
      {/* Logo + titre */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <Image
          src="/logo-mark.svg"
          alt="Quotation Logistique"
          width={48}
          height={48}
          priority
        />
        <h1 className="font-serif text-2xl font-semibold text-brand-navy">
          Quotation · Logistique
        </h1>
      </div>

      {/* Segmented control rôle — MVP-0 : UX uniquement, n'affecte pas l'auth */}
      <div
        className="mb-6 flex w-full max-w-sm gap-1 rounded-xl border border-input bg-surface-alt p-1"
        role="group"
        aria-label="Sélection du rôle"
      >
        {ROLES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={selectedRole === value}
            onClick={() => setSelectedRole(value)}
            className={cn(
              "min-h-[44px] flex-1 rounded-[8px] px-2 py-2 text-xs font-semibold transition-colors",
              selectedRole === value
                ? "bg-brand-navy text-text-on-dark"
                : "text-text-secondary hover:bg-surface"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Formulaire */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4"
        aria-label="Formulaire de connexion"
      >
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-semibold text-text-muted">
            {/* TODO(1.5): migrer vers next-intl useTranslations() */}
            Adresse e-mail
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isPending}
            aria-describedby={error ? "login-error" : undefined}
            className="rounded-xl border-input bg-surface focus:border-ring"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-semibold text-text-muted">
            {/* TODO(1.5): migrer vers next-intl useTranslations() */}
            Mot de passe
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Votre mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isPending}
            aria-describedby={error ? "login-error" : undefined}
            className="rounded-xl border-input bg-surface focus:border-ring"
          />
        </div>

        {error && (
          <p id="login-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="h-11 w-full rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep"
          disabled={isPending}
        >
          {isPending ? "Connexion…" : "Se connecter"}
        </Button>

        <div className="text-center">
          <Link
            href="/forgot-password"
            className="min-h-[44px] inline-flex items-center text-sm text-brand-navy underline-offset-4 hover:underline"
          >
            Mot de passe oublié ?
          </Link>
        </div>
      </form>

      {/* Footer offline */}
      <p className="mt-8 flex items-center gap-1.5 text-xs text-text-muted">
        <span
          className="inline-block h-2 w-2 rounded-full bg-green-500"
          aria-hidden="true"
        />
        Fonctionne hors ligne · session 7 jours
      </p>
    </div>
  )
}
