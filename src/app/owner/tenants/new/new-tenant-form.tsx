"use client";

import { useState } from "react";
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
import { generateSlug } from "@/lib/tenants/slug";
import { createTenantSchema } from "@/lib/validation/tenant";

type FieldErrors = Partial<Record<string, string>>;

export function NewTenantForm() {
  const t = useTranslations("owner.tenants.new");
  const router = useRouter();

  const [isPending, setIsPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [plan, setPlan] = useState<"free" | "pro" | "enterprise">("free");
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [passwordMode, setPasswordMode] = useState<"auto" | "manual">("auto");
  const [manualPassword, setManualPassword] = useState("");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [notes, setNotes] = useState("");

  // Auto-generate the slug from the company name until the user edits the slug.
  function handleCompanyNameChange(value: string) {
    setCompanyName(value);
    if (!slugEdited) {
      setSlug(value.trim() ? generateSlug(value) : "");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setGlobalError(null);
    setCreatedPassword(null);

    const payload = {
      companyName: companyName.trim(),
      slug: slug.trim(),
      plan,
      cycle,
      adminName: adminName.trim(),
      adminEmail: adminEmail.trim(),
      passwordMode,
      manualPassword: passwordMode === "manual" ? manualPassword : undefined,
      sendWelcomeEmail,
      notes: notes.trim() || undefined,
    };

    const validation = createTenantSchema.safeParse(payload);
    if (!validation.success) {
      const fieldErrors: FieldErrors = {};
      for (const [key, msgs] of Object.entries(validation.error.flatten().fieldErrors)) {
        if (msgs?.[0]) fieldErrors[key] = msgs[0];
      }
      setErrors(fieldErrors);
      return;
    }

    setIsPending(true);
    try {
      const res = await fetch("/api/v1/owner/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          tenantId: string;
          slug: string;
          generatedPassword?: string;
          emailSent: boolean;
        };
        toast.success(t("success", { name: companyName.trim(), slug: data.slug }));

        // Auto-generated password not emailed → show it once so the owner can relay it.
        if (data.generatedPassword && !data.emailSent) {
          setCreatedPassword(data.generatedPassword);
          return;
        }
        router.push("/owner/tenants");
        return;
      }

      const body = (await res.json().catch(() => null)) as {
        error?: { code?: string; fields?: Record<string, string> };
      } | null;

      if (body?.error?.fields) {
        setErrors(body.error.fields);
      } else {
        toast.error(t("error"));
      }
    } catch {
      toast.error(t("error"));
    } finally {
      setIsPending(false);
    }
  }

  // Success panel shown when an auto password was not emailed.
  if (createdPassword) {
    return (
      <div className="space-y-4 rounded-xl border border-input bg-surface p-5">
        <p className="text-sm font-semibold text-text-primary">{t("emailNotSent")}</p>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-text-muted">
            {t("generatedPassword")}
          </Label>
          <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 text-sm">
            {createdPassword}
          </pre>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              void navigator.clipboard.writeText(createdPassword);
              toast.success(t("copyPassword"));
            }}
          >
            {t("copyPassword")}
          </Button>
        </div>
        <p className="text-xs text-text-muted">{t("changePasswordHint")}</p>
        <Button
          type="button"
          className="h-11 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep"
          onClick={() => router.push("/owner/tenants")}
        >
          {t("goToList")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="companyName" className="text-xs font-semibold text-text-muted">
          {t("companyName")} *
        </Label>
        <Input
          id="companyName"
          value={companyName}
          onChange={(e) => handleCompanyNameChange(e.target.value)}
          disabled={isPending}
          aria-invalid={!!errors.companyName}
          className="rounded-xl border-input bg-surface"
        />
        {errors.companyName && (
          <p role="alert" className="text-xs text-destructive">
            {errors.companyName}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug" className="text-xs font-semibold text-text-muted">
          {t("slug")} *
        </Label>
        <Input
          id="slug"
          value={slug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(e.target.value);
          }}
          disabled={isPending}
          aria-invalid={!!errors.slug}
          className="rounded-xl border-input bg-surface"
        />
        <p className="text-xs text-text-muted">{t("slugHint", { slug: slug || "slug" })}</p>
        {errors.slug && (
          <p role="alert" className="text-xs text-destructive">
            {errors.slug}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="plan" className="text-xs font-semibold text-text-muted">
            {t("plan")}
          </Label>
          <Select
            value={plan}
            onValueChange={(v) => setPlan(v as typeof plan)}
            disabled={isPending}
          >
            <SelectTrigger id="plan" className="min-h-[44px] rounded-xl bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="cycle" className="text-xs font-semibold text-text-muted">
            {t("cycle")}
          </Label>
          <Select
            value={cycle}
            onValueChange={(v) => setCycle(v as typeof cycle)}
            disabled={isPending}
          >
            <SelectTrigger id="cycle" className="min-h-[44px] rounded-xl bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">{t("monthly")}</SelectItem>
              <SelectItem value="annual">{t("annual")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="pt-2">
        <h2 className="text-sm font-semibold text-text-primary">{t("adminSection")}</h2>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="adminName" className="text-xs font-semibold text-text-muted">
          {t("adminName")} *
        </Label>
        <Input
          id="adminName"
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          disabled={isPending}
          aria-invalid={!!errors.adminName}
          className="rounded-xl border-input bg-surface"
        />
        {errors.adminName && (
          <p role="alert" className="text-xs text-destructive">
            {errors.adminName}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="adminEmail" className="text-xs font-semibold text-text-muted">
          {t("adminEmail")} *
        </Label>
        <Input
          id="adminEmail"
          type="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          disabled={isPending}
          aria-invalid={!!errors.adminEmail}
          className="rounded-xl border-input bg-surface"
        />
        {errors.adminEmail && (
          <p role="alert" className="text-xs text-destructive">
            {errors.adminEmail}
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-text-muted">{t("passwordMode")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="passwordMode"
            value="auto"
            checked={passwordMode === "auto"}
            onChange={() => setPasswordMode("auto")}
            disabled={isPending}
          />
          {t("passwordAuto")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="passwordMode"
            value="manual"
            checked={passwordMode === "manual"}
            onChange={() => setPasswordMode("manual")}
            disabled={isPending}
          />
          {t("passwordManual")}
        </label>
      </fieldset>

      {passwordMode === "manual" && (
        <div className="space-y-1.5">
          <Label htmlFor="manualPassword" className="text-xs font-semibold text-text-muted">
            {t("manualPassword")} *
          </Label>
          <Input
            id="manualPassword"
            type="password"
            value={manualPassword}
            onChange={(e) => setManualPassword(e.target.value)}
            disabled={isPending}
            aria-invalid={!!errors.manualPassword}
            className="rounded-xl border-input bg-surface"
          />
          {errors.manualPassword && (
            <p role="alert" className="text-xs text-destructive">
              {errors.manualPassword}
            </p>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sendWelcomeEmail}
          onChange={(e) => setSendWelcomeEmail(e.target.checked)}
          disabled={isPending}
        />
        {t("sendWelcomeEmail")}
      </label>

      <div className="space-y-1.5">
        <Label htmlFor="notes" className="text-xs font-semibold text-text-muted">
          {t("notes")}
        </Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isPending}
          rows={3}
          className="rounded-xl border-input bg-surface"
        />
      </div>

      {globalError && (
        <p role="alert" className="text-xs text-destructive">
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
