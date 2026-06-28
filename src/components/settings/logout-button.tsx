"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { useCrypto } from "@/lib/crypto/crypto-context";

export function LogoutButton() {
  const router = useRouter();
  const { clearCrypto } = useCrypto();
  const [isPending, setIsPending] = useState(false);

  const handleLogout = async () => {
    setIsPending(true);
    clearCrypto();
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
          router.refresh();
        },
      },
    });
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isPending}
      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {isPending ? "Déconnexion…" : "Se déconnecter"}
    </button>
  );
}
