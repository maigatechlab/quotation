import { getTranslations } from "next-intl/server";
import { CancelDialog } from "@/app/owner/tenants/[id]/cancel-dialog";
import { SuspendDialog } from "@/app/owner/tenants/[id]/suspend-dialog";
import { ReactivateTrigger } from "@/components/owner/reactivate-trigger";
import { TenantPlanBadge } from "@/components/owner/tenant-plan-badge";
import { TenantStatusBadge } from "@/components/owner/tenant-status-badge";
import { formatDateFr, formatDaysRemaining } from "@/lib/owner/format";
import type { tenants } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { EditNotesForm } from "./edit-notes-form";
import { EditPlanForm } from "./edit-plan-form";

interface Props {
  tenant: typeof tenants.$inferSelect;
}

export async function InfosTab({ tenant }: Props) {
  const t = await getTranslations("owner.tenants.detail.infos");

  const isActive = tenant.status === "active" || tenant.status === "trial";
  const isCancelled = tenant.status === "cancelled";
  const daysRemaining = formatDaysRemaining(tenant.subscriptionEnd);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("identityTitle")}
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-text-muted">{t("name")}</dt>
            <dd className="font-medium text-text-primary">{tenant.name}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("slug")}</dt>
            <dd className="font-medium text-text-primary">{tenant.slug}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("createdAt")}</dt>
            <dd className="font-medium text-text-primary">{formatDateFr(tenant.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("plan")}</dt>
            <dd className="mt-0.5">
              <TenantPlanBadge plan={tenant.plan} />
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("status")}</dt>
            <dd className="mt-0.5">
              <TenantStatusBadge status={tenant.status} />
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("subscriptionTitle")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span>
            {tenant.subscriptionStart ? formatDateFr(tenant.subscriptionStart) : "—"} →{" "}
            {tenant.subscriptionEnd ? formatDateFr(tenant.subscriptionEnd) : "—"}
          </span>
          {daysRemaining.label && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                daysRemaining.tone === "ok"
                  ? "text-text-muted"
                  : daysRemaining.tone === "warn"
                    ? "bg-status-envoye-bg text-status-envoye-text"
                    : "bg-status-annule-bg text-status-annule-text"
              )}
            >
              {daysRemaining.label}
            </span>
          )}
          {tenant.gracePeriodEndsAt && (
            <span className="rounded-full bg-status-envoye-bg px-2 py-0.5 text-xs font-semibold text-status-envoye-text">
              {t("inGrace", { date: formatDateFr(tenant.gracePeriodEndsAt) })}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("planTitle")}
        </p>
        <div className="mt-2">
          <EditPlanForm tenantId={tenant.id} currentPlan={tenant.plan} />
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("notesTitle")}
        </p>
        <p className="mt-1 text-xs text-text-muted">{t("notesHint")}</p>
        <div className="mt-2">
          <EditNotesForm tenantId={tenant.id} initialNotes={tenant.notes} />
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("actionsTitle")}
        </p>
        <div className="flex flex-wrap gap-2">
          <SuspendDialog tenantId={tenant.id} tenantName={tenant.name} disabled={!isActive} />
          <CancelDialog
            tenantId={tenant.id}
            tenantName={tenant.name}
            tenantSlug={tenant.slug}
            disabled={isCancelled}
          />
          <ReactivateTrigger tenant={{ id: tenant.id, name: tenant.name, status: tenant.status }} />
        </div>
      </div>
    </div>
  );
}
