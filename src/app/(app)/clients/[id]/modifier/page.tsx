import { redirect } from "next/navigation";
import { ClientEditForm } from "@/components/client/client-edit-form";
import { can } from "@/lib/permissions";
import { getSessionWithRole } from "@/lib/session";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ModifierClientPage({ params }: Props) {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");

  const { session, role } = result;

  if (!can(role, "client.update")) redirect("/clients");

  const { id: clientId } = await params;
  const userId = (session.user as Record<string, unknown>).id as string;

  return (
    <div className="flex flex-col px-5 pt-8 pb-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Clients
      </p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
        Modifier le client
      </h1>
      <div className="mt-6">
        <ClientEditForm clientId={clientId} userId={userId} role={role} />
      </div>
    </div>
  );
}
