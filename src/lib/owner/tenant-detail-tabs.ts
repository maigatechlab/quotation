// Shared between the server page (src/app/owner/tenants/[id]/page.tsx) and the
// client tabs component. Must stay free of "use client" — importing a value
// from a client module into a server component yields a client-reference
// proxy, not the array (caused error digest 394717263).
export type TenantDetailTab = "infos" | "abonnement" | "utilisateurs" | "journal";

export const VALID_TENANT_DETAIL_TABS: TenantDetailTab[] = [
  "infos",
  "abonnement",
  "utilisateurs",
  "journal",
];
