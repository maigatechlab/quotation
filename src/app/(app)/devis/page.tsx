import { redirect } from "next/navigation";
import { QuoteList } from "@/components/quote/quote-list";
import { getSessionWithRole } from "@/lib/session";

export default async function DevisPage() {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");
  const { session } = result;
  const userId = (session.user as Record<string, unknown>).id as string;

  return (
    <div className="flex flex-col px-5 pt-8 pb-24">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Devis</p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">Mes devis</h1>
      <div className="mt-6">
        <QuoteList userId={userId} />
      </div>
    </div>
  );
}
