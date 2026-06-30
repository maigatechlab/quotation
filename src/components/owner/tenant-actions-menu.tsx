"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RecordPaymentModal } from "./record-payment-modal";

interface Props {
  tenant: { id: string; name: string; status: string };
}

export function TenantActionsMenu({ tenant }: Props) {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [openKey, setOpenKey] = useState(0);

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
            <Link href={`/owner/tenants?focus=${tenant.id}`} className="cursor-pointer">
              Voir
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem disabled title="Bientôt disponible">
            Suspendre
          </DropdownMenuItem>
          <DropdownMenuItem disabled title="Bientôt disponible">
            Réactiver
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { setPaymentOpen(true); setOpenKey(k => k + 1); }}>
            Enregistrer paiement
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RecordPaymentModal
        key={openKey}
        tenantId={tenant.id}
        tenantName={tenant.name}
        tenantStatus={tenant.status}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
      />
    </>
  );
}
