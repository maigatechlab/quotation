"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type FieldErrors = Partial<Record<string, string>>;

export interface SuspendDialogControlledProps {
  tenantId: string;
  tenantName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Controlled variant — the caller owns open state and renders no trigger.
 * Required by the tenants-list actions menu: a dialog mounted inside
 * DropdownMenuContent unmounts when the menu closes, so it must live outside
 * the menu and be driven from the menu item.
 */
export function SuspendDialogControlled({
  tenantId,
  tenantName,
  open,
  onOpenChange,
}: SuspendDialogControlledProps) {
  const t = useTranslations("owner.tenants.suspend");
  const router = useRouter();

  const [isPending, setIsPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [totalBlock, setTotalBlock] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setReason("");
      setNote("");
      setTotalBlock(false);
      setErrors({});
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!reason) {
      setErrors({ reason: t("reasonRequired") });
      return;
    }
    setIsPending(true);
    setErrors({});
    try {
      const res = await fetch(`/api/v1/owner/tenants/${tenantId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note: note || undefined, totalBlock }),
      });
      if (res.ok) {
        toast.success(t("success", { name: tenantName }));
        handleOpenChange(false);
        router.refresh();
      } else {
        const body = (await res.json()) as { error?: { code?: string; fields?: FieldErrors } };
        if (body.error?.fields) {
          setErrors(body.error.fields);
        } else if (body.error?.code === "CONFLICT") {
          toast.error(t("errorConflict"));
        } else {
          toast.error(t("error"));
        }
      }
    } catch {
      toast.error(t("error"));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title", { name: tenantName })}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="suspend-reason">{t("reasonLabel")}</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="suspend-reason" className={errors.reason ? "border-destructive" : ""}>
                  <SelectValue placeholder={t("reasonPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="non-paiement">{t("reasonNonPaiement")}</SelectItem>
                  <SelectItem value="fraude">{t("reasonFraude")}</SelectItem>
                  <SelectItem value="demande-client">{t("reasonDemandeClient")}</SelectItem>
                  <SelectItem value="autre">{t("reasonAutre")}</SelectItem>
                </SelectContent>
              </Select>
              {errors.reason && (
                <p className="text-xs text-destructive">{errors.reason}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="suspend-note">{t("note")}</Label>
              <Textarea
                id="suspend-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("noteHint")}
                rows={3}
                maxLength={2000}
              />
              {errors.note && (
                <p className="text-xs text-destructive">{errors.note}</p>
              )}
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="suspend-total-block"
                checked={totalBlock}
                onChange={(e) => setTotalBlock(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <div>
                <Label htmlFor="suspend-total-block" className="cursor-pointer font-medium">
                  {t("totalBlock")}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t("totalBlockHint")}</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending ? "…" : t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}

export interface SuspendDialogProps {
  tenantId: string;
  tenantName: string;
  disabled?: boolean;
}

/** Button-triggered variant used on the tenant detail page (Infos tab). */
export function SuspendDialog({ tenantId, tenantName, disabled }: SuspendDialogProps) {
  const t = useTranslations("owner.tenants.suspend");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        {t("trigger")}
      </Button>
      <SuspendDialogControlled
        tenantId={tenantId}
        tenantName={tenantName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
