import { redirect } from "next/navigation";
import { ClientEditForm } from "@/components/client/client-edit-form";
import { BackLink } from "@/components/nav/back-link";
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
    <div className="flex flex-col px-5 pt-8 pb-10 lg:mx-auto lg:w-full lg:max-w-2xl lg:p-0">
      <BackLink label="Retour au client" href={`/clients/${clientId}`} />
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Clients
      </p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary lg:text-[27px]">
        Modifier le client
      </h1>
      <div className="mt-6 lg:rounded-2xl lg:border lg:border-border lg:bg-surface lg:p-6">
        <ClientEditForm clientId={clientId} userId={userId} role={role} />
      </div>
    </div>
  );
}
