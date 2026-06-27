"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { useLiveCompany } from "@/hooks/use-live-company";
import { useLiveQuote } from "@/hooks/use-live-quote";
import type { Role } from "@/lib/permissions";

interface QuotePreviewProps {
  quoteId: string;
  userId: string;
  role: Role;
}

export function QuotePreview({ quoteId, userId: _userId, role: _role }: QuotePreviewProps) {
  const router = useRouter();
  const t = useTranslations("devis");
  const { quote, lines, clauses } = useLiveQuote(quoteId);
  // useLiveCompany returns CompanyLocal | undefined | null
  // Coalesce undefined → null so PdfTemplate always receives CompanyLocal | null
  const company = useLiveCompany() ?? null;
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Share state (Story 4.4)
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareGuidance, setShareGuidance] = useState<string | null>(null);
  // Détection capacité share — uniquement côté client (SSR-safe via useEffect)
  const [shareSupported, setShareSupported] = useState(false);

  useEffect(() => {
    // canShareFiles() utilise des APIs browser — doit être dans useEffect (SSR-safe)
    import("@/lib/pdf-share").then(({ canShareFiles: check }) => {
      setShareSupported(check());
    });
  }, []);

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
    if (!quote) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const snapshot = quote.clientSnapshot as Record<string, unknown> | null;
      const clientName = (snapshot?.companyName as string | undefined) ?? "Client";
      const filename = `Devis-${quote.number}-${clientName}.pdf`;
      const { generateQuotePdf } = await import("@/components/pdf/pdf-generator");
      await generateQuotePdf("pdf-template-container", filename);
    } catch {
      setGenError(t("pdf.errorGeneric"));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleShare() {
    if (!quote) return;
    setIsSharing(true);
    setShareError(null);
    setShareGuidance(null);
    try {
      const snapshot = quote.clientSnapshot as Record<string, unknown> | null;
      const clientName = (snapshot?.companyName as string) ?? "Client";
      const filename = `Devis-${quote.number}-${clientName}.pdf`;
      const title = `Devis ${quote.number}`;

      const { generatePdfBlob, downloadPdfBlob, sharePdfBlob, isMobilePlatform } =
        await import("@/lib/pdf-share");

      const blob = await generatePdfBlob("pdf-template-container");

      if (shareSupported) {
        try {
          await sharePdfBlob(blob, filename, title);
          // Succès — la feuille de partage s'est ouverte
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            // Annulé par l'utilisateur — comportement normal, aucun message
            return;
          }
          // Erreur réelle → fallback download + message
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
    } catch {
      setShareError(t("pdf.share.errorGeneric"));
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-app-bg pb-24">
      {/* Aperçu visible — centré, ombre Overlay (DESIGN.md §Elevation, AC1/AC3) */}
      <div className="mx-auto w-full max-w-[840px] px-4 py-6">
        <div
          className="overflow-hidden rounded-[4px]"
          style={{ boxShadow: "0 8px 30px -10px rgba(40,30,15,.4)" }}
        >
          {/* PdfTemplate — MÊME composant que pour la capture (source unique de vérité, AC3) */}
          <PdfTemplate quote={quote} lines={lines} company={company} clauses={clauses} />
        </div>
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
          zIndex: -1,
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
            disabled={isGenerating || isSharing}
            className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
          >
            {isGenerating ? t("pdf.generating") : t("pdf.generate")}
          </button>
          {/* Bouton Partager — accent amber (Story 4.4) */}
          <button
            type="button"
            onClick={handleShare}
            disabled={isGenerating || isSharing}
            className="h-11 flex-1 rounded-xl border border-brand-amber bg-amber-50 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
          >
            {isSharing ? t("pdf.share.sharing") : t("pdf.share.label")}
          </button>
        </div>
      </div>
    </div>
  );
}
