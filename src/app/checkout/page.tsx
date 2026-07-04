import { getTranslations } from "next-intl/server";
import { CheckoutForm } from "./checkout-form";

interface CheckoutPageProps {
  searchParams?: Promise<{ canceled?: string }>;
}

// PUBLIC page — no session guard. Visitors are not authenticated (AC1).
export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const t = await getTranslations("checkout");
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const canceled = resolvedSearchParams.canceled === "1";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-center font-serif text-2xl font-bold text-text-primary">
          {t("title")}
        </h1>
        {canceled && (
          <p role="status" className="rounded-xl border border-border bg-surface-alt p-3 text-center text-sm text-muted-foreground">
            {t("canceled")}
          </p>
        )}
        <CheckoutForm />
      </div>
    </main>
  );
}
