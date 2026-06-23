import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { getSessionWithRole } from "@/lib/session";

export default async function ParametresPage() {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");

  const { role } = result;

  return (
    <div className="flex flex-col px-5 pt-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Paramètres</p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
        Mon compte
      </h1>
      <p className="mt-6 rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
        Les paramètres seront disponibles prochainement.
      </p>
      {can(role, "user.manage") && (
        <Link
          href="/parametres/utilisateurs"
          className="mt-4 inline-flex items-center rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-alt transition-colors"
        >
          Gestion des utilisateurs
        </Link>
      )}
    </div>
  );
}
