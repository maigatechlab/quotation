import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { CompanyForm } from "@/components/settings/company-form";
import { LogoUpload } from "@/components/settings/logo-upload";
import { SignatoryConfig } from "@/components/settings/signatory-config";
import { TemplateManager } from "@/components/settings/template-manager";
import { db as pgDb } from "@/lib/db";
import type { CompanyLocal } from "@/lib/local-db";
import { can } from "@/lib/permissions";
import { company as companyTable } from "@/lib/schema";
import { getSessionWithRole } from "@/lib/session";

export default async function ParametresPage() {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");

  const { session, role } = result;
  const userId = (session.user as Record<string, unknown>).id as string;
  const rawCid = (session.user as Record<string, unknown>).companyId;
  const companyId: string | null =
    typeof rawCid === "string" && rawCid !== "" ? rawCid : null;

  const canEdit = can(role, "company.update");

  // SSR seed: load from DB so Client Component has initial data without flash
  let initialCompany: CompanyLocal | null = null;
  if (companyId) {
    const rows = await pgDb
      .select()
      .from(companyTable)
      .where(eq(companyTable.id, companyId))
      .limit(1);

    if (rows[0]) {
      const row = rows[0];
      initialCompany = {
        id: row.id,
        raisonSociale: row.raisonSociale,
        rccm: row.rccm,
        nif: row.nif,
        phones: (row.phones as string[]) ?? [],
        emails: (row.emails as string[]) ?? [],
        pays: row.pays ?? "NE",
        revision: row.revision,
        updatedAt: row.updatedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        // Optional fields — conditional spread satisfies exactOptionalPropertyTypes
        ...(row.formeJuridique != null ? { formeJuridique: row.formeJuridique } : {}),
        ...(row.capital != null ? { capital: row.capital } : {}),
        ...(row.adresse != null ? { adresse: row.adresse } : {}),
        ...(row.bp != null ? { bp: row.bp } : {}),
        ...(row.logoUrl != null ? { logoUrl: row.logoUrl } : {}),
        ...(row.signataireNom != null ? { signataireNom: row.signataireNom } : {}),
        ...(row.signataireFonction != null ? { signataireFonction: row.signataireFonction } : {}),
        ...(row.conditionsPaiementDefaut != null ? { conditionsPaiementDefaut: row.conditionsPaiementDefaut } : {}),
        ...(row.companyId != null ? { companyId: row.companyId } : {}),
      };
    }
  }

  return (
    <div className="flex flex-col px-5 pt-8 pb-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Paramètres
      </p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
        Paramètres société
      </h1>

      <div className="mt-6">
        <CompanyForm
          company={initialCompany}
          canEdit={canEdit}
          userId={userId}
          companyId={companyId}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <LogoUpload companyId={companyId} canEdit={canEdit} initialCompany={initialCompany} />
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <SignatoryConfig
          companyId={companyId}
          canEdit={canEdit}
          userId={userId}
          initialCompany={initialCompany}
        />
      </div>

      {can(role, "template.create") && (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <TemplateManager userId={userId} />
        </div>
      )}

      {can(role, "user.manage") && (
        <Link
          href="/parametres/utilisateurs"
          className="mt-8 inline-flex items-center rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-alt transition-colors"
        >
          Gestion des utilisateurs
        </Link>
      )}
    </div>
  );
}
