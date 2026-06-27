"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { liveQuery } from "dexie";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/local-db";
import type { AuditEventLocal, ClientLocal } from "@/lib/local-db";
import type { Role } from "@/lib/permissions";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import { clientSchema } from "@/lib/validation/client";

interface ClientEditFormProps {
  clientId: string;
  userId: string;
  role: Role;
}

export function ClientEditForm({ clientId, userId, role }: ClientEditFormProps) {
  const router = useRouter();
  const [client, setClient] = useState<ClientLocal | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [auditLog, setAuditLog] = useState<AuditEventLocal[]>([]);
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

  useEffect(() => {
    const subscription = liveQuery(() => db.clients.get(clientId)).subscribe({
      next: (c) => {
        setClient(c);
        setLoading(false);
        if (c) {
          setCompanyName(c.companyName ?? "");
          setContactName(c.contactName ?? "");
          setPhone(c.phone ?? "");
          setEmail(c.email ?? "");
          setCity(c.city ?? "");
          setAddress(c.address ?? "");
          setNotes(c.notes ?? "");
        }
      },
      error: () => setLoading(false),
    });
    return () => subscription.unsubscribe();
  }, [clientId]);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.auditMirror
        .where("entityId")
        .equals(clientId)
        .reverse()
        .sortBy("when"),
    ).subscribe({
      next: (events) => setAuditLog(events),
      error: () => setAuditLog([]),
    });
    return () => sub.unsubscribe();
  }, [clientId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
    );
  }

  if (!client) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-secondary">Client introuvable.</p>
        <Link
          href="/clients"
          className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Retour aux clients
        </Link>
      </div>
    );
  }

  if (role === "commercial" && client.ownerId !== userId) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-secondary">
          Vous n&apos;avez pas la permission de modifier ce client.
        </p>
        <Link
          href="/clients"
          className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Retour aux clients
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
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
        validation.error.flatten().fieldErrors,
      )) {
        if (msgs?.[0]) fieldErrors[key] = msgs[0];
      }
      setErrors(fieldErrors);
      return;
    }

    const data = validation.data;
    setIsPending(true);

    try {
      const now = new Date().toISOString();

      const beforeSnapshot = {
        companyName: client.companyName,
        contactName: client.contactName,
        phone: client.phone,
        email: client.email,
        country: client.country,
        city: client.city,
        address: client.address,
        notes: client.notes,
      };

      const payload: Record<string, unknown> = {
        companyName: data.companyName,
        contactName: data.contactName ?? null,
        phone: data.phone,
        email: data.email ?? null,
        country: data.country ?? "NE",
        city: data.city ?? null,
        address: data.address ?? null,
        notes: data.notes ?? null,
        pays: "NE",
        ownerId: client.ownerId ?? null,
        companyId: client.companyId ?? null,
        updatedAt: now,
      };

      // Build full replacement record — clearing optional fields not present in new data.
      // Dexie .update() ignores undefined keys (does not delete them), so .put() is required
      // to correctly clear previously-set optional fields.
      const updatedClient: ClientLocal = {
        id: client.id,
        companyName: data.companyName,
        phone: data.phone,
        country: data.country ?? "NE",
        pays: client.pays,
        revision: client.revision,
        createdAt: client.createdAt,
        updatedAt: now,
      };
      if (client.ownerId) updatedClient.ownerId = client.ownerId;
      if (client.companyId) updatedClient.companyId = client.companyId;
      if (client.deletedAt) updatedClient.deletedAt = client.deletedAt;
      if (data.contactName) updatedClient.contactName = data.contactName;
      if (data.email) updatedClient.email = data.email;
      if (data.city) updatedClient.city = data.city;
      if (data.address) updatedClient.address = data.address;
      if (data.notes) updatedClient.notes = data.notes;

      const mutationResult = await applyLocalMutation(
        "client",
        clientId,
        "update",
        payload,
        client.revision,
        async () => {
          await db.clients.put(updatedClient);
        },
        userId,
      );
      const syncOpId = mutationResult.opId;

      const auditId = crypto.randomUUID();
      await db.auditMirror.add({
        id: auditId,
        who: userId,
        what: "client.update",
        when: now,
        where:
          typeof window !== "undefined" ? window.location.pathname : "client",
        entityType: "client",
        entityId: clientId,
        before: beforeSnapshot,
        after: {
          companyName: data.companyName,
          contactName: data.contactName,
          phone: data.phone,
          email: data.email,
          country: data.country ?? "NE",
          city: data.city,
          address: data.address,
          notes: data.notes,
        },
        createdAt: now,
        synced: false,
      });

      // Mark audit synced only when the op was confirmed applied or noop on the server.
      // Conflict ops are also deleted from syncQueue after handleConflict, so checking
      // queue absence is insufficient — we check status directly from the push result.
      void triggerSync().then(async (pushResult) => {
        try {
          if (pushResult) {
            const opResult = pushResult.results.find((r) => r.opId === syncOpId);
            if (opResult?.status === "applied" || opResult?.status === "noop") {
              await db.auditMirror.update(auditId, { synced: true });
            }
          }
        } catch {
          // non-critical
        }
      });

      toast.success(`Client « ${data.companyName} » mis à jour`);
      router.push("/clients");
    } catch {
      setGlobalError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
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
          {isPending ? "Enregistrement…" : "Enregistrer les modifications"}
        </Button>
      </form>

      {auditLog.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-text-primary">
            Historique des modifications
          </h2>
          <ul className="mt-3 space-y-2">
            {auditLog.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-border bg-surface p-3 text-xs text-text-secondary"
              >
                <p className="font-medium text-text-primary">
                  Modifié le{" "}
                  {new Date(entry.when).toLocaleDateString("fr-NE", {
                    dateStyle: "medium",
                  })}
                </p>
                <p className="mt-0.5">Par : {entry.who}</p>
                {!!entry.before && !!entry.after && (
                  <p className="mt-0.5 text-text-muted">
                    {Object.keys(entry.after as Record<string, unknown>)
                      .filter(
                        (k) =>
                          (entry.before as Record<string, unknown>)[k] !==
                          (entry.after as Record<string, unknown>)[k],
                      )
                      .join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
