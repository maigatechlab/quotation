import Link from "next/link";
import { getTranslations } from "next-intl/server";

// PUBLIC page — purely informational. The tenant is provisioned asynchronously
// by the Stripe webhook, never here (AC5).
export default async function CheckoutSuccessPage() {
  const t = await getTranslations("checkout.success");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="w-full max-w-md space-y-4">
        <h1 className="font-serif text-2xl font-bold text-text-primary">{t("title")}</h1>
        <p className="text-muted-foreground">{t("body")}</p>
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center text-sm font-semibold text-brand-navy underline-offset-4 hover:underline"
        >
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
