import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TabsSkeleton } from "@/components/owner/tabs-skeleton";
import { InfosTab } from "@/components/owner/tenant-detail/infos-tab";
import { JournalTab, JOURNAL_EVENT_TYPES } from "@/components/owner/tenant-detail/journal-tab";
import { SubscriptionTab } from "@/components/owner/tenant-detail/subscription-tab";
import { UsersTab } from "@/components/owner/tenant-detail/users-tab";
import {
  TenantDetailTabs,
  VALID_TENANT_DETAIL_TABS,
  type TenantDetailTab,
} from "@/components/owner/tenant-detail-tabs";
import { TenantPlanBadge } from "@/components/owner/tenant-plan-badge";
import { TenantStatusBadge } from "@/components/owner/tenant-status-badge";
import {
  computeUserQuota,
  countActiveUsers,
  getTenantById,
  getTenantEvents,
  getTenantPayments,
  getTenantUsers,
} from "@/lib/owner/tenant-detail";
import { requireOwnerAuth } from "@/lib/session";
import { isValidUuid } from "@/lib/validation/uuid";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TenantDetailPage({ params, searchParams }: PageProps) {
  await requireOwnerAuth();
  const { id } = await params;
  const sp = await searchParams;

  if (!isValidUuid(id)) notFound();

  const tenant = await getTenantById(id);
  if (!tenant) notFound();

  const t = await getTranslations("owner.tenants.detail");

  const tabParam = typeof sp["tab"] === "string" ? sp["tab"] : "infos";
  const initialTab: TenantDetailTab = VALID_TENANT_DETAIL_TABS.includes(
    tabParam as TenantDetailTab
  )
    ? (tabParam as TenantDetailTab)
    : "infos";
  const eventParam = typeof sp["event"] === "string" ? sp["event"] : undefined;
  const eventType =
    eventParam && JOURNAL_EVENT_TYPES.includes(eventParam) ? eventParam : undefined;

  const [payments, users, events] = await Promise.all([
    getTenantPayments(id),
    getTenantUsers(id),
    getTenantEvents(id, eventType),
  ]);
  const quota = computeUserQuota({ maxUsers: tenant.maxUsers }, countActiveUsers(users));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/owner/tenants"
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
        >
          <ChevronLeft className="size-3" /> {t("backToTenants")}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="font-serif text-2xl font-semibold text-text-primary">{tenant.name}</h1>
          <TenantPlanBadge plan={tenant.plan} />
          <TenantStatusBadge status={tenant.status} />
        </div>
        <p className="text-xs text-text-muted">{tenant.slug}.quotation.com</p>
      </div>

      <Suspense fallback={<TabsSkeleton />}>
        <TenantDetailTabs
          initialTab={initialTab}
          infosContent={<InfosTab tenant={tenant} />}
          abonnementContent={<SubscriptionTab tenant={tenant} payments={payments} />}
          utilisateursContent={
            <UsersTab
              tenantId={tenant.id}
              tenantStatus={tenant.status}
              users={users}
              quota={quota}
            />
          }
          journalContent={<JournalTab events={events} eventTypeFilter={eventType} />}
        />
      </Suspense>
    </div>
  );
}
