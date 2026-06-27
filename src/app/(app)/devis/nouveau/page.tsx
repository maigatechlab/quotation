import { redirect } from "next/navigation";
import { QuoteWizard } from "@/components/quote/quote-wizard";
import { can } from "@/lib/permissions";
import { getSessionWithRole } from "@/lib/session";

export default async function NouveauDevisPage() {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");

  const { session, role } = result;

  if (!can(role, "quote.create")) redirect("/devis");

  const userId = (session.user as Record<string, unknown>).id as string;

  return (
    <div className="flex flex-col pb-10">
      <QuoteWizard userId={userId} />
    </div>
  );
}
