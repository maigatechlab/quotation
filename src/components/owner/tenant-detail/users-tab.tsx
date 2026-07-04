import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { formatDateFr } from "@/lib/owner/format";
import type { TenantUserRow } from "@/lib/owner/tenant-detail";
import type { TenantStatus } from "@/lib/tenants/tenant-config";
import { AddUserDialog } from "./add-user-dialog";
import { RevokeReactivateAction } from "./revoke-reactivate-action";
import { UserQuotaBar, type UserQuota } from "./user-quota-bar";

interface Props {
  tenantId: string;
  tenantStatus: TenantStatus;
  users: TenantUserRow[];
  quota: UserQuota;
}

export async function UsersTab({ tenantId, tenantStatus, users, quota }: Props) {
  const t = await getTranslations("owner.tenants.detail.utilisateurs");
  const roleLabels: Record<string, string> = {
    admin: t("roles.admin"),
    commercial: t("roles.commercial"),
    operateur: t("roles.operateur"),
  };

  const tenantInactive = tenantStatus === "cancelled" || tenantStatus === "suspended";
  const quotaFull = quota.active >= quota.max;
  const addDisabled = tenantInactive || quotaFull;
  const activeAdminCount = users.filter((u) => u.role === "admin" && u.disabledAt === null).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <UserQuotaBar quota={quota} label={t("quota", { active: quota.active, max: quota.max })} />
          {quota.tone === "exceeded" && (
            <Badge className="mt-1 border-transparent bg-status-annule-bg text-status-annule-text">
              {t("quotaExceeded")}
            </Badge>
          )}
          {quota.tone === "full" && (
            <Badge className="mt-1 border-transparent bg-status-annule-bg text-status-annule-text">
              {t("quotaFull")}
            </Badge>
          )}
        </div>
        <AddUserDialog
          tenantId={tenantId}
          disabled={addDisabled}
          disabledReason={tenantInactive ? t("tenantInactive", { status: tenantStatus }) : t("quotaFull")}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">
                {t("columns.name")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">
                {t("columns.email")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">
                {t("columns.role")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">
                {t("columns.lastSeen")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">
                {t("columns.status")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">
                {t("columns.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isDisabled = u.disabledAt !== null;
                const isLastActiveAdmin = u.role === "admin" && !isDisabled && activeAdminCount <= 1;
                const tooltip = tenantInactive
                  ? t("tenantInactive", { status: tenantStatus })
                  : isLastActiveAdmin
                    ? t("revokeDialog.lastAdminTooltip")
                    : undefined;
                return (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-text-primary">{u.name}</td>
                    <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge className="border-transparent bg-surface-alt text-text-secondary">
                        {roleLabels[u.role] ?? u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {u.lastSeen ? formatDateFr(u.lastSeen) : t("lastSeenNever")}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {isDisabled ? t("statusDisabled") : t("statusActive")}
                    </td>
                    <td className="px-4 py-3">
                      <RevokeReactivateAction
                        tenantId={tenantId}
                        user={{ id: u.id, name: u.name, email: u.email, role: u.role }}
                        isDisabled={isDisabled}
                        actionDisabled={tenantInactive || (!isDisabled && isLastActiveAdmin)}
                        quotaFull={isDisabled && quotaFull}
                        {...(tooltip !== undefined ? { disabledTooltip: tooltip } : {})}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
