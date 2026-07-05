"use client";

import type { QuoteLocal } from "@/lib/local-db";

/**
 * StatusBadge — affiche le statut d'un devis avec dot coloré + libellé.
 *
 * Respecte UX-DR8 (badge lifecycle) et UX-DR23 (jamais color-only) :
 * le statut est TOUJOURS transmis par le texte, jamais par la seule couleur.
 *
 * Le libellé est volontairement codé en dur (FR) plutôt que via next-intl
 * car ce composant peut être rendu hors d'un NextIntlClientProvider
 * (ex. snapshots de tests). La traduction centralisée est assurée par
 * StatusChangeSheet via la key `devis.status.<status>` quand le contexte
 * d'internationalisation est disponible.
 */
export type QuoteStatus = QuoteLocal["status"];

interface StatusConfig {
  /** Classes Tailwind pour le dot coloré (taille fixe gérée par le rendu). */
  dot: string;
  /** Classes Tailwind pour le fond tinted + couleur de texte. */
  bg: string;
  /** Libellé français affiché à l'écran. */
  label: string;
}

export const STATUS_CONFIG: Record<QuoteStatus, StatusConfig> = {
  draft: {
    dot: "bg-status-brouillon-dot",
    bg: "bg-status-brouillon-bg text-status-brouillon-text",
    label: "Brouillon",
  },
  validated: {
    dot: "bg-status-valide-dot",
    bg: "bg-status-valide-bg text-status-valide-text",
    label: "Validé",
  },
  sent: {
    dot: "bg-status-envoye-dot",
    bg: "bg-status-envoye-bg text-status-envoye-text",
    label: "Envoyé",
  },
  accepted: {
    dot: "bg-status-accepte-dot",
    bg: "bg-status-accepte-bg text-status-accepte-text",
    label: "Accepté",
  },
  expired: {
    dot: "bg-status-expire-dot",
    bg: "bg-status-expire-bg text-status-expire-text",
    label: "Expiré",
  },
  cancelled: {
    dot: "bg-status-annule-dot",
    bg: "bg-status-annule-bg text-status-annule-text",
    label: "Annulé",
  },
};

interface StatusBadgeProps {
  status: QuoteStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-semibold ${config.bg} ${className ?? ""}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
