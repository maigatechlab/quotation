"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/auth-client";
import { useCrypto } from "@/lib/crypto/crypto-context";

export function SignOutButton() {
  const { data: session, isPending } = useSession();
  const { clearCrypto } = useCrypto();
  const router = useRouter();

  if (isPending) {
    return <Button disabled>Loading...</Button>;
  }

  if (!session) {
    return null;
  }

  return (
    <Button
      variant="outline"
      onClick={async () => {
        await signOut();
        clearCrypto(); // drop the in-memory at-rest key (Story 6.1)
        router.replace("/");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
