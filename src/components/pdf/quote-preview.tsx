"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { ClientAgreementSheet } from "@/components/quote/client-agreement-sheet";
import { DuplicateQuoteButton } from "@/components/quote/duplicate-quote-button";
import { StatusBadge, STATUS_CONFIG } from "@/components/quote/status-badge";
import { StatusChangeSheet } from "@/components/quote/status-change-sheet";
import { useLiveCompany } from "@/hooks/use-live-company";
import { useLiveQuote } from "@/hooks/use-live-quote";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/permissions";
import { isTerminalStatus } from "@/lib/quote-status";

interface QuotePreviewProps {
  quoteId: string;
  userId: string;
  role: Role;
}

function sanitizePdfFilenamePart(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return (sanitized || "document").slice(0, 120);
}

function buildQuotePdfFilename(quoteNumber: string, clientName: string): string {
  const safeQuoteNumber = sanitizePdfFilenamePart(quoteNumber).slice(0, 48);
  const safeClientName = sanitizePdfFilenamePart(clientName).slice(0, 80);

  return `Devis-${safeQuoteNumber}-${safeClientName}.pdf`;
}
export function QuotePreview({ quoteId, userId, role }: QuotePreviewProps) {
  const router = useRouter();
  const t = useTranslations("devis");
  const { quote, lines, clauses, statusLogs } = useLiveQuote(quoteId);
  // useLiveCompany returns CompanyLocal | undefined | null.
  // Keep undefined distinct so PDF actions wait for the company lookup to settle.
  const companyResult = useLiveCompany();
  const isCompanyLoading = companyResult === undefined;
  const company = companyResult ?? null;
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Share state (Story 4.4)
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareGuidance, setShareGuidance] = useState<string | null>(null);

  // Agreement sheet state (Story 4.5)
  const [isAgreementSheetOpen, setIsAgreementSheetOpen] = useState(false);

  // Status change sheet state (Story 3.9 — FR-15)
  const [isStatusSheetOpen, setIsStatusSheetOpen] = useState(false);
  const statusButtonRef = useRef<HTMLButtonElement>(null);

  // Loading state — quote undefined = still fetching from Dexie
  if (quote === undefined) {
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8"
        role="status"
        aria-live="polite"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-navy border-t-transparent" />
        <p className="text-sm text-text-muted">{t("apercu.loading")}</p>
      </div>
    );
  }

  // Not found
  if (quote === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-5">
        <p className="text-sm text-text-secondary">{t("apercu.notFound")}</p>
        <button
          type="button"
          onClick={() => router.push("/devis")}
          className="h-11 rounded-xl border border-border px-6 text-sm font-medium text-text-secondary hover:bg-surface-alt"
        >
          {t("apercu.backToList")}
        </button>
      </div>
    );
  }

  async function handleGenerate() {
    if (!quote || isCompanyLoading || isGenerating || isSharing) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const snapshot = quote.clientSnapshot as Record<string, unknown> | null;
      const clientName = (snapshot?.companyName as string | undefined) ?? "Client";
      const filename = buildQuotePdfFilename(quote.number, clientName);
      const { generateQuotePdf } = await import("@/components/pdf/pdf-generator");
      await generateQuotePdf("pdf-template-container", filename);
    } catch (err) {
      console.error("[QuotePreview] PDF generation failed:", err);
      setGenError(t("pdf.errorGeneric"));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleShare() {
    if (!quote || isCompanyLoading || isSharing || isGenerating) return;
    setIsSharing(true);
    setShareError(null);
    setShareGuidance(null);
    try {
      const snapshot = quote.clientSnapshot as Record<string, unknown> | null;
      const clientName = (snapshot?.companyName as string) ?? "Client";
      const filename = buildQuotePdfFilename(quote.number, clientName);
      const title = `Devis ${quote.number}`;

      const { generatePdfBlob, downloadPdfBlob, sharePdfBlob, isMobilePlatform, canShareFiles } =
        await import("@/lib/pdf-share");

      const blob = await generatePdfBlob("pdf-template-container");

      if (canShareFiles()) {
        try {
          await sharePdfBlob(blob, filename, title);
          // Succès — la feuille de partage s'est ouverte
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            // Annulé par l'utilisateur — comportement normal, aucun message
            return;
          }
          // Erreur réelle → fallback download + message
          console.error("[QuotePreview] Web Share failed:", err);
          downloadPdfBlob(blob, filename);
          setShareError(t("pdf.share.errorFallback"));
        }
      } else {
        // Fallback guidé — téléchargement + message d'orientation
        downloadPdfBlob(blob, filename);
        const mobile = isMobilePlatform();
        setShareGuidance(
          mobile ? t("pdf.share.guidanceMobile") : t("pdf.share.guidanceDesktop")
        );
      }
    } catch (err) {
      console.error("[QuotePreview] PDF share failed:", err);
      setShareError(t("pdf.share.errorGeneric"));
    } finally {
      setIsSharing(false);
    }
  }

  // Permission quote.change-status (Story 3.9) :
  // admin → toujours ; commercial → own (ownerId === userId) ; opérateur → jamais.
  function canChangeStatus(ownerId?: string): boolean {
    if (role === "admin") return true;
    if (role === "commercial") return ownerId === userId;
    return false;
  }

  return (
    <div className="flex min-h-screen flex-col bg-app-bg pb-24">
      {/* En-tête détail devis (Story 3.9) — numéro + statut badge (UX-DR8) */}
      <div className="mx-auto w-full max-w-[840px] px-4 pt-6">
        <button
          type="button"
          onClick={() => router.push("/devis")}
          className="mb-3 text-xs font-medium text-text-muted hover:text-text-secondary"
        >
          ← {t("detail.back")}
        </button>
        <div className="mb-1 flex items-center justify-between gap-3">
          <h1 className="font-serif text-xl font-semibold text-text-primary">
            {t("detail.heading")} {quote.number}
          </h1>
          <div className="flex items-center gap-2">
            {can(role, "quote.duplicate") && (
              <DuplicateQuoteButton quoteId={quoteId} userId={userId} />
            )}
            <StatusBadge status={quote.status} />
          </div>
        </div>
      </div>

      {/* Aperçu visible — centré, ombre Overlay (DESIGN.md §Elevation, AC1/AC3) */}
      <div className="mx-auto w-full max-w-[840px] px-4 py-6">
        <div
          className="overflow-hidden rounded-[4px]"
          style={{ boxShadow: "0 8px 30px -10px rgba(40,30,15,.4)" }}
        >
          {/* PdfTemplate — MÊME composant que pour la capture (source unique de vérité, AC3) */}
          <PdfTemplate quote={quote} lines={lines} company={company} clauses={clauses} />
        </div>

        {/* Section Historique — timeline des transitions (AC6) */}
        <section className="mt-6 rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">
            {t("detail.history")}
          </h2>
          {statusLogs.length === 0 ? (
            <p className="text-xs text-text-muted">{t("detail.historyEmpty")}</p>
          ) : (
            <ol className="space-y-2">
              {statusLogs.map((log) => (
                <li key={log.id} className="flex items-start gap-2 text-xs text-text-secondary">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-navy"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="font-medium text-text-primary">
                      {new Date(log.changedAt).toLocaleString("fr-FR")}
                    </span>
                    {" — "}
                    {t("detail.historyEntry", {
                      from: log.fromStatus ? STATUS_CONFIG[log.fromStatus].label : "—",
                      to: STATUS_CONFIG[log.toStatus].label,
                    })}
                    {log.changedBy && (
                      <>
                        {" "}
                        {t("detail.historyBy", { user: log.changedBy })}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Conteneur hors-écran pour html2canvas — OBLIGATOIRE (AC3) */}
      {/* Doit rester dans le DOM (jamais conditionnel) quand quote != null */}
      <div
        id="pdf-template-container"
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          width: "794px", // A4 portrait @96dpi — obligatoire
        }}
      >
        <PdfTemplate quote={quote} lines={lines} company={company} clauses={clauses} />
      </div>

      {/* Barre d'action sticky en bas (AC2) */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-surface/92 px-4 py-3 backdrop-blur-sm">
        {/* Erreurs inline (AC4) — genError affiche le statut de génération */}
        {genError && (
          <p role="alert" className="mb-2 text-center text-xs text-destructive">
            {genError}
          </p>
        )}
        {shareError && (
          <p role="alert" className="mb-2 text-center text-xs text-destructive">
            {shareError}
          </p>
        )}
        {shareGuidance && (
          <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-700">
            {shareGuidance}
          </p>
        )}
        <div className="flex gap-2">
          {/* Bouton Modifier — secondaire (AC2) */}
          <button
            type="button"
            onClick={() => router.back()}
            className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface-alt"
          >
            {t("apercu.modifier")}
          </button>
          {/* Bouton Générer PDF — primaire navy (AC2) */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isCompanyLoading || isGenerating || isSharing}
            className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
          >
            {isGenerating ? t("pdf.generating") : t("pdf.generate")}
          </button>
          {/* Bouton Partager — accent amber (Story 4.4) */}
          <button
            type="button"
            onClick={handleShare}
            disabled={isCompanyLoading || isGenerating || isSharing}
            className="h-11 flex-1 rounded-xl border border-brand-amber bg-amber-50 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
          >
            {isSharing ? t("pdf.share.sharing") : t("pdf.share.label")}
          </button>
          {/* Bouton Enregistrer l'accord — vert, uniquement si statut "Envoyé" (AC6) */}
          {quote.status === "sent" && (
            <button
              type="button"
              onClick={() => setIsAgreementSheetOpen(true)}
              disabled={isGenerating || isSharing}
              className="h-11 flex-1 rounded-xl bg-green-600 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {t("accord.openSheet")}
            </button>
          )}
          {/* Bouton Changer le statut — Story 3.9 (FR-15).
              Masqué si l'utilisateur n'a pas la permission quote.change-status
              (admin: toujours ; commercial: own ; opérateur: jamais) ou si le
              statut est terminal (aucune transition disponible — AC1). */}
          {canChangeStatus(quote.ownerId) && !isTerminalStatus(quote.status) && (
            <button
              ref={statusButtonRef}
              type="button"
              onClick={() => setIsStatusSheetOpen(true)}
              disabled={isGenerating || isSharing}
              className="h-11 flex-1 rounded-xl border border-border bg-surface-alt text-sm font-semibold text-text-primary hover:bg-surface disabled:opacity-60"
            >
              {t("status.changeStatus")}
            </button>
          )}
        </div>
      </div>

      {/* Bottom sheet accord client (Story 4.5) */}
      <ClientAgreementSheet
        quoteId={quoteId}
        quote={quote}
        userId={userId}
        isOpen={isAgreementSheetOpen}
        onClose={() => setIsAgreementSheetOpen(false)}
      />

      {/* Bottom sheet changement de statut (Story 3.9 — FR-15) */}
      <StatusChangeSheet
        quoteId={quoteId}
        currentStatus={quote.status}
        userId={userId}
        isOpen={isStatusSheetOpen}
        onClose={() => setIsStatusSheetOpen(false)}
      />
    </div>
  );
}
