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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CancelDialogProps {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  disabled?: boolean;
}

export function CancelDialog({ tenantId, tenantName, tenantSlug, disabled }: CancelDialogProps) {
  const t = useTranslations("owner.tenants.cancel");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  const slugMatch = confirmSlug === tenantSlug;

  function handleOpenChange(next: boolean) {
    if (!next) {
      setConfirmSlug("");
      setError(null);
    }
    setOpen(next);
  }

  async function handleSubmit() {
    if (!slugMatch) return;
    setIsPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/owner/tenants/${tenantId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmSlug }),
      });
      if (res.ok) {
        toast.success(t("success", { name: tenantName }));
        setOpen(false);
        router.refresh();
      } else {
        const body = (await res.json()) as {
          error?: { code?: string; fields?: Record<string, string>; message?: string };
        };
        if (body.error?.code === "VALIDATION_FAILED" && body.error.fields?.confirmSlug) {
          setError(body.error.fields.confirmSlug);
        } else if (body.error?.code === "CONFLICT") {
          toast.error(t("errorConflict"));
          setOpen(false);
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
    <>
      <Button
        variant="destructive"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {t("trigger")}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title", { name: tenantName })}</DialogTitle>
            <DialogDescription className="text-destructive font-medium">
              {t("warning")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="cancel-slug-confirm">
              {t("confirmSlugLabel")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("confirmSlugHint", { slug: tenantSlug })}
            </p>
            <Input
              id="cancel-slug-confirm"
              value={confirmSlug}
              onChange={(e) => {
                setConfirmSlug(e.target.value);
                setError(null);
              }}
              placeholder={tenantSlug}
              className={error ? "border-destructive" : ""}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
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
              disabled={!slugMatch || isPending}
            >
              {isPending ? "…" : t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
