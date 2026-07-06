"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PlatformSettings } from "@/lib/schema";
import { savePlatformSettingsAction, type PlatformSettingsState } from "../actions";

interface PlatformSettingsFormProps {
  defaults: PlatformSettings;
}

const INITIAL_STATE: PlatformSettingsState = { success: false };

function fieldError(state: PlatformSettingsState, path: string): string | undefined {
  return state.errors?.[path as keyof PlatformSettingsState["errors"]];
}

function SubmitButton() {
  const t = useTranslations("owner.settings.actions");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t("saving") : t("save")}
    </Button>
  );
}

export function PlatformSettingsForm({ defaults }: PlatformSettingsFormProps) {
  const t = useTranslations("owner.settings");
  const [state, formAction] = useActionState(savePlatformSettingsAction, INITIAL_STATE);

  useEffect(() => {
    if (state.success) {
      toast.success(t("messages.saved"));
    }
  }, [state.success, state.message, t]);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("sections.pricing.title")}</CardTitle>
          <CardDescription>{t("sections.pricing.note")}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {(
            [
              "priceFreeMonthly",
              "priceFreeAnnual",
              "priceProMonthly",
              "priceProAnnual",
              "priceEnterpriseMonthly",
              "priceEnterpriseAnnual",
            ] as const
          ).map((name) => (
            <div key={name} className="flex flex-col gap-1.5">
              <Label htmlFor={name}>{t(`fields.${name}`)}</Label>
              <Input
                id={name}
                name={name}
                type="number"
                min={0}
                step={1}
                defaultValue={defaults[name]}
              />
              {fieldError(state, name) && (
                <p className="text-xs text-destructive">{fieldError(state, name)}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.quotas.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {(["maxUsersFree", "maxUsersPro", "maxUsersEnterprise"] as const).map((name) => (
            <div key={name} className="flex flex-col gap-1.5">
              <Label htmlFor={name}>{t(`fields.${name}`)}</Label>
              <Input
                id={name}
                name={name}
                type="number"
                min={1}
                step={1}
                defaultValue={defaults[name]}
              />
              {fieldError(state, name) && (
                <p className="text-xs text-destructive">{fieldError(state, name)}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.lifecycle.title")}</CardTitle>
          <CardDescription>{t("sections.lifecycle.note")}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trialDays">{t("fields.trialDays")}</Label>
            <Input
              id="trialDays"
              name="trialDays"
              type="number"
              min={1}
              max={60}
              step={1}
              defaultValue={defaults.trialDays}
            />
            {fieldError(state, "trialDays") && (
              <p className="text-xs text-destructive">{fieldError(state, "trialDays")}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gracePeriodDays">{t("fields.gracePeriodDays")}</Label>
            <Input
              id="gracePeriodDays"
              name="gracePeriodDays"
              type="number"
              min={0}
              max={30}
              step={1}
              defaultValue={defaults.gracePeriodDays}
            />
            {fieldError(state, "gracePeriodDays") && (
              <p className="text-xs text-destructive">{fieldError(state, "gracePeriodDays")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.tenantContent.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suspendedContactEmail">{t("fields.suspendedContactEmail")}</Label>
            <Input
              id="suspendedContactEmail"
              name="suspendedContactEmail"
              type="email"
              defaultValue={defaults.suspendedContactEmail}
            />
            {fieldError(state, "suspendedContactEmail") && (
              <p className="text-xs text-destructive">
                {fieldError(state, "suspendedContactEmail")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suspendedContactWhatsapp">
              {t("fields.suspendedContactWhatsapp")}
            </Label>
            <Input
              id="suspendedContactWhatsapp"
              name="suspendedContactWhatsapp"
              type="text"
              defaultValue={defaults.suspendedContactWhatsapp}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expiryMessage">{t("fields.expiryMessage")}</Label>
            <Textarea
              id="expiryMessage"
              name="expiryMessage"
              rows={3}
              defaultValue={defaults.expiryMessage}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.notifications.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notifications.senderAddress">{t("fields.senderAddress")}</Label>
            <Input
              id="notifications.senderAddress"
              name="notifications.senderAddress"
              type="email"
              placeholder={t("fields.senderAddressPlaceholder")}
              defaultValue={defaults.notifications.senderAddress}
            />
            {fieldError(state, "notifications.senderAddress") && (
              <p className="text-xs text-destructive">
                {fieldError(state, "notifications.senderAddress")}
              </p>
            )}
          </div>
          {(
            [
              "trialWelcome",
              "reminderJ7",
              "reminderJ3",
              "reminderJ1",
              "expiryNotification",
              "suspensionNotification",
              "reactivationNotification",
            ] as const
          ).map((name) => (
            <label
              key={name}
              htmlFor={`notifications.${name}`}
              className="flex items-center gap-2 text-sm text-text-primary"
            >
              <input
                id={`notifications.${name}`}
                name={`notifications.${name}`}
                type="checkbox"
                defaultChecked={defaults.notifications[name]}
                className="size-4 rounded border-border"
              />
              {t(`fields.${name}`)}
            </label>
          ))}
        </CardContent>
      </Card>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
