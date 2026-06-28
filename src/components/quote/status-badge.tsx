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
  draft: { dot: "bg-gray-400", bg: "bg-gray-100 text-gray-600", label: "Brouillon" },
  validated: { dot: "bg-blue-500", bg: "bg-blue-50 text-blue-700", label: "Validé" },
  sent: { dot: "bg-amber-500", bg: "bg-amber-50 text-amber-700", label: "Envoyé" },
  accepted: { dot: "bg-green-500", bg: "bg-green-50 text-green-700", label: "Accepté" },
  expired: { dot: "bg-red-400", bg: "bg-red-50 text-red-500", label: "Expiré" },
  cancelled: { dot: "bg-red-500", bg: "bg-red-50 text-red-600", label: "Annulé" },
};

interface StatusBadgeProps {
  status: QuoteStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.bg} ${className ?? ""}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
