import { getTranslations } from "next-intl/server";
import { getPlatformSettings } from "@/lib/data/platform-settings";
import { requireOwnerAuth } from "@/lib/session";
import { PlatformSettingsForm } from "./_components/platform-settings-form";

export const dynamic = "force-dynamic";

export default async function OwnerSettingsPage() {
  await requireOwnerAuth();
  const t = await getTranslations("owner.settings");
  const settings = await getPlatformSettings();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("eyebrow")}
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">{t("title")}</h1>
      </div>
      <PlatformSettingsForm defaults={settings} />
    </div>
  );
}
