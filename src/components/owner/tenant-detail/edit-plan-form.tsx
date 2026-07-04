"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  tenantId: string;
  currentPlan: "free" | "pro" | "enterprise";
}

export function EditPlanForm({ tenantId, currentPlan }: Props) {
  const t = useTranslations("owner.tenants.detail.infos");
  const router = useRouter();

  const [plan, setPlan] = useState(currentPlan);
  const [isPending, setIsPending] = useState(false);

  async function handleChange(value: string) {
    const nextPlan = value as "free" | "pro" | "enterprise";
    setPlan(nextPlan);
    setIsPending(true);
    try {
      const res = await fetch(`/api/v1/owner/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: nextPlan }),
      });
      if (res.ok) {
        toast.success(t("planChanged"));
        router.refresh();
      } else {
        setPlan(currentPlan);
        toast.error(t("planChangeFailed"));
      }
    } catch {
      setPlan(currentPlan);
      toast.error(t("planChangeFailed"));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Select value={plan} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="free">Free</SelectItem>
        <SelectItem value="pro">Pro</SelectItem>
        <SelectItem value="enterprise">Enterprise</SelectItem>
      </SelectContent>
    </Select>
  );
}
