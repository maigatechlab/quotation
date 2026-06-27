import { headers } from "next/headers";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { RecentQuotesList } from "@/components/dashboard/recent-quotes-list";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const name = session?.user.name ?? session?.user.email ?? "vous";

  return (
    <div className="flex flex-col gap-6 px-5 pt-8 pb-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Tableau de bord
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
          Bonjour, {name}
        </h1>
      </div>
      {/* Hero — vue synthétique activité (Story 5.1) */}
      <DashboardHero />
      {/* Liste des devis récents (Story 5.2) */}
      <RecentQuotesList />
      {/* Métriques montants — Story 5.3 (placeholder supprimé une fois 5.3 implémenté) */}
    </div>
  );
}
