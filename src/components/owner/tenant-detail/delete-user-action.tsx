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
import { Input } from "@/components/ui/input";

export interface DeleteUserActionProps {
  tenantId?: string;
  user: { id: string; name: string; email: string; role: string };
  actionDisabled: boolean;
  disabledTooltip?: string;
  /** Overrides the default tenant-scoped endpoint (used by the global Utilisateurs page). */
  endpoint?: string;
}

export function DeleteUserAction({
  tenantId,
  user,
  actionDisabled,
  disabledTooltip,
  endpoint,
}: DeleteUserActionProps) {
  const t = useTranslations("owner.tenants.detail.utilisateurs.deleteDialog");
  const tAdd = useTranslations("owner.tenants.detail.utilisateurs.add");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");

  const confirmMatches = confirmEmail.trim().toLowerCase() === user.email.toLowerCase();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setConfirmEmail("");
  }

  async function handleConfirm() {
    setIsPending(true);
    try {
      const res = await fetch(
        endpoint ?? `/api/v1/owner/tenants/${tenantId}/users/${user.id}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        toast.success(t("success", { name: user.name }));
        handleOpenChange(false);
        router.refresh();
        return;
      }

      const body = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;

      if (body?.error?.code === "FORBIDDEN") {
        toast.error(t("lastAdminError"));
      } else if (body?.error?.code === "NOT_FOUND") {
        toast.error(t("notFound"));
      } else if (body?.error?.message) {
        // SELF_DELETE / LAST_SUPERADMIN etc. — server messages are user-facing French.
        toast.error(body.error.message);
      } else {
        toast.error(t("error"));
      }
    } catch {
      toast.error(t("error"));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={actionDisabled}
        title={actionDisabled ? disabledTooltip : undefined}
        onClick={() => setOpen(true)}
      >
        {t("trigger")}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">
              {t("confirm", { name: user.name, email: user.email })}
            </p>
            <p className="text-sm font-medium text-destructive">{t("irreversible")}</p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="delete-confirm-email" className="text-sm text-text-secondary">
                {t("typeEmail", { email: user.email })}
              </label>
              <Input
                id="delete-confirm-email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={user.email}
                autoComplete="off"
                disabled={isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              {tAdd("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirm}
              disabled={isPending || !confirmMatches}
            >
              {isPending ? "…" : t("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
