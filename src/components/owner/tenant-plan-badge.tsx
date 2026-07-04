import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PLAN_STYLES: Record<string, string> = {
  free: "bg-surface-alt text-text-secondary",
  pro: "bg-status-valide-bg text-status-valide-text",
  enterprise: "bg-brand-navy text-white",
};

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise",
};

export function TenantPlanBadge({ plan }: { plan: string }) {
  return (
    <Badge className={cn("border-transparent", PLAN_STYLES[plan] ?? "")}>
      {PLAN_LABELS[plan] ?? plan}
    </Badge>
  );
}
