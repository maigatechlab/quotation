import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-status-accepte-bg text-status-accepte-text",
  trial: "bg-status-valide-bg text-status-valide-text",
  suspended: "bg-status-envoye-bg text-status-envoye-text",
  cancelled: "bg-status-annule-bg text-status-annule-text",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  trial: "Trial",
  suspended: "Suspendu",
  cancelled: "Annulé",
};

export function TenantStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn("border-transparent", STATUS_STYLES[status] ?? "")}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
