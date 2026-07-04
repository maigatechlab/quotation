"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type TenantDetailTab = "infos" | "abonnement" | "utilisateurs" | "journal";

export const VALID_TENANT_DETAIL_TABS: TenantDetailTab[] = [
  "infos",
  "abonnement",
  "utilisateurs",
  "journal",
];

interface Props {
  initialTab: TenantDetailTab;
  infosContent: ReactNode;
  abonnementContent: ReactNode;
  utilisateursContent: ReactNode;
  journalContent: ReactNode;
}

export function TenantDetailTabs({
  initialTab,
  infosContent,
  abonnementContent,
  utilisateursContent,
  journalContent,
}: Props) {
  const t = useTranslations("owner.tenants.detail.tabs");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const currentTab: TenantDetailTab = VALID_TENANT_DETAIL_TABS.includes(
    tabParam as TenantDetailTab
  )
    ? (tabParam as TenantDetailTab)
    : initialTab;

  function onTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Tabs value={currentTab} onValueChange={onTabChange}>
      <TabsList>
        <TabsTrigger value="infos">{t("infos")}</TabsTrigger>
        <TabsTrigger value="abonnement">{t("abonnement")}</TabsTrigger>
        <TabsTrigger value="utilisateurs">{t("utilisateurs")}</TabsTrigger>
        <TabsTrigger value="journal">{t("journal")}</TabsTrigger>
      </TabsList>
      <TabsContent value="infos">{infosContent}</TabsContent>
      <TabsContent value="abonnement">{abonnementContent}</TabsContent>
      <TabsContent value="utilisateurs">{utilisateursContent}</TabsContent>
      <TabsContent value="journal">{journalContent}</TabsContent>
    </Tabs>
  );
}
