"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReactivateTrigger } from "./reactivate-trigger";
import { RecordPaymentTrigger } from "./record-payment-trigger";

interface Props {
  tenant: { id: string; name: string; status: string };
}

export function TenantActionsMenu({ tenant }: Props) {
  return (
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
        <ReactivateTrigger tenant={tenant} variant="menu-item" />
        <RecordPaymentTrigger tenant={tenant} variant="menu-item" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
