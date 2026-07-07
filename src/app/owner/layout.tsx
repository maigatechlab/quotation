import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { OwnerLogoutButton } from "@/components/owner/owner-logout-button";
import { requireOwnerAuth } from "@/lib/session";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerAuth();
  const t = await getTranslations("owner.layout");

  return (
    <div className="min-h-screen bg-app-bg">
      <header className="bg-brand-navy text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark-light.svg" alt="Quotation Logistique" width={44} height={44} />
            <span className="font-serif text-lg font-semibold tracking-tight">Owner Console</span>
          </div>

          <nav className="flex gap-1">
            <Link
              href="/owner"
              className="rounded-xl px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 transition-colors"
            >
              {t("dashboard")}
            </Link>
            <Link
              href="/owner/tenants"
              className="rounded-xl px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 transition-colors"
            >
              {t("tenants")}
            </Link>
            <Link
              href="/owner/users"
              className="rounded-xl px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 transition-colors"
            >
              Utilisateurs
            </Link>
            <Link
              href="/owner/reports"
              className="rounded-xl px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 transition-colors"
            >
              {t("reports")}
            </Link>
            <Link
              href="/owner/settings"
              className="rounded-xl px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 transition-colors"
            >
              {t("settings")}
            </Link>
            <Link
              href="/owner/payments"
              className="rounded-xl px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 transition-colors"
            >
              {t("payments")}
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10 transition-colors"
            >
              {t("backToApp")}
            </Link>
            <OwnerLogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
