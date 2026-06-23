"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { usePWAUpdate } from "@/hooks/use-pwa-update";

const INSTALL_DISMISSED_KEY = "quotation:pwa-install-dismissed";

export function RegisterSW() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(INSTALL_DISMISSED_KEY) === "true";
  });

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          setRegistration(reg);
        })
        .catch((error) => {
          console.error("SW registration failed:", error);
        });
    }
  }, []);

  const { canInstall, promptInstall } = usePWAInstall();

  const handleUpdateFound = useCallback(() => {
    toast.info("Mise à jour disponible. L'application va se recharger.");
  }, []);

  usePWAUpdate(registration, { onUpdateFound: handleUpdateFound });

  const handleInstall = async () => {
    await promptInstall();
  };

  const handleDismiss = () => {
    sessionStorage.setItem(INSTALL_DISMISSED_KEY, "true");
    setDismissed(true);
  };

  if (!canInstall || dismissed) return null;

  return (
    <div
      role="banner"
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 shadow-raised"
    >
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Download className="size-4 shrink-0 text-brand-navy" />
        <span>Installer Quotation Logistique sur votre appareil</span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="default" onClick={handleInstall}>
          Installer
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDismiss}>
          Plus tard
        </Button>
      </div>
    </div>
  );
}
