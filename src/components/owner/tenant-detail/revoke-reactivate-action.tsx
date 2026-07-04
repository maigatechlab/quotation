"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface RevokeReactivateActionProps {
  tenantId: string;
  user: { id: string; name: string; email: string; role: string };
  isDisabled: boolean;
  actionDisabled: boolean;
  disabledTooltip?: string;
  /** True when reactivating this user would exceed the tenant's quota. */
  quotaFull: boolean;
}

export function RevokeReactivateAction({
  tenantId,
  user,
  isDisabled,
  actionDisabled,
  disabledTooltip,
  quotaFull,
}: RevokeReactivateActionProps) {
  const t = useTranslations("owner.tenants.detail.utilisateurs");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const mode: "revoke" | "reactivate" = isDisabled ? "reactivate" : "revoke";
  const buttonDisabled = actionDisabled || (mode === "reactivate" && quotaFull);
  const tooltip =
    mode === "reactivate" && quotaFull && !disabledTooltip ? t("reactivate.quotaFull") : disabledTooltip;

  async function handleConfirm() {
    setIsPending(true);
    try {
      const endpoint =
        mode === "revoke"
          ? `/api/v1/owner/tenants/${tenantId}/users/${user.id}/revoke`
          : `/api/v1/owner/tenants/${tenantId}/users/${user.id}/reactivate`;
      const res = await fetch(endpoint, { method: "POST" });

      if (res.ok) {
        toast.success(
          mode === "revoke"
            ? t("revokeDialog.success", { name: user.name })
            : t("reactivate.success", { name: user.name })
        );
        setOpen(false);
        router.refresh();
        return;
      }

      const body = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;

      if (body?.error?.code === "FORBIDDEN") {
        toast.error(t("revokeDialog.lastAdminError"));
      } else if (body?.error?.code === "NOT_FOUND") {
        toast.error(t("revokeDialog.notFound"));
      } else if (body?.error?.code === "QUOTA_EXCEEDED") {
        toast.error(t("reactivate.quotaFull"));
      } else {
        toast.error(t("add.error"));
      }
    } catch {
      toast.error(t("add.error"));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={buttonDisabled}
        title={buttonDisabled ? tooltip : undefined}
        onClick={() => setOpen(true)}
      >
        {mode === "revoke" ? t("revoke") : t("reactivate.trigger")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === "revoke" ? t("revokeDialog.title") : t("reactivate.title")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">
            {mode === "revoke"
              ? t("revokeDialog.confirm", { name: user.name, email: user.email })
              : t("reactivate.confirm", { name: user.name })}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {t("add.cancel")}
            </Button>
            <Button
              type="button"
              variant={mode === "revoke" ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={isPending}
            >
              {isPending ? "…" : mode === "revoke" ? t("revokeDialog.submit") : t("reactivate.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
