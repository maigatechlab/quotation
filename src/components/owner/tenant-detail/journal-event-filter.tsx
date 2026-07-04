"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  currentEventType: string;
  eventTypes: string[];
}

export function JournalEventFilter({ currentEventType, eventTypes }: Props) {
  const t = useTranslations("owner.tenants.detail.journal");
  const tEvents = useTranslations("owner.events");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "journal");
    if (value === "all") {
      params.delete("event");
    } else {
      params.set("event", value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={currentEventType} onValueChange={onChange}>
      <SelectTrigger className="w-56">
        <SelectValue placeholder={t("filterByType")} />
      </SelectTrigger>
      <SelectContent>
        {eventTypes.map((type) => (
          <SelectItem key={type} value={type}>
            {type === "all" ? t("filterAll") : tEvents(type)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
