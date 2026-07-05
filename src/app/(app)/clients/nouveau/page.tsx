import { redirect } from "next/navigation";
import { ClientForm } from "@/components/client/client-form";
import { BackLink } from "@/components/nav/back-link";
import { can } from "@/lib/permissions";
import { getSessionWithRole } from "@/lib/session";

export default async function NouveauClientPage() {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");

  const { session, role } = result;

  if (!can(role, "client.create")) redirect("/clients");

  const userId = (session.user as Record<string, unknown>).id as string;

  return (
    <div className="flex flex-col px-5 pt-8 pb-10 lg:mx-auto lg:w-full lg:max-w-2xl lg:p-0">
      <BackLink label="Retour aux clients" href="/clients" />
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Clients
      </p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary lg:text-[27px]">
        Nouveau client
      </h1>
      <div className="mt-6 lg:rounded-2xl lg:border lg:border-border lg:bg-surface lg:p-6">
        <ClientForm userId={userId} />
      </div>
    </div>
  );
}
