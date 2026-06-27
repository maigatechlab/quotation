"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/nav/bottom-nav";

export function BottomNavWrapper() {
  const pathname = usePathname();
  // Hide on preview pages: /devis/[id] where id is not "nouveau"
  const isPreview = /^\/devis\/(?!nouveau)[^/]+/.test(pathname);
  if (isPreview) return null;
  return <BottomNav />;
}
