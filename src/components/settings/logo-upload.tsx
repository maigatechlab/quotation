"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useLiveCompany } from "@/hooks/use-live-company";
import { db } from "@/lib/local-db";
import type { CompanyLocal } from "@/lib/local-db";

interface LogoUploadProps {
  companyId: string | null;
  canEdit: boolean;
  initialCompany?: CompanyLocal | null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function resizeImage(file: File, maxWidth: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob failed"));
            return;
          }
          resolve(blob);
        },
        file.type === "image/png" ? "image/png" : "image/jpeg",
        0.9
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de charger l'image."));
    };
    img.src = url;
  });
}

export function LogoUpload({ companyId, canEdit, initialCompany }: LogoUploadProps) {
  const liveCompany = useLiveCompany();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  // liveCompany: undefined = Dexie loading, null = no row, CompanyLocal = row exists
  // Fall back to SSR seed so logo shows even on fresh/purged IndexedDB
  const effectiveCompany = liveCompany ?? initialCompany;
  const logoUrl = effectiveCompany?.logoUrl;
  const canUpload = canEdit && companyId !== null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    const ALLOWED_TYPES = ["image/jpeg", "image/png"];
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Format non supporté. PNG ou JPG uniquement.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setError("Fichier trop volumineux (max 2 Mo).");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsPending(true);
    try {
      const resizedBlob = await resizeImage(file, 300);
      const logoData = await blobToDataUrl(resizedBlob);
      const formData = new FormData();
      formData.append("logo", resizedBlob, file.name);

      const res = await fetch("/api/v1/companies/logo", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error?.message ?? "Erreur lors de l'upload du logo.";
        setError(msg);
        return;
      }

      const data = (await res.json()) as { logoUrl: string };

      // Read Dexie at put-time to avoid stale closure; fall back to SSR seed so
      // the row is created even on a fresh/purged IndexedDB where liveCompany is null.
      // logoData (base64) stored alongside remote URL for offline PDF generation.
      const current = (await db.company.toCollection().first()) ?? initialCompany;
      if (current) {
        await db.company.put({ ...current, logoUrl: data.logoUrl, logoData });
      }

      toast.success("Logo mis à jour");
    } catch {
      setError("Erreur lors de l'upload du logo.");
    } finally {
      setIsPending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Logo société
      </p>

      <div className="flex items-center gap-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Logo société"
            className="max-w-24 max-h-16 rounded border border-border object-contain"
          />
        ) : (
          <div className="flex h-16 w-24 items-center justify-center rounded border border-dashed border-border bg-surface-alt text-xs text-text-muted">
            Aucun logo
          </div>
        )}

        {canEdit && (
          <div className="flex flex-col gap-1">
            {canUpload ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isPending}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPending}
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-alt disabled:opacity-50"
                >
                  {isPending ? "Chargement…" : "Changer le logo"}
                </button>
              </>
            ) : (
              <p className="text-xs text-text-muted">
                Enregistrez d'abord les informations société
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
