"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldErrors = Partial<Record<string, string>>;

export function CreateUserForm() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setIsPending(true);

    try {
      const res = await fetch("/api/v1/owner/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role: "superadmin",
          sendWelcomeEmail,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        if (sendWelcomeEmail && !data?.emailSent) {
          toast.warning(`Compte créé : ${name.trim()} — email non envoyé, communiquez le mot de passe manuellement.`);
        } else {
          toast.success(`Compte créé : ${name.trim()}`);
        }
        router.push("/owner/users");
        return;
      }

      if (res.status === 409) {
        setErrors({ email: "Un utilisateur avec cet email existe déjà." });
        return;
      }

      if (data?.error?.fields) {
        setErrors(data.error.fields);
        return;
      }

      toast.error("Erreur lors de la création du compte.");
    } catch {
      toast.error("Erreur réseau.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-xs font-semibold text-text-muted">Nom *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
          aria-invalid={!!errors.name}
          className="rounded-xl border-input bg-surface"
        />
        {errors.name && <p role="alert" className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs font-semibold text-text-muted">Email *</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          aria-invalid={!!errors.email}
          className="rounded-xl border-input bg-surface"
        />
        {errors.email && <p role="alert" className="text-xs text-destructive">{errors.email}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs font-semibold text-text-muted">Mot de passe *</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isPending}
          aria-invalid={!!errors.password}
          className="rounded-xl border-input bg-surface"
        />
        {errors.password && <p role="alert" className="text-xs text-destructive">{errors.password}</p>}
      </div>

      <p className="rounded-xl bg-surface-alt px-3 py-2 text-xs text-text-secondary">
        Ce compte aura le rôle <strong>Owner (superadmin)</strong> — accès complet à la console
        owner. Les utilisateurs d&apos;un tenant se créent depuis la fiche du tenant, onglet
        Utilisateurs.
      </p>

      <label className="flex items-center gap-1.5 text-xs text-text-secondary">
        <input
          id="sendWelcomeEmail"
          type="checkbox"
          checked={sendWelcomeEmail}
          onChange={(e) => setSendWelcomeEmail(e.target.checked)}
          disabled={isPending}
          className="h-3.5 w-3.5"
        />
        Envoyer l&apos;email de bienvenue avec les identifiants
      </label>

      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep"
      >
        {isPending ? "Création en cours…" : "Créer le compte"}
      </Button>
    </form>
  );
}
