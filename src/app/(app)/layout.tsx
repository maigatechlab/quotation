import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/nav/app-sidebar";
import { BottomNavWrapper } from "@/components/nav/bottom-nav-wrapper";
import { OfflineBanner } from "@/components/offline-banner";
import { QuotaBanner } from "@/components/shared/quota-banner";
import { SyncIndicator } from "@/components/shared/sync-indicator";
import { auth } from "@/lib/auth";
import type { Role } from "@/lib/permissions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const user = session.user as Record<string, unknown>;
  const role = (user.role as Role) ?? "commercial";

  return (
    <div className="flex min-h-dvh">
      <AppSidebar
        userName={(user.name as string) || "Utilisateur"}
        userEmail={(user.email as string) || ""}
        role={role}
      />
      <div className="flex flex-1 flex-col lg:pl-64">
        <OfflineBanner />
        <QuotaBanner />
        <main id="main-content" className="flex-1 pb-[74px] lg:pb-0">
          <div className="lg:mx-auto lg:w-full lg:max-w-7xl lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
        <div className="fixed bottom-[74px] right-2 z-30 lg:hidden">
          <SyncIndicator />
        </div>
        <div className="lg:hidden">
          <BottomNavWrapper />
        </div>
      </div>
    </div>
  );
}
