"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";

export function OwnerLogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const handleLogout = async () => {
    setIsPending(true);
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/owner/login");
          router.refresh();
        },
      },
    });
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isPending}
      className="flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10 disabled:opacity-50 transition-colors"
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
      {isPending ? "Déconnexion…" : "Déconnexion"}
    </button>
  );
}
