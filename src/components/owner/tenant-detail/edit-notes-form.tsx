"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  tenantId: string;
  initialNotes: string | null;
}

export function EditNotesForm({ tenantId, initialNotes }: Props) {
  const t = useTranslations("owner.tenants.detail.infos");
  const router = useRouter();

  const [notes, setNotes] = useState(initialNotes ?? "");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setIsPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/owner/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        toast.success(t("notesSaved"));
        router.refresh();
      } else {
        const body = (await res.json()) as { error?: { fields?: Record<string, string> } };
        if (body.error?.fields?.notes) {
          setError(body.error.fields.notes);
        } else {
          toast.error(t("notesSaveFailed"));
        }
      }
    } catch {
      toast.error(t("notesSaveFailed"));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t("notesPlaceholder")}
        rows={4}
        maxLength={5000}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button variant="outline" size="sm" onClick={handleSubmit} disabled={isPending}>
        {isPending ? t("notesSaving") : t("notesSave")}
      </Button>
    </div>
  );
}
