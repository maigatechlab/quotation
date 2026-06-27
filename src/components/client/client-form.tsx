"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/local-db";
import type { ClientLocal } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import { clientSchema } from "@/lib/validation/client";

interface ClientFormProps {
  userId: string;
}

export function ClientForm({ userId }: ClientFormProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setGlobalError(null);

    const formData = {
      companyName: companyName.trim(),
      contactName: contactName.trim() || undefined,
      phone: phone.trim(),
      email: email.trim() || undefined,
      country: "NE",
      city: city.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    const validation = clientSchema.safeParse(formData);
    if (!validation.success) {
      const fieldErrors: Partial<Record<string, string>> = {};
      for (const [key, msgs] of Object.entries(
        validation.error.flatten().fieldErrors
      )) {
        if (msgs?.[0]) fieldErrors[key] = msgs[0];
      }
      setErrors(fieldErrors);
      return;
    }

    const data = validation.data;
    setIsPending(true);

    try {
      const clientId = crypto.randomUUID();
      const now = new Date().toISOString();

      const payload: Record<string, unknown> = {
        companyName: data.companyName,
        phone: data.phone,
        contactName: data.contactName ?? null,
        email: data.email ?? null,
        country: data.country ?? "NE",
        city: data.city ?? null,
        address: data.address ?? null,
        notes: data.notes ?? null,
        deletedAt: null,
        pays: "NE",
        companyId: null,
        ownerId: userId,
        createdAt: now,
        updatedAt: now,
      };

      await applyLocalMutation(
        "client",
        clientId,
        "create",
        payload,
        0,
        async () => {
          const newClient: ClientLocal = {
            id: clientId,
            companyName: data.companyName,
            phone: data.phone,
            country: data.country ?? "NE",
            pays: "NE",
            revision: 0,
            updatedAt: now,
            createdAt: now,
            ...(data.contactName ? { contactName: data.contactName } : {}),
            ...(data.email ? { email: data.email } : {}),
            ...(data.city ? { city: data.city } : {}),
            ...(data.address ? { address: data.address } : {}),
            ...(data.notes ? { notes: data.notes } : {}),
            ...(userId ? { ownerId: userId } : {}),
          };
          await db.clients.add(newClient);
        },
        userId,
      );

      void triggerSync();

      toast.success(`Client « ${data.companyName} » créé`);
      router.push("/clients");
    } catch {
      setGlobalError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="companyName" className="text-xs font-semibold text-text-muted">
          Nom de la société *
        </Label>
        <Input
          id="companyName"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          disabled={isPending}
          aria-invalid={!!errors.companyName}
          aria-describedby={errors.companyName ? "companyName-error" : undefined}
          className="rounded-xl border-input bg-surface"
          placeholder="Ex: Transport Maiga SARL"
        />
        {errors.companyName && (
          <p id="companyName-error" role="alert" className="text-xs text-destructive">
            {errors.companyName}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contactName" className="text-xs font-semibold text-text-muted">
          Nom du contact
        </Label>
        <Input
          id="contactName"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          disabled={isPending}
          className="rounded-xl border-input bg-surface"
          placeholder="Ex: Mamadou Maiga"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone" className="text-xs font-semibold text-text-muted">
          Téléphone *
        </Label>
        <Input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={isPending}
          aria-invalid={!!errors.phone}
          aria-describedby={errors.phone ? "phone-error" : undefined}
          className="rounded-xl border-input bg-surface"
          placeholder="Ex: +227 90 00 00 00"
        />
        {errors.phone && (
          <p id="phone-error" role="alert" className="text-xs text-destructive">
            {errors.phone}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs font-semibold text-text-muted">
          Email
        </Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          className="rounded-xl border-input bg-surface"
          placeholder="Ex: contact@transport-maiga.ne"
        />
        {errors.email && (
          <p id="email-error" role="alert" className="text-xs text-destructive">
            {errors.email}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="city" className="text-xs font-semibold text-text-muted">
          Ville
        </Label>
        <Input
          id="city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          disabled={isPending}
          className="rounded-xl border-input bg-surface"
          placeholder="Ex: Niamey"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address" className="text-xs font-semibold text-text-muted">
          Adresse
        </Label>
        <Input
          id="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={isPending}
          className="rounded-xl border-input bg-surface"
          placeholder="Ex: Quartier Plateau, Rue 10"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes" className="text-xs font-semibold text-text-muted">
          Notes
        </Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isPending}
          className="rounded-xl border-input bg-surface"
          placeholder="Informations complémentaires..."
          rows={3}
        />
      </div>

      {globalError && (
        <p role="alert" className="text-xs text-destructive">
          {globalError}
        </p>
      )}

      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep"
      >
        {isPending ? "Création en cours…" : "Créer le client"}
      </Button>
    </form>
  );
}
