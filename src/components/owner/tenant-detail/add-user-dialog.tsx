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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTenantUserSchema } from "@/lib/validation/tenant-user";

type FieldErrors = Partial<Record<string, string>>;
type TenantUserRole = "admin" | "commercial" | "operateur";

export interface AddUserDialogProps {
  tenantId: string;
  disabled?: boolean;
  disabledReason?: string;
}

export function AddUserDialog({ tenantId, disabled, disabledReason }: AddUserDialogProps) {
  const t = useTranslations("owner.tenants.detail.utilisateurs");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [passwordMode, setPasswordMode] = useState<"auto" | "manual">("auto");
  const [manualPassword, setManualPassword] = useState("");
  const [role, setRole] = useState<TenantUserRole>("commercial");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);

  function resetForm() {
    setName("");
    setEmail("");
    setPasswordMode("auto");
    setManualPassword("");
    setRole("commercial");
    setSendWelcomeEmail(true);
    setErrors({});
    setGeneratedPassword(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    setOpen(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const payload = {
      name: name.trim(),
      email: email.trim(),
      passwordMode,
      manualPassword: passwordMode === "manual" ? manualPassword : undefined,
      role,
      sendWelcomeEmail,
    };

    const validation = createTenantUserSchema.safeParse(payload);
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
      const res = await fetch(`/api/v1/owner/tenants/${tenantId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          generatedPassword?: string;
          emailSent: boolean;
        };
        toast.success(t("add.addedSuccess", { name: name.trim() }));
        if (data.generatedPassword && !data.emailSent) {
          setGeneratedPassword(data.generatedPassword);
          router.refresh();
          return;
        }
        router.refresh();
        setOpen(false);
        resetForm();
        return;
      }

      const body = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string; fields?: Record<string, string> };
      } | null;

      if (body?.error?.fields) {
        setErrors(body.error.fields);
      } else if (body?.error?.code === "QUOTA_EXCEEDED") {
        toast.error(body.error.message ?? t("add.error"));
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
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => setOpen(true)}
      >
        {t("addUser")}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("add.title")}</DialogTitle>
          </DialogHeader>

          {generatedPassword ? (
            <div className="space-y-4 py-2">
              <p className="text-sm font-semibold text-text-primary">
                {t("add.generatedPassword")}
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 text-sm">
                {generatedPassword}
              </pre>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(generatedPassword);
                  toast.success(t("add.copyPassword"));
                }}
              >
                {t("add.copyPassword")}
              </Button>
              <p className="text-xs text-text-muted">{t("add.changePasswordHint")}</p>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    resetForm();
                  }}
                >
                  {t("add.submit")}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="add-user-name">{t("add.name")} *</Label>
                <Input
                  id="add-user-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isPending}
                  aria-invalid={!!errors.name}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-user-email">{t("add.email")} *</Label>
                <Input
                  id="add-user-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isPending}
                  aria-invalid={!!errors.email}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-user-role">{t("add.role")}</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as TenantUserRole)}
                  disabled={isPending}
                >
                  <SelectTrigger id="add-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                    <SelectItem value="commercial">{t("roles.commercial")}</SelectItem>
                    <SelectItem value="operateur">{t("roles.operateur")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-text-muted">
                  {t("add.passwordMode")}
                </legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="add-user-password-mode"
                    checked={passwordMode === "auto"}
                    onChange={() => setPasswordMode("auto")}
                    disabled={isPending}
                  />
                  {t("add.passwordAuto")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="add-user-password-mode"
                    checked={passwordMode === "manual"}
                    onChange={() => setPasswordMode("manual")}
                    disabled={isPending}
                  />
                  {t("add.passwordManual")}
                </label>
              </fieldset>

              {passwordMode === "manual" && (
                <div className="space-y-1.5">
                  <Label htmlFor="add-user-manual-password">{t("add.manualPassword")} *</Label>
                  <Input
                    id="add-user-manual-password"
                    type="password"
                    value={manualPassword}
                    onChange={(e) => setManualPassword(e.target.value)}
                    disabled={isPending}
                    aria-invalid={!!errors.manualPassword}
                  />
                  {errors.manualPassword && (
                    <p className="text-xs text-destructive">{errors.manualPassword}</p>
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
                {t("add.sendWelcomeEmail")}
              </label>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={isPending}
                >
                  {t("add.cancel")}
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? t("add.submitting") : t("add.submit")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
