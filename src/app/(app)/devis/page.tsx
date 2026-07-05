import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { QuoteList } from "@/components/quote/quote-list";
import { getSessionWithRole } from "@/lib/session";

export default async function DevisPage() {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");
  const { session } = result;
  const userId = (session.user as Record<string, unknown>).id as string;

  return (
    <div className="flex flex-col px-5 pt-8 pb-24 lg:p-0 lg:pb-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Devis
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary lg:text-[27px]">
            Mes devis
          </h1>
        </div>
        {/* Desktop primary action — mobile keeps the amber FAB */}
        <Link
          href="/devis/nouveau"
          className="hidden items-center gap-2 rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-text-on-dark transition-colors hover:bg-brand-navy-deep lg:inline-flex"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouveau devis
        </Link>
      </div>
      <div className="mt-6">
        <QuoteList userId={userId} />
      </div>
    </div>
  );
}
