"use client";

import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/local-db";
import type { RouteTemplateLocal } from "@/lib/local-db";

export interface LiveRouteTemplatesResult {
  templates: RouteTemplateLocal[];
  loaded: boolean;
}

export function useLiveRouteTemplates(): LiveRouteTemplatesResult {
  const [templates, setTemplates] = useState<RouteTemplateLocal[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const subscription = liveQuery(() =>
      db.routeTemplates.filter((t) => !t.deletedAt).toArray()
    ).subscribe({
      next: (rows) => {
        setTemplates(rows);
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
