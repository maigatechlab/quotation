"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLiveCompany } from "@/hooks/use-live-company";
import { db } from "@/lib/local-db";
import type { CompanyLocal } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";

interface PaymentTermsFormProps {
  company: CompanyLocal;
  userId: string;
}

/**
 * Outer wrapper — subscribes to Dexie via useLiveCompany and re-mounts the
 * inner form whenever the company's id or revision changes. This ensures that
 * after a background sync pull the inner form's controlled-field state is always
 * in sync with the latest Dexie record, preventing stale state from overwriting
 * more recent values. Mirrors the pattern established in SignatoryConfig /
 * CompanyForm (Story 2.3 / 2.5).
 */
export function PaymentTermsForm(props: PaymentTermsFormProps) {
  const liveCompany = useLiveCompany();
  // undefined = Dexie still loading → fall back to SSR prop
  // null      = Dexie confirmed no company → fall back to SSR prop
  // CompanyLocal = Dexie has company → use it
  const effectiveCompany: CompanyLocal | null =
    liveCompany !== undefined ? (liveCompany ?? props.company) : props.company;

  const formKey = effectiveCompany
    ? `${effectiveCompany.id}:${effectiveCompany.revision}`
    : "no-company";

  if (!effectiveCompany) {
    return null;
  }

  return <PaymentTermsFormInner key={formKey} {...props} company={effectiveCompany} />;
}

/** Inner form — pure, controlled by props at mount time. Re-keyed by wrapper on revision change. */
function PaymentTermsFormInner({ company, userId }: PaymentTermsFormProps) {
  const t = useTranslations("parametres.conditionsPaiement");
  const [terms, setTerms] = useState(company.conditionsPaiementDefaut ?? "");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the controlled field back to its mount-time initial value (derived from
  // the `company` prop) and clear the error, discarding unsaved edits.
  function handleCancel() {
    setTerms(company.conditionsPaiementDefaut ?? "");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      // Re-read the latest record from Dexie AVANT applyLocalMutation so the
      // revision we pass is current (the wrapper re-mounts on revision change,
      // but a sync could land between mounts).
      const dbCompany = await db.company.get(company.id);
      if (!dbCompany) {
        setError(t("errorNotFound"));
        return;
      }

      const now = new Date().toISOString();
      const trimmed = terms.trim();

      // Build a COMPLETE payload (pattern from signatory-config.tsx) — applyLocalMutation
      // for "company" must include every field; partial updates would clobber other stories'
      // data on sync push. Never use db.company.update(id, partial).
      const payload: Record<string, unknown> = {
        raisonSociale: dbCompany.raisonSociale,
        rccm: dbCompany.rccm,
        nif: dbCompany.nif,
        phones: dbCompany.phones,
        emails: dbCompany.emails,
        formeJuridique: dbCompany.formeJuridique ?? null,
        capital: dbCompany.capital ?? null,
        adresse: dbCompany.adresse ?? null,
        bp: dbCompany.bp ?? null,
        logoUrl: dbCompany.logoUrl ?? null,
        signataireNom: dbCompany.signataireNom ?? null,
        signataireFonction: dbCompany.signataireFonction ?? null,
        conditionsPaiementDefaut: trimmed || null,
        companyId: dbCompany.companyId ?? null,
        pays: dbCompany.pays,
        updatedAt: now,
        createdAt: dbCompany.createdAt,
      };

      await applyLocalMutation(
        "company",
        dbCompany.id,
        "update",
        payload,
        dbCompany.revision, // revision lue AVANT la mutation (jamais après)
        async () => {
          const putObj: CompanyLocal = {
            ...dbCompany,
            revision: dbCompany.revision + 1,
            updatedAt: now,
          };
          if (trimmed) {
            putObj.conditionsPaiementDefaut = trimmed;
          } else {
            delete putObj.conditionsPaiementDefaut;
          }
          await db.company.put(putObj);
        },
        userId,
      );

      void triggerSync();
      toast.success(t("successToast"), { duration: 2200 });
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {t("heading")}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="conditionsPaiementDefaut"
            className="text-xs font-semibold text-text-muted"
          >
            {t("label")}
          </label>
          <textarea
            id="conditionsPaiementDefaut"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            disabled={isPending}
            placeholder={t("placeholder")}
            className="min-h-[100px] w-full resize-none rounded-xl border border-input bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-text-muted">{t("description")}</p>
        </div>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={handleCancel}
            className="h-11 flex-1 rounded-xl border-border text-sm font-medium text-text-secondary hover:bg-surface"
          >
            Annuler
          </Button>
          <Button
            type="submit"
            disabled={isPending}
            className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep"
          >
            {isPending ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
