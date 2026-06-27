import { redirect } from "next/navigation";
import { ClientList } from "@/components/client/client-list";
import { can } from "@/lib/permissions";
import { getSessionWithRole } from "@/lib/session";

export default async function ClientsPage() {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");

  const { session, role } = result;
  const canCreate = can(role, "client.create");
  const canEdit = can(role, "client.update");
  const canDelete = can(role, "client.delete");

  const userId = (session.user as Record<string, unknown>).id as string;

  return (
    <div className="flex flex-col px-5 pt-8 pb-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Clients</p>
      <ClientList
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        userId={userId}
      />
    </div>
  );
}
