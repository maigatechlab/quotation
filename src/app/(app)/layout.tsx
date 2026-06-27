import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BottomNavWrapper } from "@/components/nav/bottom-nav-wrapper";
import { OfflineBanner } from "@/components/offline-banner";
import { SyncIndicator } from "@/components/shared/sync-indicator";
import { auth } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col min-h-dvh">
      <OfflineBanner />
      <main id="main-content" className="flex-1 pb-[74px]">
        {children}
      </main>
      <div className="fixed bottom-[74px] right-2 z-30">
        <SyncIndicator />
      </div>
      <BottomNavWrapper />
    </div>
  );
}
