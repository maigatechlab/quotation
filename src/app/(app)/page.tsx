import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const name = session?.user.name ?? session?.user.email ?? "vous";

  return (
    <div className="flex flex-col px-5 pt-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Tableau de bord
      </p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
        Bonjour, {name}
      </h1>
      <p className="mt-6 rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
        Le tableau de bord sera disponible dans les prochaines stories. Utilisez la navigation
        ci-dessous pour accéder aux fonctionnalités.
      </p>
    </div>
  );
}
