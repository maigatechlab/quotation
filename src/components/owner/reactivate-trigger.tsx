"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ReactivateDialog } from "./reactivate-dialog";

export interface TenantForReactivate {
  id: string;
  name: string;
  status: string;
}

interface Props {
  tenant: TenantForReactivate;
  variant?: "button" | "menu-item";
}

export function ReactivateTrigger({ tenant, variant = "button" }: Props) {
  const t = useTranslations("owner.tenants.reactivate");
  const [open, setOpen] = useState(false);

  // Nothing to reactivate — hidden.
  if (tenant.status === "active" || tenant.status === "trial") {
    return null;
  }

  return (
    <>
      {variant === "menu-item" ? (
        <DropdownMenuItem onSelect={() => setOpen(true)}>{t("trigger")}</DropdownMenuItem>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          {t("trigger")}
        </Button>
      )}

      <ReactivateDialog
        tenantId={tenant.id}
        tenantName={tenant.name}
        tenantStatus={tenant.status}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
