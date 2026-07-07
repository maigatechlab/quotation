import { PaymentsFilters } from "@/components/owner/payments-filters";
import { PaymentsTable } from "@/components/owner/payments-table";
import { fetchPaymentsPage, parsePaymentFilters } from "@/lib/owner/payments";

// Prevent stale searchParams with PPR in Next.js 16
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OwnerPaymentsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters = parsePaymentFilters(sp);
  const { rows, totalPages, total, totalAmount } = await fetchPaymentsPage(filters);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          OWNER CONSOLE
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">Paiements</h1>
        <p className="mt-2 text-sm text-text-muted">
          Historique des paiements d&apos;abonnement, tous tenants confondus.
        </p>
      </div>

      <PaymentsFilters current={filters} />
      <PaymentsTable
        rows={rows}
        filters={filters}
        totalPages={totalPages}
        total={total}
        totalAmount={totalAmount}
      />
    </div>
  );
}
