"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { db } from "@/lib/local-db";
import type { ClientLocal } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";

interface ClientDeleteDialogProps {
  client: ClientLocal;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientDeleteDialog({
  client,
  userId,
  open,
  onOpenChange,
}: ClientDeleteDialogProps) {
  // null = loading (initial mount), number = resolved
  // Component remounts on each open via {selectedClient && ...} in parent
  const [quoteCount, setQuoteCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    db.quotes
      .where("clientId")
      .equals(client.id)
      .count()
      .then(setQuoteCount)
      .catch(() => setQuoteCount(0));
  }, [open, client.id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const now = new Date().toISOString();
      await applyLocalMutation(
        "client",
        client.id,
        "delete",
        {},
        client.revision,
        async () => {
          await db.clients.update(client.id, {
            deletedAt: now,
            updatedAt: now,
          });
        },
        userId,
      );
      await db.auditMirror.add({
        id: crypto.randomUUID(),
        who: userId,
        what: "client.delete",
        when: now,
        where: "/clients",
        entityType: "client",
        entityId: client.id,
        before: {
          companyName: client.companyName,
          contactName: client.contactName,
          phone: client.phone,
          email: client.email,
          city: client.city,
        },
        after: { deletedAt: now },
        createdAt: now,
        synced: false,
      });
      void triggerSync();
      toast.success(`Client « ${client.companyName} » supprimé.`);
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer le client ?</DialogTitle>
          {quoteCount === null && (
            <DialogDescription>Vérification en cours…</DialogDescription>
          )}
          {quoteCount !== null && quoteCount > 0 && (
            <DialogDescription>
              Ce client est associé à {quoteCount} devis et ne peut pas être
              supprimé.
            </DialogDescription>
          )}
          {quoteCount !== null && quoteCount === 0 && (
            <DialogDescription>
              Supprimer «&nbsp;{client.companyName}&nbsp;» ? Cette action est
              irréversible. Le client sera retiré de la liste.
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          {(quoteCount === null || quoteCount > 0) && (
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface"
              >
                Fermer
              </button>
            </DialogClose>
          )}
          {quoteCount === 0 && (
            <>
              <DialogClose asChild>
                <button
                  type="button"
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface"
                >
                  Annuler
                </button>
              </DialogClose>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
