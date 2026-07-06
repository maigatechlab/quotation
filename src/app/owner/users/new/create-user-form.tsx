"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FieldErrors = Partial<Record<string, string>>;

const ROLES = [
  { value: "commercial", label: "Commercial" },
  { value: "admin", label: "Administrateur" },
  { value: "operateur", label: "Opérateur" },
  { value: "superadmin", label: "Owner (superadmin)" },
];

export function CreateUserForm() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("commercial");
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
          role,
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

      <div className="space-y-1.5">
        <Label htmlFor="role" className="text-xs font-semibold text-text-muted">Rôle</Label>
        <Select value={role} onValueChange={setRole} disabled={isPending}>
          <SelectTrigger id="role" className="min-h-[44px] rounded-xl bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
