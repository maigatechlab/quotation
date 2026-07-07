"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { SuspendDialogControlled } from "@/app/owner/tenants/[id]/suspend-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReactivateDialog } from "./reactivate-dialog";
import { RecordPaymentModal } from "./record-payment-modal";

interface Props {
  tenant: { id: string; name: string; status: string };
}

type OpenDialog = "suspend" | "reactivate" | "payment" | null;

/**
 * Dialogs are rendered OUTSIDE the DropdownMenu on purpose: content mounted
 * inside DropdownMenuContent unmounts when the menu closes on item select,
 * which kills the dialog before it can open.
 */
export function TenantActionsMenu({ tenant }: Props) {
  const tReactivate = useTranslations("owner.tenants.reactivate");
  const tSuspend = useTranslations("owner.tenants.suspend");
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  // Remount payment modal each open so its form state resets.
  const [paymentKey, setPaymentKey] = useState(0);

  const canSuspend = tenant.status === "active" || tenant.status === "trial";
  const canReactivate = tenant.status === "suspended" || tenant.status === "cancelled";

  function closeIfDone(next: boolean) {
    if (!next) setOpenDialog(null);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-alt transition-colors"
            aria-label="Actions"
          >
            <MoreHorizontal className="h-4 w-4 text-text-muted" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/owner/tenants/${tenant.id}`} className="cursor-pointer">
              Voir
            </Link>
          </DropdownMenuItem>
          {canSuspend && (
            <DropdownMenuItem onSelect={() => setOpenDialog("suspend")}>
              {tSuspend("trigger")}
            </DropdownMenuItem>
          )}
          {canReactivate && (
            <DropdownMenuItem onSelect={() => setOpenDialog("reactivate")}>
              {tReactivate("trigger")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              setPaymentKey((k) => k + 1);
              setOpenDialog("payment");
            }}
          >
            Enregistrer paiement
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SuspendDialogControlled
        tenantId={tenant.id}
        tenantName={tenant.name}
        open={openDialog === "suspend"}
        onOpenChange={closeIfDone}
      />
      <ReactivateDialog
        tenantId={tenant.id}
        tenantName={tenant.name}
        tenantStatus={tenant.status}
        open={openDialog === "reactivate"}
        onOpenChange={closeIfDone}
      />
      <RecordPaymentModal
        key={paymentKey}
        tenantId={tenant.id}
        tenantName={tenant.name}
        tenantStatus={tenant.status}
        open={openDialog === "payment"}
        onOpenChange={closeIfDone}
        defaultReactivateIfSuspended={false}
      />
    </>
  );
}
