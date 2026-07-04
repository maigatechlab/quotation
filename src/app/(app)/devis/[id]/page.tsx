import { redirect } from "next/navigation";
import { QuotePreview } from "@/components/pdf/quote-preview";
import { can } from "@/lib/permissions";
import { getSessionWithRole } from "@/lib/session";

export default async function QuotePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");
  const { session, role } = result;
  if (!can(role, "quote.read")) redirect("/devis");
  const userId = (session.user as Record<string, unknown>).id as string;
  const { id } = await params;

  return <QuotePreview quoteId={id} userId={userId} role={role} />;
}
