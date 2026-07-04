"use client";

import { useEffect, useState } from "react";
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
import { formatFcfa } from "@/lib/money";
import { formatDateFr } from "@/lib/owner/format";
import { RecordPaymentTrigger } from "./record-payment-trigger";

interface CoveringPaymentRow {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string;
}

export interface ReactivateDialogProps {
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReactivateDialog({
  tenantId,
  tenantName,
  tenantStatus,
  open,
  onOpenChange,
}: ReactivateDialogProps) {
  const t = useTranslations("owner.tenants.reactivate");
  const tMethods = useTranslations("owner.badges.paymentMethod");
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState<CoveringPaymentRow[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>("");
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let ignore = false;

    async function load() {
      setGlobalError(null);
      setSelectedPaymentId("");
      setNote("");
      setNoteError(null);
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/owner/tenants/${tenantId}/payments/covering`);
        if (!res.ok) {
          if (!ignore) {
            setPayments([]);
            setGlobalError(t("error"));
          }
          return;
        }
        const data = (await res.json()) as { payments?: CoveringPaymentRow[] };
        const rows = data.payments ?? [];
        if (ignore) return;
        setPayments(rows);
        if (rows.length === 1 && rows[0]) {
          setSelectedPaymentId(rows[0].id);
        }
      } catch {
        if (!ignore) setPayments([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void load();

    return () => {
      ignore = true;
    };
  }, [open, tenantId, t]);

  const selectedPayment = payments.find((p) => p.id === selectedPaymentId) ?? null;

  async function handleSubmit() {
    if (!selectedPaymentId) return;
    setIsPending(true);
    setGlobalError(null);
    setNoteError(null);
    try {
      const res = await fetch(`/api/v1/owner/tenants/${tenantId}/reactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coveringPaymentId: selectedPaymentId, note: note || undefined }),
      });
      if (res.ok) {
        toast.success(t("success", { name: tenantName }));
        onOpenChange(false);
        router.refresh();
      } else {
        const body = (await res.json()) as {
          error?: { code?: string; message?: string; fields?: Record<string, string> };
        };
        if (body.error?.fields?.note) {
          setNoteError(body.error.fields.note);
        } else if (body.error?.code === "NO_COVERING_PAYMENT") {
          setGlobalError(body.error.message ?? t("errorNoCoveringPayment"));
        } else if (body.error?.code === "NOT_FOUND") {
          toast.error(t("tenantNotFound"));
          onOpenChange(false);
        } else if (body.error?.code === "CONFLICT") {
          setGlobalError(body.error.message ?? t("errorConflict"));
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

  const hasNoPayments = !loading && payments.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title", { name: tenantName })}</DialogTitle>
          <p className="text-sm text-text-muted">{t("subtitle")}</p>
        </DialogHeader>

        {globalError && (
          <div className="rounded-lg bg-status-annule-bg border border-status-annule-text/20 px-4 py-3 text-sm text-status-annule-text">
            {globalError}
          </div>
        )}

        <div className="flex flex-col gap-4 mt-2">
          {loading && <p className="text-sm text-text-muted">…</p>}

          {hasNoPayments && (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-status-envoye-text/30 bg-status-envoye-bg px-3 py-2 text-sm text-status-envoye-text">
                {tenantStatus === "cancelled"
                  ? t("noCoveringPaymentCancelled")
                  : t("noCoveringPayment")}
              </div>
              {tenantStatus !== "cancelled" && (
                <RecordPaymentTrigger
                  tenant={{ id: tenantId, name: tenantName, status: tenantStatus }}
                  variant="button"
                  defaultReactivateIfSuspended
                  triggerLabel={t("recordPaymentLink")}
                />
              )}
            </div>
          )}

          {!loading && payments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Select value={selectedPaymentId} onValueChange={setSelectedPaymentId}>
                <SelectTrigger id="covering-payment">
                  <SelectValue placeholder={t("selectPayment")} />
                </SelectTrigger>
                <SelectContent>
                  {payments.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {t("paymentLabel", {
                        method: tMethods(p.paymentMethod),
                        amount: formatFcfa(p.amount).replace(/\s?XOF/i, "").trim(),
                        start: formatDateFr(p.periodStart),
                        end: formatDateFr(p.periodEnd),
                        paidAt: formatDateFr(p.paidAt),
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedPayment && (
            <div className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text-secondary">
              {t("summary", {
                start: formatDateFr(selectedPayment.periodStart),
                end: formatDateFr(selectedPayment.periodEnd),
              })}
            </div>
          )}

          {!hasNoPayments && (
            <div className="space-y-1.5">
              <Label htmlFor="reactivate-note">{t("noteLabel")}</Label>
              <Textarea
                id="reactivate-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("noteHint")}
                rows={3}
                maxLength={2000}
              />
              {noteError && <p className="text-xs text-destructive">{noteError}</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t("cancel")}
          </Button>
          {!hasNoPayments && (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !selectedPaymentId}
            >
              {isPending ? t("submitting") : t("confirm")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
