"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  FileDown,
  PenLine,
  Share2,
  SquareCheckBig,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { ClientAgreementSheet } from "@/components/quote/client-agreement-sheet";
import { DuplicateQuoteButton } from "@/components/quote/duplicate-quote-button";
import { StatusBadge, STATUS_CONFIG } from "@/components/quote/status-badge";
import { StatusChangeSheet } from "@/components/quote/status-change-sheet";
import { useLiveCompany } from "@/hooks/use-live-company";
import { useLiveQuote } from "@/hooks/use-live-quote";
import { duplicateQuoteLocal } from "@/lib/duplicate-quote-local";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/permissions";
import { isTerminalStatus } from "@/lib/quote-status";
import { resolveActorLabel, type UsersById } from "@/lib/quote-status-actor";

interface QuotePreviewProps {
  quoteId: string;
  userId: string;
  userName: string;
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
export function QuotePreview({ quoteId, userId, userName, role }: QuotePreviewProps) {
  const router = useRouter();
  const t = useTranslations("devis");
  const { quote, lines, clauses, statusLogs } = useLiveQuote(quoteId);

  // Résolution des acteurs legacy (Story 8.8 — AC1/AC2) : uniquement un filet de
  // sécurité pour les entrées d'historique écrites avant le snapshot `changedByName`.
  // `null` tant que non chargé (permission absente, hors-ligne, requête échouée) —
  // distinct d'une Map vide (chargée avec succès mais utilisateur introuvable).
  const [usersById, setUsersById] = useState<UsersById | null>(null);

  useEffect(() => {
    if (!can(role, "user.read")) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/users");
        if (!res.ok) return;
        const users = (await res.json()) as Array<{ id: string; name: string; email: string }>;
        if (cancelled) return;
        setUsersById(new Map(users.map((u) => [u.id, { name: u.name, email: u.email }])));
      } catch {
        // best-effort — reste "non chargé" (Utilisateur inconnu), jamais bloquant.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  const actorLabels = {
    deleted: t("detail.historyByDeleted"),
    unknown: t("detail.historyByUnknown"),
  };
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

  // Duplication depuis le rail desktop
  const [isDuplicating, setIsDuplicating] = useState(false);

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

  // Dupliquer depuis le rail desktop — même logique que DuplicateQuoteButton
  // (mobile), sans l'UI de confirmation inline qui casserait la grille du rail.
  async function handleDuplicate() {
    if (isDuplicating) return;
    setIsDuplicating(true);
    try {
      const newQuoteId = await duplicateQuoteLocal(quoteId, userId);
      toast.success(t("duplicate.successToast"));
      router.push(`/devis/${newQuoteId}`);
    } catch {
      toast.error(t("duplicate.errorGeneric"));
    } finally {
      setIsDuplicating(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-app-bg pb-24 lg:min-h-0 lg:pb-8">
      {/* En-tête détail devis (Story 3.9) — numéro + statut badge (UX-DR8) */}
      <div className="mx-auto w-full max-w-[840px] px-4 pt-6 lg:max-w-none lg:px-0 lg:pt-0">
        <button
          type="button"
          onClick={() => router.push("/devis")}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-text-muted transition-colors hover:text-brand-navy lg:text-[13px]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t("detail.back")}
        </button>
        <div className="mb-1 flex items-end justify-between gap-3 lg:mb-6">
          <div>
            <p className="hidden text-xs font-semibold uppercase tracking-wider text-text-muted lg:block">
              Devis
            </p>
            <h1 className="font-serif text-xl font-semibold text-text-primary lg:mt-1 lg:text-[27px]">
              {t("detail.heading")} {quote.number}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {can(role, "quote.duplicate") && (
              <div className="lg:hidden">
                <DuplicateQuoteButton quoteId={quoteId} userId={userId} />
              </div>
            )}
            <StatusBadge status={quote.status} />
          </div>
        </div>
      </div>

      {/* Deux colonnes à lg+ : document (~2/3) + rail (~1/3). Mobile : colonne unique. */}
      <div className="mx-auto w-full max-w-[840px] px-4 py-6 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_336px] lg:items-start lg:gap-6 lg:px-0 lg:py-0">
        <div>
          {/* Aperçu visible — document metaphor (DESIGN.md §Elevation, AC1/AC3) */}
          <div
            className="overflow-hidden rounded-[4px] lg:rounded-2xl lg:border lg:border-border"
            style={{ boxShadow: "0 8px 30px -10px rgba(40,30,15,.4)" }}
          >
            {/* PdfTemplate — MÊME composant que pour la capture (source unique de vérité, AC3) */}
            <PdfTemplate quote={quote} lines={lines} company={company} clauses={clauses} />
          </div>

          {/* Section Historique mobile — timeline des transitions (AC6) */}
          <section className="mt-6 rounded-xl border border-border bg-surface p-4 lg:hidden">
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
                      {(() => {
                        const actor = resolveActorLabel(log, usersById, actorLabels);
                        return (
                          actor && (
                            <>
                              {" "}
                              {t("detail.historyBy", { user: actor })}
                            </>
                          )
                        );
                      })()}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* ===== Rail droit desktop ===== */}
        <aside className="hidden lg:flex lg:flex-col lg:gap-4">
          {/* Statut */}
          <div className="rounded-2xl border border-border bg-surface px-5 py-[18px]">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Statut
            </p>
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={quote.status} />
              {canChangeStatus(quote.ownerId) && !isTerminalStatus(quote.status) && (
                <button
                  type="button"
                  onClick={() => setIsStatusSheetOpen(true)}
                  disabled={isGenerating || isSharing}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-text-primary transition-colors hover:bg-surface-alt disabled:opacity-60"
                >
                  {t("status.changeStatus")}
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface px-5 py-[18px]">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Actions
            </p>
            {genError && (
              <p role="alert" className="text-xs text-destructive">
                {genError}
              </p>
            )}
            {shareError && (
              <p role="alert" className="text-xs text-destructive">
                {shareError}
              </p>
            )}
            {shareGuidance && (
              <p className="rounded-lg bg-status-envoye-bg px-3 py-2 text-xs text-status-envoye-text">
                {shareGuidance}
              </p>
            )}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isCompanyLoading || isGenerating || isSharing}
              className="flex items-center justify-center gap-2 rounded-lg bg-brand-navy px-4 py-2.5 text-[13.5px] font-semibold text-text-on-dark transition-colors hover:bg-brand-navy-deep disabled:opacity-60"
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
              {isGenerating ? t("pdf.generating") : t("pdf.generate")}
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={isCompanyLoading || isGenerating || isSharing}
              className="flex items-center justify-center gap-2 rounded-lg border border-brand-amber bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-amber-deep transition-colors hover:bg-status-envoye-bg disabled:opacity-60"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              {isSharing ? t("pdf.share.sharing") : t("pdf.share.label")}
            </button>
            {quote.status === "sent" && (
              <button
                type="button"
                onClick={() => setIsAgreementSheetOpen(true)}
                disabled={isGenerating || isSharing}
                className="flex items-center justify-center gap-2 rounded-lg bg-status-accepte-dot px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
              >
                <SquareCheckBig className="h-4 w-4" aria-hidden="true" />
                {t("accord.openSheet")}
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-text-primary transition-colors hover:bg-surface-alt"
              >
                <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
                {t("apercu.modifier")}
              </button>
              {can(role, "quote.duplicate") && (
                <button
                  type="button"
                  onClick={handleDuplicate}
                  disabled={isDuplicating}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-text-primary transition-colors hover:bg-surface-alt disabled:opacity-60"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {isDuplicating ? "…" : t("duplicate.button")}
                </button>
              )}
            </div>
          </div>

          {/* Historique — timeline */}
          <div className="rounded-2xl border border-border bg-surface px-5 py-[18px]">
            <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {t("detail.history")}
            </p>
            {statusLogs.length === 0 ? (
              <p className="text-xs text-text-muted">{t("detail.historyEmpty")}</p>
            ) : (
              <ol>
                {statusLogs.map((log, idx) => (
                  <li
                    key={log.id}
                    className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-2.5"
                  >
                    <div className="flex flex-col items-center">
                      <span
                        className={`mt-1 h-[9px] w-[9px] shrink-0 rounded-full ${STATUS_CONFIG[log.toStatus].dot}`}
                        aria-hidden="true"
                      />
                      {idx < statusLogs.length - 1 && (
                        <span
                          className="my-1 w-px flex-1 bg-border"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className={idx < statusLogs.length - 1 ? "pb-4" : ""}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13.5px] font-semibold text-text-primary">
                          {STATUS_CONFIG[log.toStatus].label}
                        </span>
                        <span className="whitespace-nowrap text-xs text-text-muted">
                          {new Date(log.changedAt).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <span className="text-[12.5px] text-text-muted">
                        {t("detail.historyEntry", {
                          from: log.fromStatus
                            ? STATUS_CONFIG[log.fromStatus].label
                            : "—",
                          to: STATUS_CONFIG[log.toStatus].label,
                        })}
                        {(() => {
                          const actor = resolveActorLabel(log, usersById, actorLabels);
                          return actor && <> {t("detail.historyBy", { user: actor })}</>;
                        })()}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
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

      {/* Barre d'action sticky en bas (AC2) — mobile uniquement, le rail droit
          porte les actions à lg+ (fix bug baseline : la barre chevauchait la sidebar) */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-surface/92 px-4 py-3 backdrop-blur-sm lg:hidden">
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
        userName={userName}
        isOpen={isStatusSheetOpen}
        onClose={() => setIsStatusSheetOpen(false)}
      />
    </div>
  );
}
