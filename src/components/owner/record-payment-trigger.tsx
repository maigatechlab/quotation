"use client";

import { useState } from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RecordPaymentModal } from "./record-payment-modal";

export interface TenantForPayment {
  id: string;
  name: string;
  status: string;
}

interface Props {
  tenant: TenantForPayment;
  variant?: "button" | "menu-item";
  defaultReactivateIfSuspended?: boolean;
  triggerLabel?: string;
}

export function RecordPaymentTrigger({
  tenant,
  variant = "menu-item",
  defaultReactivateIfSuspended = false,
  triggerLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  // Remounting via key forces the modal's internal form state to reset on each open —
  // required because DropdownMenuItem asChild breaks ref forwarding into the modal trigger.
  const [openKey, setOpenKey] = useState(0);

  return (
    <>
      {variant === "menu-item" ? (
        <DropdownMenuItem
          onSelect={() => {
            setOpen(true);
            setOpenKey((k) => k + 1);
          }}
        >
          {triggerLabel ?? "Enregistrer paiement"}
        </DropdownMenuItem>
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setOpenKey((k) => k + 1);
          }}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-alt transition-colors"
        >
          {triggerLabel ?? "Enregistrer paiement"}
        </button>
      )}

      <RecordPaymentModal
        key={openKey}
        tenantId={tenant.id}
        tenantName={tenant.name}
        tenantStatus={tenant.status}
        open={open}
        onOpenChange={setOpen}
        defaultReactivateIfSuspended={defaultReactivateIfSuspended}
      />
    </>
  );
}
