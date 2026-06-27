import { redirect } from "next/navigation";
import { RouteTemplateManager } from "@/components/settings/route-template-manager";
import { can } from "@/lib/permissions";
import { getSessionWithRole } from "@/lib/session";

export default async function ModelesPage() {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");

  const { session, role } = result;
  const userId = (session.user as Record<string, unknown>).id as string;
  const canManage = can(role, "route-template.create");
  const canRead = can(role, "route-template.read");

  return (
    <div className="flex flex-col gap-6 px-5 pt-8 pb-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Paramètres
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
          Modèles de routes
        </h1>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-5">
        <RouteTemplateManager canManage={canManage} canRead={canRead} userId={userId} />
      </div>
    </div>
  );
}
