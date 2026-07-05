"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { duplicateQuoteLocal } from "@/lib/duplicate-quote-local";

interface DuplicateQuoteButtonProps {
  quoteId: string;
  userId: string;
}

export function DuplicateQuoteButton({ quoteId, userId }: DuplicateQuoteButtonProps) {
  const router = useRouter();
  const t = useTranslations("devis");
  const [isPending, setIsPending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleDuplicate() {
    setIsPending(true);
    try {
      const newQuoteId = await duplicateQuoteLocal(quoteId, userId);
      toast.success(t("duplicate.successToast"));
      router.push(`/devis/${newQuoteId}`);
    } catch {
      toast.error(t("duplicate.errorGeneric"));
    } finally {
      setIsPending(false);
      setShowConfirm(false);
    }
  }

  if (!showConfirm) {
    return (
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={isPending}
        className="h-10 rounded-xl border border-border px-4 text-sm font-medium text-text-secondary hover:bg-surface-alt"
      >
        {t("duplicate.button")}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <p className="text-sm font-semibold text-text-primary">{t("duplicate.confirmTitle")}</p>
      <p className="text-xs text-text-muted">{t("duplicate.confirmDescription")}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowConfirm(false)}
          disabled={isPending}
          className="h-9 flex-1 rounded-xl border border-border text-sm text-text-secondary"
        >
          {t("duplicate.cancel")}
        </button>
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={isPending}
          className="h-9 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark disabled:opacity-60"
        >
          {isPending ? "…" : t("duplicate.confirmAction")}
        </button>
      </div>
    </div>
  );
}
