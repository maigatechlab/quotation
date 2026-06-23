import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/nav/bottom-nav";
import { OfflineBanner } from "@/components/offline-banner";
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
      <BottomNav />
    </div>
  );
}
