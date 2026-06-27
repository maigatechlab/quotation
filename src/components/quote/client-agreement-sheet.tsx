"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { db } from "@/lib/local-db";
import type { QuoteLocal } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";

interface ClientAgreementSheetProps {
  quoteId: string;
  quote: QuoteLocal;
  userId: string;
  onClose: () => void;
  isOpen: boolean;
}

function validateDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 7);
  maxDate.setHours(23, 59, 59, 999);
  return date <= maxDate;
}

export function ClientAgreementSheet({
  quoteId,
  quote,
  userId,
  onClose,
  isOpen,
}: ClientAgreementSheetProps) {
  const t = useTranslations("devis");
  const snapshot = quote.clientSnapshot as { contactName?: string; companyName?: string } | null;

  const [clientNom, setClientNom] = useState(snapshot?.contactName ?? "");
  const [clientFonction, setClientFonction] = useState("");
  const [clientDate, setClientDate] = useState(new Date().toISOString().slice(0, 10));
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const firstFocusRef = useRef<HTMLInputElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const maxDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);

  // Focus first input when sheet opens
  useEffect(() => {
    if (isOpen) {
      firstFocusRef.current?.focus();
    }
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    setError(null);
    setScanError(null);

    if (!clientNom.trim()) {
      setError(t("accord.errorNomRequired"));
      return;
    }
    if (!validateDate(clientDate)) {
      setError(t("accord.errorDateFuture"));
      return;
    }

    setIsPending(true);

    try {
      // Status guard BEFORE any upload — avoids orphaned blobs when the quote
      // moved off "sent" underneath us (another tab/device).
      const dbQuote = await db.quotes.get(quoteId);
      if (!dbQuote) throw new Error("Quote not found");

      if (dbQuote.status !== "sent") {
        setError(t("accord.statusNotSent"));
        return;
      }

      let scanUrl: string | undefined;
      let scanFailed = false;

      if (scanFile) {
        try {
          const formData = new FormData();
          formData.append("scan", scanFile);
          const res = await fetch(`/api/v1/quotes/${quoteId}/agreement-scan`, {
            method: "POST",
            body: formData,
          });
          if (res.ok) {
            const data = (await res.json()) as { scanUrl: string };
            scanUrl = data.scanUrl;
          } else {
            setScanError(t("accord.errorScanUpload"));
            scanFailed = true;
          }
        } catch {
          setScanError(t("accord.errorScanUpload"));
          scanFailed = true;
        }
      }

      const now = new Date().toISOString();
      const fonctionTrimmed = clientFonction.trim();
      const updatedQuote: QuoteLocal = {
        ...dbQuote,
        status: "accepted",
        clientAccordNom: clientNom.trim(),
        clientAccordDate: new Date(clientDate).toISOString(),
        updatedAt: now,
        ...(fonctionTrimmed !== "" && { clientAccordFonction: fonctionTrimmed }),
        ...(scanUrl !== undefined && { clientAccordScanUrl: scanUrl }),
      };

      await applyLocalMutation(
        "quote",
        quoteId,
        "update",
        updatedQuote as unknown as Record<string, unknown>,
        dbQuote.revision,
        async () => {
          await db.quotes.put(updatedQuote);
        },
        userId
      );

      await db.quoteStatusLogs.put({
        id: crypto.randomUUID(),
        quoteId,
        fromStatus: "sent",
        toStatus: "accepted",
        changedBy: userId,
        changedAt: now,
      });

      void triggerSync();
      // Accord enregistré : toast d'avertissement si le scan a été abandonné,
      // succès sinon — ne pas masquer un upload échoué derrière un toast vert.
      if (scanFailed) {
        toast.warning(t("accord.errorScanUpload"));
      } else {
        toast.success(t("accord.successToast"));
      }
      onClose();
    } catch {
      setError(t("accord.errorGeneric"));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("accord.sheetTitle")}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className="absolute bottom-0 left-0 right-0 max-h-[85dvh] overflow-y-auto rounded-t-[22px] bg-surface p-6 pb-safe">
        <h2 className="mb-5 text-base font-semibold text-text-primary">
          {t("accord.sheetTitle")}
        </h2>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          {/* Nom du client */}
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              {t("accord.nomLabel")} <span className="text-destructive">*</span>
            </label>
            <input
              ref={firstFocusRef}
              type="text"
              value={clientNom}
              onChange={(e) => setClientNom(e.target.value)}
              placeholder={t("accord.nomPlaceholder")}
              required
              disabled={isPending}
              className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-navy focus:outline-none disabled:opacity-60"
            />
          </div>

          {/* Fonction */}
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              {t("accord.fonctionLabel")}
            </label>
            <input
              type="text"
              value={clientFonction}
              onChange={(e) => setClientFonction(e.target.value)}
              placeholder={t("accord.fonctionPlaceholder")}
              disabled={isPending}
              className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-navy focus:outline-none disabled:opacity-60"
            />
          </div>

          {/* Date d'accord */}
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              {t("accord.dateLabel")} <span className="text-destructive">*</span>
            </label>
            <input
              type="date"
              value={clientDate}
              onChange={(e) => setClientDate(e.target.value)}
              max={maxDateStr}
              required
              disabled={isPending}
              className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-text-primary focus:border-brand-navy focus:outline-none disabled:opacity-60"
            />
          </div>

          {/* Scan de signature */}
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              {t("accord.scanLabel")}
            </label>
            <p className="mb-2 text-xs text-text-muted">{t("accord.scanHint")}</p>
            <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-border bg-surface-alt px-4 text-sm font-medium text-text-secondary hover:bg-surface transition-colors">
              {scanFile ? scanFile.name : t("accord.scanButton")}
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => setScanFile(e.target.files?.[0] ?? null)}
                disabled={isPending}
                className="sr-only"
              />
            </label>
            {scanError && (
              <p role="alert" className="mt-1.5 text-xs text-amber-600">
                {scanError}
              </p>
            )}
          </div>

          {/* Erreur globale */}
          {error && (
            <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface-alt disabled:opacity-60"
            >
              {t("accord.cancelButton")}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="h-11 flex-1 rounded-xl bg-green-600 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {isPending ? "…" : t("accord.submitButton")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
