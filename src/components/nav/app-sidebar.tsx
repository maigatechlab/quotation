"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, Home, LogOut, Settings, Users } from "lucide-react";
import { SidebarSyncStatus } from "@/components/nav/sidebar-sync-status";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth-client";
import { useCrypto } from "@/lib/crypto/crypto-context";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  commercial: "Commercial",
  operateur: "Opérateur",
  superadmin: "Super admin",
};

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tableau de bord", icon: <Home className="h-4 w-4" aria-hidden="true" />, exact: true },
  { href: "/devis", label: "Devis", icon: <FileText className="h-4 w-4" aria-hidden="true" /> },
  { href: "/clients", label: "Clients", icon: <Users className="h-4 w-4" aria-hidden="true" /> },
  { href: "/parametres", label: "Paramètres", icon: <Settings className="h-4 w-4" aria-hidden="true" /> },
];

interface AppSidebarProps {
  userName: string;
  userEmail: string;
  role: string;
}

export function AppSidebar({ userName, userEmail, role }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { clearCrypto } = useCrypto();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isActive = (href: string, exact = false) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    clearCrypto();
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
          router.refresh();
        },
      },
    });
  };

  return (
    <aside
      className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col border-r border-sidebar-border bg-sidebar"
      aria-label="Navigation principale"
    >
      <div className="flex items-center px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full.svg" alt="Quotation Logistique" width={210} height={137} />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-surface-tint-navy font-semibold text-brand-navy"
                  : "text-text-secondary hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 pb-2.5">
        <SidebarSyncStatus />
      </div>
      <div className="border-t border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-2 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold text-sidebar-foreground">
            {userName.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{userName}</p>
            <p className="truncate text-xs text-text-muted">
              {ROLE_LABELS[role] ?? role}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-label="Se déconnecter"
            title={userEmail}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
