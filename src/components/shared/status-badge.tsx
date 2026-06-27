import { cn } from "@/lib/utils";

export type QuoteStatus =
  | "draft"
  | "validated"
  | "sent"
  | "accepted"
  | "expired"
  | "cancelled";

interface StatusConfig {
  dot: string;
  bg: string;
  text: string;
  label: string;
}

const STATUS_CONFIG: Record<QuoteStatus, StatusConfig> = {
  draft: {
    dot: "bg-[var(--status-brouillon-dot)]",
    bg: "bg-[var(--status-brouillon-bg)]",
    text: "text-[var(--status-brouillon-text)]",
    label: "Brouillon",
  },
  validated: {
    dot: "bg-[var(--status-valide-dot)]",
    bg: "bg-[var(--status-valide-bg)]",
    text: "text-[var(--status-valide-text)]",
    label: "Validé",
  },
  sent: {
    dot: "bg-[var(--status-envoye-dot)]",
    bg: "bg-[var(--status-envoye-bg)]",
    text: "text-[var(--status-envoye-text)]",
    label: "Envoyé",
  },
  accepted: {
    dot: "bg-[var(--status-accepte-dot)]",
    bg: "bg-[var(--status-accepte-bg)]",
    text: "text-[var(--status-accepte-text)]",
    label: "Accepté",
  },
  expired: {
    dot: "bg-[var(--status-expire-dot)]",
    bg: "bg-[var(--status-expire-bg)]",
    text: "text-[var(--status-expire-text)]",
    label: "Expiré",
  },
  cancelled: {
    dot: "bg-[var(--status-annule-dot)]",
    bg: "bg-[var(--status-annule-bg)]",
    text: "text-[var(--status-annule-text)]",
    label: "Annulé",
  },
};

interface StatusBadgeProps {
  status: QuoteStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        config.bg,
        config.text,
        className
      )}
      aria-label={config.label}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", config.dot)}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
