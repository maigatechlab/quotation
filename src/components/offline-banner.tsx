"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface OfflineBannerProps {
  pendingCount?: number;
}

export function OfflineBanner({ pendingCount = 0 }: OfflineBannerProps) {
  const t = useTranslations("offline");
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const syncOnlineState = () => setIsOffline(!navigator.onLine);
    syncOnlineState();

    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    return () => {
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
    };
  }, []);

  if (!isOffline && pendingCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-brand-navy px-4 py-2 text-xs font-medium text-text-on-dark"
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 flex-shrink-0 rounded-full bg-brand-amber animate-blink-dot"
      />
      <span>{t("banner", { count: pendingCount })}</span>
    </div>
  );
}