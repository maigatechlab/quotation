"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiveClients } from "@/hooks/use-live-clients";
import { db } from "@/lib/local-db";
import type { ClientLocal, QuoteLocal } from "@/lib/local-db";
import { getDeviceId, getNextLocalSeq, generateTempNumber } from "@/lib/sync/numbering";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import { useWizardStore } from "@/stores/wizard-store";

interface WizardStepClientProps {
  userId: string;
  companyId?: string | undefined;
  defaultSignataireNom?: string | undefined;
  defaultSigFonction?: string | undefined;
  defaultConditions?: string | undefined;
}

export function WizardStepClient({
  userId,
  companyId,
  defaultSignataireNom,
  defaultSigFonction,
  defaultConditions,
}: WizardStepClientProps) {
  const { clients, total, searchQuery, setSearchQuery } = useLiveClients();

  const [selectedClient, setSelectedClient] = useState<ClientLocal | null>(null);
  const [objet, setObjet] = useState("");
  const [reference, setReference] = useState("");
  const [dateDevis, setDateDevis] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [dateValidite, setDateValidite] = useState(
    () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [signataireNom, setSignataireNom] = useState(defaultSignataireNom ?? "");
  const [signataireFonction, setSignataireFonction] = useState(defaultSigFonction ?? "");
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [isPending, setIsPending] = useState(false);

  async function handleNext() {
    setErrors({});

    if (!selectedClient) {
      setErrors({ client: "Sélectionnez un client" });
      return;
    }
    if (!objet.trim()) {
      setErrors({ objet: "L'objet est requis" });
      return;
    }
    if (!dateDevis) {
      setErrors({ dateDevis: "La date du devis est requise" });
      return;
    }
    if (!dateValidite) {
      setErrors({ dateValidite: "La date de validité est requise" });
      return;
    }

    setIsPending(true);
    try {
      const deviceId = getDeviceId();
      const seq = getNextLocalSeq(deviceId);
      const tempNumber = generateTempNumber(deviceId, seq);
      const quoteId = crypto.randomUUID();
      const now = new Date().toISOString();

      const payload: Record<string, unknown> = {
        number: tempNumber,
        reference: reference.trim() || null,
        objet: objet.trim(),
        status: "draft",
        clientId: selectedClient.id,
        clientSnapshot: selectedClient,
        ownerId: userId,
        dateDevis,
        dateValidite,
        signataireNom: signataireNom || null,
        signataireFonction: signataireFonction || null,
        conditionsPaiement: defaultConditions || null,
        totalFcfa: 0,
        pays: "NE",
        companyId: companyId ?? null,
        createdAt: now,
        updatedAt: now,
      };

      await applyLocalMutation(
        "quote",
        quoteId,
        "create",
        payload,
        0,
        async () => {
          const refTrimmed = reference.trim();
          // as QuoteLocal: exactOptionalPropertyTypes + conditional spreads cause inference widening
          const newQuote = {
            id: quoteId,
            number: tempNumber,
            status: "draft",
            clientId: selectedClient.id,
            clientSnapshot: selectedClient,
            ownerId: userId,
            objet: objet.trim(),
            dateDevis,
            dateValidite,
            totalFcfa: 0,
            pays: "NE",
            revision: 0,
            updatedAt: now,
            createdAt: now,
            ...(refTrimmed ? { reference: refTrimmed } : {}),
            ...(signataireNom ? { signataireNom } : {}),
            ...(signataireFonction ? { signataireFonction } : {}),
            ...(defaultConditions ? { conditionsPaiement: defaultConditions } : {}),
            ...(companyId ? { companyId } : {}),
          } as QuoteLocal;
          await db.quotes.add(newQuote);
        },
        userId,
      );

      await db.auditMirror.add({
        id: crypto.randomUUID(),
        who: userId,
        what: "quote.create",
        when: now,
        where: "/devis/nouveau",
        entityType: "quote",
        entityId: quoteId,
        before: null,
        after: { number: tempNumber, status: "draft", clientId: selectedClient.id },
        createdAt: now,
        synced: false,
      });

      void triggerSync();
      toast.success(`Devis ${tempNumber} créé`);
      useWizardStore.getState().setQuoteId(quoteId);
      useWizardStore.getState().setStep(2);
    } catch {
      setErrors({ global: "Une erreur est survenue. Veuillez réessayer." });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-6 px-5 pb-6">
      {/* Client search */}
      <div>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Rechercher un client…"
            aria-label="Rechercher un client"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {errors.client && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {errors.client}
          </p>
        )}
      </div>

      {/* Client list */}
      <div className="space-y-2">
        {total === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-sm text-text-secondary">Aucun client disponible.</p>
            <Link
              href="/clients/nouveau"
              className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Créer un nouveau client
            </Link>
          </div>
        ) : clients.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-sm text-text-secondary">
              Aucun client trouvé pour «&nbsp;{searchQuery}&nbsp;».
            </p>
          </div>
        ) : (
          clients.map((client) => {
            const isSelected = selectedClient?.id === client.id;
            return (
              <button
                key={client.id}
                type="button"
                onClick={() => setSelectedClient(client)}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${
                  isSelected
                    ? "border-brand-navy bg-brand-navy/5"
                    : "border-border bg-surface hover:border-brand-navy/40"
                }`}
                aria-pressed={isSelected}
                aria-label={`Sélectionner ${client.companyName}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-text-primary">{client.companyName}</p>
                    <p className="mt-0.5 text-sm text-text-secondary">{client.phone}</p>
                    {client.contactName && (
                      <p className="mt-0.5 text-xs text-text-muted">{client.contactName}</p>
                    )}
                    {client.city && (
                      <p className="mt-0.5 text-xs text-text-muted">{client.city}</p>
                    )}
                  </div>
                  {isSelected && (
                    <Check
                      className="ml-3 mt-0.5 h-5 w-5 shrink-0 text-brand-navy"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </button>
            );
          })
        )}

        <Link
          href="/clients/nouveau"
          className="block rounded-xl border border-dashed border-border p-4 text-center text-sm font-medium text-primary hover:border-primary/60 hover:bg-primary/5"
        >
          + Créer un nouveau client
        </Link>
      </div>

      {/* Quote header form */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="objet" className="text-xs font-semibold text-text-muted">
            Objet du devis *
          </Label>
          <Input
            id="objet"
            value={objet}
            onChange={(e) => setObjet(e.target.value)}
            disabled={isPending}
            aria-invalid={!!errors.objet}
            aria-describedby={errors.objet ? "objet-error" : undefined}
            className="rounded-xl border-input bg-surface"
            placeholder="Ex: Transport Niamey → Agadez — 40T"
          />
          {errors.objet && (
            <p id="objet-error" role="alert" className="text-xs text-destructive">
              {errors.objet}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reference" className="text-xs font-semibold text-text-muted">
            Référence (optionnel)
          </Label>
          <Input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={isPending}
            className="rounded-xl border-input bg-surface"
            placeholder="Ex: REF-2026-001"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="dateDevis" className="text-xs font-semibold text-text-muted">
              Date du devis
            </Label>
            <Input
              id="dateDevis"
              type="date"
              value={dateDevis}
              onChange={(e) => setDateDevis(e.target.value)}
              disabled={isPending}
              aria-invalid={!!errors.dateDevis}
              aria-describedby={errors.dateDevis ? "dateDevis-error" : undefined}
              className="rounded-xl border-input bg-surface"
            />
            {errors.dateDevis && (
              <p id="dateDevis-error" role="alert" className="text-xs text-destructive">
                {errors.dateDevis}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dateValidite" className="text-xs font-semibold text-text-muted">
              Date de validité
            </Label>
            <Input
              id="dateValidite"
              type="date"
              value={dateValidite}
              onChange={(e) => setDateValidite(e.target.value)}
              disabled={isPending}
              aria-invalid={!!errors.dateValidite}
              aria-describedby={errors.dateValidite ? "dateValidite-error" : undefined}
              className="rounded-xl border-input bg-surface"
            />
            {errors.dateValidite && (
              <p id="dateValidite-error" role="alert" className="text-xs text-destructive">
                {errors.dateValidite}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signataireNom" className="text-xs font-semibold text-text-muted">
            Signataire — Nom
          </Label>
          <Input
            id="signataireNom"
            value={signataireNom}
            onChange={(e) => setSignataireNom(e.target.value)}
            disabled={isPending}
            className="rounded-xl border-input bg-surface"
            placeholder="Ex: Moussa Maiga"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signataireFonction" className="text-xs font-semibold text-text-muted">
            Signataire — Fonction
          </Label>
          <Input
            id="signataireFonction"
            value={signataireFonction}
            onChange={(e) => setSignataireFonction(e.target.value)}
            disabled={isPending}
            className="rounded-xl border-input bg-surface"
            placeholder="Ex: Directeur Général"
          />
        </div>
      </div>

      {errors.global && (
        <p role="alert" className="text-xs text-destructive">
          {errors.global}
        </p>
      )}

      <Button
        type="button"
        onClick={handleNext}
        disabled={isPending}
        className="h-11 w-full rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep"
      >
        {isPending ? "Création en cours…" : "Suivant"}
      </Button>
    </div>
  );
}
