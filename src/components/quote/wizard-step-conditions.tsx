"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import type { CompanyLocal } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import { useWizardStore } from "@/stores/wizard-store";

interface WizardStepConditionsProps {
  userId: string;
  company: CompanyLocal;
}

/**
 * Étape 5 du wizard de création de devis — Conditions de paiement.
 *
 * Pré-remplit le champ `conditionsPaiement` depuis le devis courant (QuoteLocal)
 * puis, si vide, depuis les conditions par défaut de la société
 * (CompanyLocal.conditionsPaiementDefaut). La saisie reste locale au devis et
 * n'altère pas les conditions par défaut définies en paramètres.
 *
 * Au clic sur "Terminer", persiste `conditionsPaiement` sur QuoteLocal via
 * applyLocalMutation (offline-capable), puis resetWizard() + redirect /devis.
 */
export function WizardStepConditions({ userId, company }: WizardStepConditionsProps) {
  const t = useTranslations("devis.wizard.conditions");
  const tW = useTranslations("devis.wizard");
  const router = useRouter();
  const { quoteId, setStep, resetWizard } = useWizardStore();

  const [conditions, setConditions] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Charge le devis courant depuis Dexie et pré-remplit :
  // QuoteLocal.conditionsPaiement en priorité, sinon CompanyLocal.conditionsPaiementDefaut.
  // Tous les setState sont appelés uniquement dans les callbacks asynchrones de la
  // promise (jamais synchrone dans le corps de l'effect — règle react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    const fallback = company.conditionsPaiementDefaut ?? "";

    const load = async () => {
      try {
        if (!quoteId) {
          // Pas de devis courant → défaut société uniquement.
          if (!cancelled) setConditions(fallback);
          return;
        }
        const dbQuote = await db.quotes.get(quoteId);
        if (cancelled) return;
        if (dbQuote) {
          // Devis existant → conditions du devis (ou défaut société si vide)
          setConditions(dbQuote.conditionsPaiement ?? fallback);
        } else {
          // Devis absent → défaut société uniquement
          setConditions(fallback);
        }
      } catch {
        if (!cancelled) setConditions(fallback);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  async function handleFinish() {
    if (!quoteId) {
      setGlobalError(tW("objetRequired") ? t("errorNoQuote") : t("errorNoQuote"));
      return;
    }

    setIsPending(true);
    setGlobalError(null);

    try {
      const now = new Date().toISOString();
      const trimmed = conditions.trim();

      // Re-read latest quote AVANT mutation to capture current revision.
      const dbQuote = await db.quotes.get(quoteId);
      if (!dbQuote) {
        setGlobalError(t("errorNoQuote"));
        return;
      }

      await applyLocalMutation(
        "quote",
        quoteId,
        "update",
        { ...dbQuote, conditionsPaiement: trimmed, updatedAt: now },
        dbQuote.revision, // revision lue AVANT la mutation
        async () => {
          await db.quotes.put({
            ...dbQuote,
            conditionsPaiement: trimmed,
            updatedAt: now,
            revision: dbQuote.revision + 1,
          });
        },
        userId,
      );

      // AuditMirror AFTER applyLocalMutation (convention établie Story 3.5).
      await db.auditMirror.add({
        id: crypto.randomUUID(),
        who: userId,
        what: "quote.conditions_update",
        when: now,
        where: "/devis/nouveau",
        entityType: "quote",
        entityId: quoteId,
        before: { conditionsPaiement: dbQuote.conditionsPaiement ?? null },
        after: { conditionsPaiement: trimmed || null },
        createdAt: now,
        synced: false,
      });

      void triggerSync();
      toast.success(t("successToast"));
      resetWizard();
      router.push("/devis");
    } catch {
      setGlobalError(t("errorGeneric"));
    } finally {
      setIsPending(false);
    }
  }

  if (!loaded) {
    return (
      <div className="space-y-3 px-5 pb-6 pt-4">
        <div className="h-24 animate-pulse rounded-xl bg-border" />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-5 pb-6">
      <h2 className="font-serif text-xl font-semibold text-text-primary">
        {t("heading")}
      </h2>

      <div className="space-y-1.5">
        <label
          htmlFor="conditionsPaiement"
          className="text-xs font-semibold text-text-muted"
        >
          {t("label")}
        </label>
        <textarea
          id="conditionsPaiement"
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          disabled={isPending}
          placeholder={t("placeholder")}
          className="min-h-[100px] w-full resize-none rounded-xl border border-input bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="mt-1 text-xs text-text-muted">{t("helpText")}</p>
      </div>

      {globalError && (
        <p role="alert" className="text-xs text-destructive">
          {globalError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setStep(4)}
          disabled={isPending}
          className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface disabled:opacity-60"
        >
          {tW("previous")}
        </button>
        <button
          type="button"
          onClick={handleFinish}
          disabled={isPending}
          className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
        >
          {isPending ? t("finishing") : t("finish")}
        </button>
      </div>
    </div>
  );
}
