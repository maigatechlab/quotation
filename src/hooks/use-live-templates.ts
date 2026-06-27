"use client";

import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/local-db";
import type { TemplateLocal } from "@/lib/local-db";

export interface LiveTemplatesResult {
  templates: TemplateLocal[];
  loaded: boolean;
}

export function useLiveTemplates(): LiveTemplatesResult {
  const [templates, setTemplates] = useState<TemplateLocal[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const subscription = liveQuery(() =>
      db.templates.filter((t) => !t.deletedAt).toArray()
    ).subscribe({
      next: (items) => {
        setTemplates(items);
        setLoaded(true);
      },
      error: () => {
        setTemplates([]);
        setLoaded(true);
      },
    });

    return () => subscription.unsubscribe();
  }, []);

  return { templates, loaded };
}
