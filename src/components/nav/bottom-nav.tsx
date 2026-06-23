"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText, Plus, Users, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const HIDE_NAV_EXACT = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/devis/nouveau",
  "/clients/nouveau",
];

export function shouldHideNav(pathname: string): boolean {
  if (HIDE_NAV_EXACT.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  // Masquer sur /devis/[id] (prÃ©visualisation) mais pas sur /devis (liste)
  if (/^\/devis\/.+$/.test(pathname)) {
    return true;
  }
  return false;
}

interface NavItem {
  href: string;
  labelKey: string;
  ariaLabel: string;
  icon: React.ReactNode;
  exact?: boolean;
}

export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  if (shouldHideNav(pathname)) return null;

  const isActive = (href: string, exact = false) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const navItems: NavItem[] = [
    {
      href: "/",
      labelKey: "home",
      ariaLabel: t("home"),
      icon: <Home className="h-5 w-5" aria-hidden="true" />,
      exact: true,
    },
    {
      href: "/devis",
      labelKey: "quotes",
      ariaLabel: t("quotes"),
      icon: <FileText className="h-5 w-5" aria-hidden="true" />,
    },
  ];

  const accountItem: NavItem = {
    href: "/parametres",
    labelKey: "account",
    ariaLabel: t("account"),
    icon: <Settings className="h-5 w-5" aria-hidden="true" />,
  };

  const clientsItem: NavItem = {
    href: "/clients",
    labelKey: "clients",
    ariaLabel: t("clients"),
    icon: <Users className="h-5 w-5" aria-hidden="true" />,
  };

  return (
    <nav
      aria-label={t("main")}
      className="fixed bottom-0 inset-x-0 z-40 h-[74px] bg-surface border-t border-border flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom,0px)]"
    >
      {/* Accueil */}
      <NavButton item={navItems[0]!} active={isActive("/", true)} />

      {/* Devis */}
      <NavButton item={navItems[1]!} active={isActive("/devis")} />

      {/* FAB â€” Nouveau devis */}
      <div className="relative flex items-center justify-center">
        <Link
          href="/devis/nouveau"
          aria-label={t("newQuote")}
          className={cn(
            "flex h-[54px] w-[54px] -translate-y-4 items-center justify-center",
            "rounded-[18px] bg-brand-amber shadow-raised-fab",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "animate-float",
            "transition-transform active:scale-95",
          )}
        >
          <Plus className="h-6 w-6 text-brand-navy" aria-hidden="true" />
        </Link>
      </div>

      {/* Clients */}
      <NavButton item={clientsItem} active={isActive("/clients")} />

      {/* Compte */}
      <NavButton item={accountItem} active={isActive("/parametres")} />
    </nav>
  );
}

function NavButton({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-label={item.ariaLabel}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-1",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "transition-colors",
        active ? "text-brand-navy" : "text-text-muted hover:text-text-secondary",
      )}
    >
      {item.icon}
      <span className={cn("text-[10px] font-medium leading-none", active && "font-semibold")}>
        {item.ariaLabel}
      </span>
    </Link>
  );
}
