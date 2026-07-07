"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { STATUS_CONFIG } from "@/components/quote/status-badge";
import type { QuoteLocal } from "@/lib/local-db";
import { db } from "@/lib/local-db";
import {
  ALL_STATUSES,
  canTransition,
  validateDraftToValidated,
  type DraftValidationErrorCode,
  type QuoteStatusValue,
} from "@/lib/quote-status";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import type { EntityTable } from "dexie";
const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute("aria-disabled") !== "true"
  );
}

interface StatusChangeSheetProps {
  quoteId: string;
  currentStatus: QuoteStatusValue;
  userId: string;
  userName: string;
  onClose: () => void;
  isOpen: boolean;
}

/**
 * StatusChangeSheet — Bottom sheet de changement de statut d'un devis (AC2).
 *
 * Implémente UX-DR12 (bottom sheet : slide-up, backdrop, focus trap,
 * focus restore) et la machine à états FR-15 (AC1).
 *
 * - Les transitions invalides sont désactivées (aria-disabled) mais visibles.
 * - La transition Brouillon → Validé déclenche une validation complète (AC3).
 * - À la confirmation : applyLocalMutation("quote", ...) + écriture directe
 *   dans db.quoteStatusLogs (append-only, non syncé en MVP-0) + triggerSync.
 *   (AC4)
 */
export function StatusChangeSheet({
  quoteId,
  currentStatus,
  userId,
  userName,
  onClose,
  isOpen,
}: StatusChangeSheetProps) {
  const t = useTranslations("devis");
  const [isPending, setIsPending] = useState(false);
  const [errors, setErrors] = useState<DraftValidationErrorCode[] | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);
  // Mémorise le déclencheur pour restaurer le focus à la fermeture (NFR-A2).
  const triggerRef = useRef<HTMLElement | null>(null);

  // Focus trap + restauration du focus (NFR-A2, AC2)
  useEffect(() => {
    if (!isOpen) return;

    triggerRef.current = document.activeElement as HTMLElement;

    // Focus initial sur le premier élément focalisable du sheet.
    const focusFirst = () => {
      const focusable = getFocusableElements(sheetRef.current);
      focusable[0]?.focus();
    };
    focusFirst();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && sheetRef.current) {
        const focusable = getFocusableElements(sheetRef.current);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restauration du focus sur le déclencheur à la fermeture (NFR-A2).
      triggerRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function errorMessage(code: DraftValidationErrorCode): string {
    return t(`status.validationErrors.${code}` as const);
  }

  async function handleSelectStatus(newStatus: QuoteStatusValue) {
    if (isPending) return;
    if (!canTransition(currentStatus, newStatus)) return;

    setErrors(null);
    setGeneralError(null);

    // AC3 — validation complète Brouillon → Validé
    if (currentStatus === "draft" && newStatus === "validated") {
      const dbQuote = await db.quotes.get(quoteId);
      const lines = await db.quoteLines.where("quoteId").equals(quoteId).toArray();
      const validationErrors = validateDraftToValidated(dbQuote, lines);
      if (validationErrors.length > 0) {
        // Sheet reste ouvert, erreurs affichées inline, statut inchangé.
        setErrors(validationErrors);
        return;
      }
    }

    setIsPending(true);
    try {
      // AC4 — persistance locale + log append-only
      const dbQuote = await db.quotes.get(quoteId);
      if (!dbQuote) {
        setGeneralError(t("status.invalidTransition"));
        return;
      }
      // Re-vérifier la transition : le devis peut avoir changé entre l'ouverture
      // du sheet et la confirmation (concurrence multi-onglet).
      if (!canTransition(dbQuote.status, newStatus)) {
        setGeneralError(t("status.invalidTransition"));
        return;
      }

      const now = new Date().toISOString();
      const updatedQuote: QuoteLocal = {
        ...dbQuote,
        status: newStatus,
        updatedAt: now,
        revision: dbQuote.revision + 1,
      };

      const statusLog = {
        id: crypto.randomUUID(),
        quoteId,
        fromStatus: dbQuote.status,
        toStatus: newStatus,
        changedBy: userId,
        changedByName: userName,
        changedAt: now,
        note: null,
      };

      await applyLocalMutation(
        "quote",
        quoteId,
        "update",
        updatedQuote as unknown as Record<string, unknown>,
        dbQuote.revision,
        async () => {
          await db.quotes.put(updatedQuote);
          await db.quoteStatusLogs.put(statusLog);
        },
        userId,
        [db.quoteStatusLogs as unknown as EntityTable<Record<string, unknown>, string>]
      );

      void triggerSync();

      // UX-DR8 + UX-DR14 — toast de confirmation
      toast.success(t("status.toastChanged", { status: STATUS_CONFIG[newStatus].label }));
      onClose();
    } catch {
      setGeneralError(t("status.invalidTransition"));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={t("status.heading")}
    >
      {/* Backdrop — un tap ferme sans changer d'état (AC2) */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel slide-up */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 max-h-[85dvh] overflow-y-auto rounded-t-[22px] bg-surface p-6 pb-safe"
      >
        <h2 className="mb-1 text-base font-semibold text-text-primary">
          {t("status.heading")}
        </h2>
        <p className="mb-5 text-xs text-text-muted">
          {t("status.currentStatus")} : {STATUS_CONFIG[currentStatus].label}
        </p>

        {/* Erreurs globales (concurrence, introuvable) */}
        {generalError && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {generalError}
          </p>
        )}

        {/* Erreurs de validation Brouillon → Validé (AC3) */}
        {errors && errors.length > 0 && (
          <ul
            role="alert"
            className="mb-4 space-y-1 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errors.map((code) => (
              <li key={code}>{errorMessage(code)}</li>
            ))}
          </ul>
        )}

        {/* Liste des 6 statuts (AC2) */}
        <ul className="space-y-1">
          {ALL_STATUSES.map((status) => {
            const config = STATUS_CONFIG[status];
            const isCurrent = status === currentStatus;
            const allowed = canTransition(currentStatus, status);
            const disabled = !allowed || isPending;
            return (
              <li key={status}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-disabled={disabled || undefined}
                  aria-pressed={isCurrent}
                  onClick={() => void handleSelectStatus(status)}
                  className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${config.dot}`}
                      aria-hidden="true"
                    />
                    {config.label}
                  </span>
                  {isCurrent && (
                    <span className="text-xs text-text-muted">
                      {t("status.currentStatus")}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="mt-5 h-11 w-full rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface-alt disabled:opacity-60"
        >
          {t("status.cancel")}
        </button>
      </div>
    </div>
  );
}
