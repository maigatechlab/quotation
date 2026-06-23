"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { resetPassword } from "@/lib/auth-client"

export function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const urlError = searchParams.get("error")

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [formError, setFormError] = useState("")
  const [isPending, setIsPending] = useState(false)
  const [isExpired, setIsExpired] = useState(false)

  const normalizedUrlError = urlError?.toUpperCase() ?? ""

  if (normalizedUrlError === "INVALID_TOKEN" || !token) {
    return (
      <div className="space-y-4 w-full max-w-sm text-center">
        <p className="text-sm text-destructive">
          {normalizedUrlError === "INVALID_TOKEN"
            ? "Ce lien est invalide ou a déjà été utilisé."
            : "Aucun lien de réinitialisation fourni."}
        </p>
        <Link href="/forgot-password">
          <Button variant="outline" className="w-full">
            Demander un nouveau lien
          </Button>
        </Link>
      </div>
    )
  }

  if (isExpired) {
    return (
      <div className="space-y-4 w-full max-w-sm text-center">
        <p className="text-sm text-destructive">
          Ce lien a expiré. Demandez un nouveau lien.
        </p>
        <Link href="/forgot-password">
          <Button variant="outline" className="w-full">
            Demander un nouveau lien
          </Button>
        </Link>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError("")

    if (password.length < 8) {
      setFormError("Le mot de passe doit contenir au moins 8 caractères.")
      return
    }

    if (password !== confirmPassword) {
      setFormError("Les mots de passe ne correspondent pas.")
      return
    }

    setIsPending(true)

    try {
      const result = await resetPassword({
        newPassword: password,
        token,
      })

      if (result.error) {
        const msg = result.error.message?.toLowerCase() ?? ""
        const code = (result.error as { code?: string }).code ?? ""

        if (msg.includes("expired") || code === "EXPIRED_TOKEN") {
          setIsExpired(true)
        } else if (
          msg.includes("invalid") ||
          msg.includes("already") ||
          code === "INVALID_TOKEN"
        ) {
          setFormError("Ce lien est invalide ou a déjà été utilisé.")
        } else {
          setFormError("Une erreur est survenue. Veuillez réessayer.")
        }
      } else {
        router.push("/login?reset=success")
      }
    } catch {
      setFormError("Une erreur est survenue. Veuillez réessayer.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
      <div className="space-y-2">
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <Input
          id="password"
          type="password"
          placeholder="Au moins 8 caractères"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="Confirmer votre nouveau mot de passe"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={isPending}
        />
      </div>
      {formError && (
        <p className="text-sm text-destructive">{formError}</p>
      )}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Réinitialisation…" : "Réinitialiser le mot de passe"}
      </Button>
    </form>
  )
}

