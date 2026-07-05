import { headers } from "next/headers";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { RecentQuotesList } from "@/components/dashboard/recent-quotes-list";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const name = session?.user.name ?? session?.user.email ?? "vous";

  return (
    <div className="flex flex-col gap-6 px-5 pt-8 pb-6 lg:gap-7 lg:p-0">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Tableau de bord
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary lg:text-[27px]">
            Bonjour, {name}
          </h1>
        </div>
        {/* Action primaire desktop — mobile passe par le FAB de la liste devis */}
        <Link
          href="/devis/nouveau"
          className="hidden items-center gap-2 rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-text-on-dark transition-colors hover:bg-brand-navy-deep lg:inline-flex"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouveau devis
        </Link>
      </div>
      {/* Hero — vue synthétique activité (Story 5.1) */}
      <DashboardHero />
      {/* Liste des devis récents (Story 5.2) */}
      <RecentQuotesList />
      {/* Métriques montants — Story 5.3 (placeholder supprimé une fois 5.3 implémenté) */}
    </div>
  );
}
