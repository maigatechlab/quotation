import { getTranslations } from "next-intl/server";
import { getPlatformSettings } from "@/lib/data/platform-settings";
import { buildOwnerContact } from "@/lib/tenants/tenant-contact";
import { ExpiredLogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

interface SubscriptionExpiredPageProps {
  searchParams?: Promise<{ date?: string }>;
}

function formatEffectiveDate(value: string | undefined): string {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  // Fixed to UTC so the rendered date doesn't depend on the server's timezone.
  return safeDate.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function SubscriptionExpiredPage({
  searchParams,
}: SubscriptionExpiredPageProps) {
  const t = await getTranslations("subscriptionExpired");
  const contact = await buildOwnerContact();
  const settings = await getPlatformSettings();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const effectiveDate = formatEffectiveDate(resolvedSearchParams.date);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="max-w-md w-full space-y-4">
        <h1 className="font-serif text-2xl font-bold text-text-primary">{t("title")}</h1>
        <p className="text-muted-foreground">{settings.expiryMessage || t("message")}</p>
        <p className="text-sm font-medium text-text-primary">
          {t("effectiveDate", { date: effectiveDate })}
        </p>
        <p className="text-sm text-muted-foreground">{t("dataPreserved")}</p>

        <div className="rounded-xl border border-border p-4 space-y-2 text-sm text-left">
          <p className="font-semibold">{t("contactTitle")}</p>
          {contact.whatsapp && (
            <a
              href={`https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`}
              className="block underline text-text-primary hover:text-text-secondary"
            >
              {t("whatsapp")} : {contact.displayWhatsapp}
            </a>
          )}
          {!contact.whatsapp && (
            <p>{contact.displayWhatsapp}</p>
          )}
          <a
            href={`mailto:${contact.displayEmail}`}
            className="block underline text-text-primary hover:text-text-secondary"
          >
            {t("email")} : {contact.displayEmail}
          </a>
        </div>

        <ExpiredLogoutButton label={t("logout")} />
      </div>
    </main>
  );
}