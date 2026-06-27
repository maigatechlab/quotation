"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLiveClients } from "@/hooks/use-live-clients";
import type { ClientLocal } from "@/lib/local-db";
import { ClientDeleteDialog } from "./client-delete-dialog";

interface ClientListProps {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  userId: string;
}

export function ClientList({
  canCreate,
  canEdit,
  canDelete,
  userId,
}: ClientListProps) {
  const { clients, total, searchQuery, setSearchQuery } = useLiveClients();
  const [selectedClient, setSelectedClient] = useState<ClientLocal | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <div className="mt-1 flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-text-primary">Mes clients</h1>
        {canCreate && (
          <Link
            href="/clients/nouveau"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Nouveau client
          </Link>
        )}
      </div>

      <div className="relative mt-4">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Rechercher par nom, téléphone ou ville…"
          aria-label="Rechercher un client"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="mt-4 space-y-2">
        {total === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-sm text-text-secondary">Aucun client pour l&apos;instant.</p>
            {canCreate && (
              <Link
                href="/clients/nouveau"
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                <UserPlus className="h-4 w-4" />
                Créer un client
              </Link>
            )}
          </div>
        ) : clients.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-sm text-text-secondary">
              Aucun client trouvé pour «&nbsp;{searchQuery}&nbsp;».
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="mt-3 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Effacer la recherche
            </button>
          </div>
        ) : (
          clients.map((client) => (
            <div
              key={client.id}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-text-primary">{client.companyName}</p>
                  <p className="mt-0.5 text-sm text-text-secondary">{client.phone}</p>
                  {client.contactName && (
                    <p className="mt-0.5 text-xs text-text-muted">{client.contactName}</p>
                  )}
                  {client.city && (
                    <p className="mt-0.5 text-xs text-text-muted">{client.city}</p>
                  )}
                </div>
                <div className="ml-3 flex items-center gap-1">
                  {canEdit && (
                    <Link
                      href={`/clients/${client.id}/modifier`}
                      aria-label={`Modifier ${client.companyName}`}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Modifier
                    </Link>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClient(client);
                        setDeleteDialogOpen(true);
                      }}
                      aria-label={`Supprimer ${client.companyName}`}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedClient && (
        <ClientDeleteDialog
          client={selectedClient}
          userId={userId}
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open);
            if (!open) setSelectedClient(null);
          }}
        />
      )}
    </>
  );
}
