"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatFcfa } from "@/lib/money";
import { xofToEur } from "@/lib/stripe/pricing";
import { PLAN_PRICES_XOF } from "@/lib/tenants/tenant-config";
import { cn } from "@/lib/utils";
import { createCheckoutSessionSchema } from "@/lib/validation/checkout";

type Plan = "pro" | "enterprise";
type Cycle = "monthly" | "annual";

const PLANS: { value: Plan; labelKey: "pro" | "enterprise" }[] = [
  { value: "pro", labelKey: "pro" },
  { value: "enterprise", labelKey: "enterprise" },
];

const CYCLES: { value: Cycle; labelKey: "monthly" | "annual" }[] = [
  { value: "monthly", labelKey: "monthly" },
  { value: "annual", labelKey: "annual" },
];

export function CheckoutForm() {
  const t = useTranslations("checkout");
  const [plan, setPlan] = useState<Plan>("pro");
  const [billingCycle, setBillingCycle] = useState<Cycle>("monthly");
  const [adminEmail, setAdminEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState("");
  const [isPending, setIsPending] = useState(false);

  const amountXof = PLAN_PRICES_XOF[plan][billingCycle];
  const amountEur = xofToEur(amountXof);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGlobalError("");
    setFieldErrors({});

    const parsed = createCheckoutSessionSchema.safeParse({
      plan,
      billingCycle,
      adminEmail,
      companyName,
      adminName,
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (path) errors[path] = issue.message;
      }
      setFieldErrors(errors);
      setGlobalError(t("errors.validation"));
      return;
    }

    setIsPending(true);
    try {
      const res = await fetch("/api/v1/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        setGlobalError(t("errors.stripe"));
        setIsPending(false);
        return;
      }

      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setGlobalError(t("errors.stripe"));
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-label={t("title")}>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-text-muted">{t("plan.label")}</Label>
        <div
          className="flex gap-1 rounded-xl border border-input bg-surface-alt p-1"
          role="group"
          aria-label={t("plan.label")}
        >
          {PLANS.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              aria-pressed={plan === value}
              onClick={() => setPlan(value)}
              disabled={isPending}
              className={cn(
                "min-h-[44px] flex-1 rounded-[8px] px-2 py-2 text-sm font-semibold transition-colors",
                plan === value
                  ? "bg-brand-navy text-text-on-dark"
                  : "text-text-secondary hover:bg-surface"
              )}
            >
              {t(`plan.${labelKey}`)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("plan.freeHint")}</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-text-muted">{t("cycle.label")}</Label>
        <div
          className="flex gap-1 rounded-xl border border-input bg-surface-alt p-1"
          role="group"
          aria-label={t("cycle.label")}
        >
          {CYCLES.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              aria-pressed={billingCycle === value}
              onClick={() => setBillingCycle(value)}
              disabled={isPending}
              className={cn(
                "min-h-[44px] flex-1 rounded-[8px] px-2 py-2 text-sm font-semibold transition-colors",
                billingCycle === value
                  ? "bg-brand-navy text-text-on-dark"
                  : "text-text-secondary hover:bg-surface"
              )}
            >
              {t(`cycle.${labelKey}`)}
              {value === "annual" && (
                <span className="ml-1 text-xs font-normal opacity-80">
                  ({t("cycle.annualBadge")})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border p-3 text-center">
        <p className="text-lg font-semibold text-text-primary">
          {billingCycle === "monthly"
            ? t("price.xofPerMonth", { amount: formatFcfa(amountXof) })
            : t("price.xofPerYear", { amount: formatFcfa(amountXof) })}
        </p>
        <p className="text-sm text-muted-foreground">{t("price.eurApprox", { amount: amountEur })}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="companyName" className="text-xs font-semibold text-text-muted">
          {t("fields.companyName")}
        </Label>
        <Input
          id="companyName"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
          disabled={isPending}
          className="rounded-xl border-input bg-surface focus:border-ring"
        />
        {fieldErrors.companyName && (
          <p className="text-sm text-destructive">{fieldErrors.companyName}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="adminName" className="text-xs font-semibold text-text-muted">
          {t("fields.adminName")}
        </Label>
        <Input
          id="adminName"
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          required
          disabled={isPending}
          className="rounded-xl border-input bg-surface focus:border-ring"
        />
        {fieldErrors.adminName && <p className="text-sm text-destructive">{fieldErrors.adminName}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="adminEmail" className="text-xs font-semibold text-text-muted">
          {t("fields.adminEmail")}
        </Label>
        <Input
          id="adminEmail"
          type="email"
          autoComplete="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          required
          disabled={isPending}
          className="rounded-xl border-input bg-surface focus:border-ring"
        />
        {fieldErrors.adminEmail && (
          <p className="text-sm text-destructive">{fieldErrors.adminEmail}</p>
        )}
      </div>

      {globalError && (
        <p role="alert" className="text-sm text-destructive">
          {globalError}
        </p>
      )}

      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep"
      >
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
