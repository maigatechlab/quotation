"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLiveClients } from "@/hooks/use-live-clients";
import type { ClientLocal } from "@/lib/local-db";
import { cn } from "@/lib/utils";
import { ClientDeleteDialog } from "./client-delete-dialog";

const PAGE_SIZE = 20;

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
  const router = useRouter();
  const { clients, total, searchQuery, setSearchQuery } = useLiveClients();
  const [selectedClient, setSelectedClient] = useState<ClientLocal | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...clients].sort(
      (a, b) => dir * a.companyName.localeCompare(b.companyName, "fr"),
    );
  }, [clients, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function openDelete(client: ClientLocal) {
    setSelectedClient(client);
    setDeleteDialogOpen(true);
  }

  return (
    <>
      <div className="mt-1 flex items-end justify-between">
        <h1 className="font-serif text-2xl font-semibold text-text-primary lg:text-[27px]">
          Mes clients
        </h1>
        {canCreate && (
          <Link
            href="/clients/nouveau"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground lg:rounded-lg lg:py-2.5 lg:font-semibold lg:transition-colors lg:hover:bg-brand-navy-deep"
          >
            <Plus className="hidden h-4 w-4 lg:block" aria-hidden="true" />
            Nouveau client
          </Link>
        )}
      </div>

      <div className="relative mt-4 lg:w-80">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Rechercher par nom, téléphone ou ville…"
          aria-label="Rechercher un client"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
          className="pl-9"
        />
      </div>

      {total === 0 || clients.length === 0 ? (
        <div className="mt-4">
          {total === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-center lg:rounded-2xl lg:py-12">
              <p className="text-sm text-text-secondary">
                Aucun client pour l&apos;instant.
              </p>
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
          ) : (
            <div className="rounded-xl border border-border bg-surface p-6 text-center lg:rounded-2xl lg:py-12">
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
          )}
        </div>
      ) : (
        <>
          {/* Mobile — cards empilées (hors scope, inchangé) */}
          <div className="mt-4 space-y-2 lg:hidden">
            {clients.map((client) => (
              <div
                key={client.id}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-text-primary">
                      {client.companyName}
                    </p>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {client.phone}
                    </p>
                    {client.contactName && (
                      <p className="mt-0.5 text-xs text-text-muted">
                        {client.contactName}
                      </p>
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
                        onClick={() => openDelete(client)}
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
            ))}
          </div>

          {/* Desktop — table dense (standard tables du design brief) */}
          <div className="mt-4 hidden overflow-hidden rounded-2xl border border-border bg-surface lg:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="h-10 border-b border-border bg-surface-alt text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  <th scope="col" className="pl-5 font-semibold">
                    <button
                      type="button"
                      onClick={() =>
                        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
                      }
                      aria-sort={sortDir === "asc" ? "ascending" : "descending"}
                      className="inline-flex items-center gap-1 uppercase tracking-wider text-brand-navy transition-colors"
                    >
                      Société
                      {sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <ArrowDown className="h-3 w-3" aria-hidden="true" />
                      )}
                    </button>
                  </th>
                  <th scope="col" className="font-semibold">
                    Contact
                  </th>
                  <th scope="col" className="w-[170px] font-semibold">
                    Téléphone
                  </th>
                  <th scope="col" className="w-[130px] font-semibold">
                    Ville
                  </th>
                  <th scope="col" className="w-24 pr-5 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() =>
                      canEdit && router.push(`/clients/${client.id}/modifier`)
                    }
                    className={cn(
                      "h-[52px] border-b border-border/60 transition-colors last:border-b-0 hover:bg-surface-alt",
                      canEdit && "cursor-pointer",
                    )}
                  >
                    <td className="max-w-0 truncate pl-5 pr-3 font-semibold">
                      {client.companyName}
                    </td>
                    <td className="max-w-0 truncate pr-3 text-text-secondary">
                      {client.contactName || "—"}
                    </td>
                    <td className="text-text-secondary">{client.phone}</td>
                    <td className="text-text-secondary">{client.city || "—"}</td>
                    <td className="pr-4">
                      <span className="flex justify-end gap-1">
                        {canEdit && (
                          <Link
                            href={`/clients/${client.id}/modifier`}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Modifier ${client.companyName}`}
                            title="Modifier"
                            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-border/60 hover:text-text-primary"
                          >
                            <Pencil className="h-[15px] w-[15px]" aria-hidden="true" />
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDelete(client);
                            }}
                            aria-label={`Supprimer ${client.companyName}`}
                            title="Supprimer"
                            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-status-expire-bg hover:text-status-expire-text"
                          >
                            <Trash2 className="h-[15px] w-[15px]" aria-hidden="true" />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer : compteur + pagination numérotée */}
            <div className="flex items-center justify-between border-t border-border bg-surface-alt px-5 py-2.5">
              <span className="text-xs text-text-muted">
                {sorted.length} client{sorted.length > 1 ? "s" : ""} · page{" "}
                {safePage}/{totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, safePage - 1))}
                  disabled={safePage === 1}
                  aria-label="Page précédente"
                  className="flex items-center rounded-md border border-border p-1.5 text-text-secondary hover:bg-surface disabled:cursor-default disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    aria-current={p === safePage ? "page" : undefined}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      p === safePage
                        ? "border-brand-navy bg-brand-navy font-semibold text-text-on-dark"
                        : "border-border text-text-secondary hover:bg-surface",
                    )}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage === totalPages}
                  aria-label="Page suivante"
                  className="flex items-center rounded-md border border-border p-1.5 text-text-secondary hover:bg-surface disabled:cursor-default disabled:opacity-40"
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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
