"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFcfa } from "@/lib/money";
import { calculatePeriodFromCycle } from "@/lib/tenants/period";
import { recordPaymentSchema } from "@/lib/validation/payment";

type FieldErrors = Partial<Record<string, string>>;

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface RecordPaymentModalProps {
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecordPaymentModal({
  tenantId,
  tenantName,
  tenantStatus,
  open,
  onOpenChange,
}: RecordPaymentModalProps) {
  const t = useTranslations("owner.payments.record");
  const router = useRouter();

  const [isPending, setIsPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paymentReference, setPaymentReference] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(toDateInputValue(new Date()));
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [periodStart, setPeriodStart] = useState(() => {
    const { periodStart: ps } = calculatePeriodFromCycle({ cycle: "monthly", paidAt: new Date() });
    return toDateInputValue(ps);
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    const { periodEnd: pe } = calculatePeriodFromCycle({ cycle: "monthly", paidAt: new Date() });
    return toDateInputValue(pe);
  });
  const [periodEdited, setPeriodEdited] = useState(false);
  const [notes, setNotes] = useState("");
  const [reactivateIfSuspended, setReactivateIfSuspended] = useState(false);

  const autoPeriod = useMemo(() => {
    if (periodEdited || !paidAt) return null;
    const d = new Date(paidAt);
    if (isNaN(d.getTime())) return null;
    const { periodStart: ps, periodEnd: pe } = calculatePeriodFromCycle({ cycle: billingCycle, paidAt: d });
    return { start: toDateInputValue(ps), end: toDateInputValue(pe) };
  }, [paidAt, billingCycle, periodEdited]);

  const effectivePeriodStart = periodEdited ? periodStart : (autoPeriod?.start ?? "");
  const effectivePeriodEnd = periodEdited ? periodEnd : (autoPeriod?.end ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setGlobalError(null);

    const amountNum = Number(amount);
    const payload = {
      paymentMethod,
      paymentReference: paymentReference.trim() || undefined,
      amount: amountNum,
      paidAt: paidAt ? new Date(paidAt).toISOString() : "",
      periodStart: effectivePeriodStart ? new Date(effectivePeriodStart).toISOString() : "",
      periodEnd: effectivePeriodEnd ? new Date(effectivePeriodEnd).toISOString() : "",
      billingCycle,
      reactivateIfSuspended,
      notes: notes.trim() || undefined,
    };

    const validation = recordPaymentSchema.safeParse(payload);
    if (!validation.success) {
      const fieldErrs: FieldErrors = {};
      for (const issue of validation.error.issues) {
        const path = issue.path.join(".");
        if (path) fieldErrs[path] = issue.message;
      }
      setErrors(fieldErrs);
      return;
    }

    setIsPending(true);
    try {
      const res = await fetch(`/api/v1/owner/tenants/${tenantId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = (await res.json()) as { amount: number };
        toast.success(
          t("success", { amount: formatFcfa(data.amount).replace(/\s?XOF/i, "").trim(), name: tenantName })
        );
        onOpenChange(false);
        router.refresh();
      } else {
        const body = (await res.json()) as {
          error?: { code?: string; message?: string; fields?: Record<string, string> };
        };
        if (body.error?.fields) {
          setErrors(body.error.fields);
        } else if (body.error?.code === "NOT_FOUND") {
          toast.error(t("tenantNotFound"));
          onOpenChange(false);
        } else if (body.error?.code === "CONFLICT") {
          setGlobalError(body.error.message ?? t("cancelledConflict"));
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

  const amountPreview =
    amount && !isNaN(Number(amount)) && Number(amount) > 0
      ? formatFcfa(Number(amount))
      : null;

  const isSuspended = tenantStatus === "suspended";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <p className="text-sm text-text-muted">{t("subtitle", { name: tenantName })}</p>
        </DialogHeader>

        {globalError && (
          <div className="rounded-lg bg-status-annule-bg border border-status-annule-text/20 px-4 py-3 text-sm text-status-annule-text">
            {globalError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          {/* Méthode de paiement */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paymentMethod">{t("paymentMethod")} *</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger id="paymentMethod">
                <SelectValue placeholder="Choisir une méthode" />
              </SelectTrigger>
              <SelectContent>
                {(["nitta", "wave", "amana", "stripe", "cash", "virement"] as const).map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`methods.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.paymentMethod && (
              <p className="text-xs text-status-annule-text">{errors.paymentMethod}</p>
            )}
          </div>

          {/* Référence transaction */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paymentReference">{t("paymentReference")}</Label>
            <Input
              id="paymentReference"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder={t("paymentReferenceHint")}
              maxLength={200}
            />
            {errors.paymentReference && (
              <p className="text-xs text-status-annule-text">{errors.paymentReference}</p>
            )}
          </div>

          {/* Montant */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">{t("amount")} *</Label>
            <Input
              id="amount"
              type="number"
              step="1"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25000"
            />
            {amountPreview && (
              <p className="text-xs text-text-muted">{amountPreview}</p>
            )}
            {errors.amount && (
              <p className="text-xs text-status-annule-text">{errors.amount}</p>
            )}
          </div>

          {/* Date du paiement */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paidAt">{t("paidAt")} *</Label>
            <Input
              id="paidAt"
              type="date"
              value={paidAt}
              max={toDateInputValue(new Date())}
              onChange={(e) => setPaidAt(e.target.value)}
            />
            {errors.paidAt && (
              <p className="text-xs text-status-annule-text">{errors.paidAt}</p>
            )}
          </div>

          {/* Cycle de facturation */}
          <div className="flex flex-col gap-1.5">
            <Label>{t("billingCycle")} *</Label>
            <div className="flex gap-2">
              {(["monthly", "annual"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBillingCycle(c)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    billingCycle === c
                      ? "border-text-primary bg-text-primary text-white"
                      : "border-border bg-surface text-text-secondary hover:bg-surface-alt"
                  }`}
                >
                  {t(c)}
                </button>
              ))}
            </div>
          </div>

          {/* Période couverte */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="periodStart">{t("periodStart")} *</Label>
              <Input
                id="periodStart"
                type="date"
                value={effectivePeriodStart}
                onChange={(e) => {
                  setPeriodStart(e.target.value);
                  setPeriodEnd(effectivePeriodEnd);
                  setPeriodEdited(true);
                }}
              />
              {errors.periodStart && (
                <p className="text-xs text-status-annule-text">{errors.periodStart}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="periodEnd">{t("periodEnd")} *</Label>
              <Input
                id="periodEnd"
                type="date"
                value={effectivePeriodEnd}
                onChange={(e) => {
                  setPeriodEnd(e.target.value);
                  setPeriodStart(effectivePeriodStart);
                  setPeriodEdited(true);
                }}
              />
              {errors.periodEnd && (
                <p className="text-xs text-status-annule-text">{errors.periodEnd}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">{t("notes")}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </div>

          {/* Réactiver si suspendu */}
          {isSuspended && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reactivateIfSuspended}
                  onChange={(e) => setReactivateIfSuspended(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-text-primary"
                />
                <span className="text-sm font-medium text-text-primary">
                  {t("reactivateIfSuspended")}
                </span>
              </label>

              {!reactivateIfSuspended && (
                <div className="rounded-lg border border-status-envoye-text/30 bg-status-envoye-bg px-3 py-2 text-xs text-status-envoye-text">
                  {t("reactivateWarning")}
                </div>
              )}

              {reactivateIfSuspended && (
                <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-700">
                  {t("reactivatedNote")}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {t("cancelled")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("submitting") : t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
