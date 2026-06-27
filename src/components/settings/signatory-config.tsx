"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiveCompany } from "@/hooks/use-live-company";
import { db } from "@/lib/local-db";
import type { CompanyLocal } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";

interface SignatoryConfigProps {
  companyId: string | null;
  canEdit: boolean;
  userId: string;
  initialCompany: CompanyLocal | null;
}

/**
 * Outer wrapper — subscribes to Dexie via useLiveCompany and re-mounts the
 * inner form whenever the company's id or revision changes. This ensures that
 * after a background sync pull the inner form's controlled-field state is always
 * in sync with the latest Dexie record, preventing stale state from overwriting
 * more recent signatory values.
 */
export function SignatoryConfig(props: SignatoryConfigProps) {
  const liveCompany = useLiveCompany();
  const effectiveCompany: CompanyLocal | null =
    liveCompany !== undefined
      ? (liveCompany ?? props.initialCompany)
      : props.initialCompany;

  const effectiveCompanyId = effectiveCompany?.id ?? props.companyId;
  const formKey = effectiveCompany
    ? `${effectiveCompany.id}:${effectiveCompany.revision}`
    : "no-company";

  return (
    <SignatoryConfigInner
      key={formKey}
      {...props}
      companyId={effectiveCompanyId}
      initialCompany={effectiveCompany}
    />
  );
}

/** Inner form — pure, controlled by props at mount time. Re-keyed by wrapper on revision change. */
function SignatoryConfigInner({ companyId, canEdit, userId, initialCompany }: SignatoryConfigProps) {
  const [signataireNom, setSignataireNom] = useState(initialCompany?.signataireNom ?? "");
  const [signataireFonction, setSignataireFonction] = useState(
    initialCompany?.signataireFonction ?? ""
  );
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!initialCompany || !companyId) return;

    setError(null);
    setIsPending(true);

    try {
      const payload: Record<string, unknown> = {
        raisonSociale: initialCompany.raisonSociale,
        rccm: initialCompany.rccm,
        nif: initialCompany.nif,
        phones: initialCompany.phones,
        emails: initialCompany.emails,
        formeJuridique: initialCompany.formeJuridique ?? null,
        capital: initialCompany.capital ?? null,
        adresse: initialCompany.adresse ?? null,
        bp: initialCompany.bp ?? null,
        logoUrl: initialCompany.logoUrl ?? null,
        signataireNom: signataireNom.trim() || null,
        signataireFonction: signataireFonction.trim() || null,
        conditionsPaiementDefaut: initialCompany.conditionsPaiementDefaut ?? null,
        companyId: initialCompany.companyId ?? null,
        pays: initialCompany.pays,
        updatedAt: new Date().toISOString(),
        createdAt: initialCompany.createdAt,
      };

      await applyLocalMutation(
        "company",
        initialCompany.id,
        "update",
        payload,
        initialCompany.revision,
        async () => {
          const putObj: CompanyLocal = {
            ...initialCompany,
            revision: initialCompany.revision + 1,
            updatedAt: new Date().toISOString(),
          };
          const newNom = signataireNom.trim() || null;
          const newFonction = signataireFonction.trim() || null;
          if (newNom !== null) {
            putObj.signataireNom = newNom;
          } else {
            delete putObj.signataireNom;
          }
          if (newFonction !== null) {
            putObj.signataireFonction = newFonction;
          } else {
            delete putObj.signataireFonction;
          }
          await db.company.put(putObj);
        },
        userId
      );

      void triggerSync();
      toast.success("Signataire enregistré");
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsPending(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Signataire par défaut
        </p>
        <div className="space-y-2">
          {initialCompany?.signataireNom ? (
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-text-muted">Nom</p>
              <p className="text-sm text-text-primary">{initialCompany.signataireNom}</p>
            </div>
          ) : null}
          {initialCompany?.signataireFonction ? (
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-text-muted">Fonction</p>
              <p className="text-sm text-text-primary">{initialCompany.signataireFonction}</p>
            </div>
          ) : null}
          {!initialCompany?.signataireNom && !initialCompany?.signataireFonction && (
            <p className="text-xs italic text-text-muted">Aucun signataire défini.</p>
          )}
        </div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Signataire par défaut
        </p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="signataireNom"
              className="text-xs font-semibold text-text-muted"
            >
              Nom du signataire
            </Label>
            <Input
              id="signataireNom"
              disabled
              className="rounded-xl border-input bg-surface"
              placeholder="Ex: Mamadou Maiga"
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="signataireFonction"
              className="text-xs font-semibold text-text-muted"
            >
              Fonction
            </Label>
            <Input
              id="signataireFonction"
              disabled
              className="rounded-xl border-input bg-surface"
              placeholder="Ex: Directeur Général"
            />
          </div>
          <p className="text-xs text-text-muted">
            Enregistrez d&apos;abord les informations société
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Signataire par défaut
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label
            htmlFor="signataireNom"
            className="text-xs font-semibold text-text-muted"
          >
            Nom du signataire
          </Label>
          <Input
            id="signataireNom"
            value={signataireNom}
            onChange={(e) => setSignataireNom(e.target.value)}
            disabled={isPending}
            className="rounded-xl border-input bg-surface"
            placeholder="Ex: Mamadou Maiga"
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="signataireFonction"
            className="text-xs font-semibold text-text-muted"
          >
            Fonction
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

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={isPending}
          className="h-11 w-full rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep"
        >
          {isPending ? "Enregistrement…" : "Enregistrer le signataire"}
        </Button>
      </form>
    </div>
  );
}
