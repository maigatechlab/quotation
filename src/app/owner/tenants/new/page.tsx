import { getTranslations } from "next-intl/server";
import { requireOwnerAuth } from "@/lib/session";
import { NewTenantForm } from "./new-tenant-form";

export const dynamic = "force-dynamic";

export default async function NewTenantPage() {
  // Redirects to "/" if not authenticated or not superadmin.
  await requireOwnerAuth();
  const t = await getTranslations("owner.tenants.new");

  return (
    <div className="flex max-w-2xl flex-col">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("eyebrow")}
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
          {t("title")}
        </h1>
      </div>
      <div className="mt-6">
        <NewTenantForm />
      </div>
    </div>
  );
}
