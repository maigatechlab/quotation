import Link from "next/link";
import { asc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { DeleteUserAction } from "@/components/owner/tenant-detail/delete-user-action";
import { db } from "@/lib/db";
import { requireOwnerAuth } from "@/lib/session";
import { user as userTable, tenants } from "@/lib/schema";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  commercial: "Commercial",
  operateur: "Opérateur",
  superadmin: "Owner",
};

export default async function UsersPage() {
  const session = await requireOwnerAuth();
  const currentUserId = session.user.id;

  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      tenantName: tenants.name,
      createdAt: userTable.createdAt,
      disabledAt: userTable.disabledAt,
    })
    .from(userTable)
    .leftJoin(tenants, eq(userTable.tenantId, tenants.id))
    .orderBy(asc(userTable.createdAt));

  const activeSuperadminCount = rows.filter(
    (u) => u.role === "superadmin" && u.disabledAt === null
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            OWNER CONSOLE
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
            Utilisateurs
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">{rows.length} compte(s)</p>
        </div>
        <Link
          href="/owner/users/new"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-4 text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep transition-colors"
        >
          + Nouveau compte owner
        </Link>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Nom</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Email</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Rôle</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Tenant</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Statut</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Créé le</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-border hover:bg-surface-alt/50">
                <td className="px-4 py-3 font-medium text-text-primary">{u.name}</td>
                <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                    u.role === "superadmin"
                      ? "bg-brand-navy/10 text-brand-navy"
                      : "bg-surface-alt text-text-muted"
                  }`}>
                    {ROLE_LABELS[u.role ?? "commercial"] ?? u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">{u.tenantName ?? "—"}</td>
                <td className="px-4 py-3">
                  {u.disabledAt ? (
                    <span className="inline-flex rounded-full bg-status-expire-bg px-2 py-0.5 text-xs font-semibold text-status-expire-text">
                      Désactivé
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                      Actif
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-muted text-xs">
                  {u.createdAt.toLocaleDateString("fr-FR")}
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const isSelf = u.id === currentUserId;
                    const isLastSuperadmin =
                      u.role === "superadmin" && !u.disabledAt && activeSuperadminCount <= 1;
                    const disabledReason = isSelf
                      ? "Vous ne pouvez pas supprimer votre propre compte"
                      : isLastSuperadmin
                        ? "Dernier compte superadmin — ne peut pas être supprimé"
                        : undefined;
                    return (
                      <DeleteUserAction
                        user={{ id: u.id, name: u.name, email: u.email, role: u.role ?? "commercial" }}
                        endpoint={`/api/v1/owner/users/${u.id}`}
                        actionDisabled={isSelf || isLastSuperadmin}
                        {...(disabledReason !== undefined ? { disabledTooltip: disabledReason } : {})}
                      />
                    );
                  })()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
                  Aucun utilisateur.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
