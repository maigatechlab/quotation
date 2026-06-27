"use client";

import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/local-db";
import type { CompanyLocal } from "@/lib/local-db";

export function useLiveCompany(): CompanyLocal | undefined | null {
  const [company, setCompany] = useState<CompanyLocal | undefined | null>(undefined);

  useEffect(() => {
    const subscription = liveQuery(() =>
      db.company.toCollection().first()
    ).subscribe({
      next: (result) => setCompany(result ?? null),
      error: () => setCompany(null),
    });

    return () => subscription.unsubscribe();
  }, []);

  return company;
}
