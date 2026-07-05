"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SettingsSection {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Sous-navigation Paramètres (design brief §7) — onglets soulignés à lg+,
 * 4 groupes : Société / Modèles / Conformité / Utilisateurs.
 * Mobile : les onglets sont masqués et tous les panneaux restent empilés
 * (layout mobile hors scope, inchangé).
 */
export function SettingsTabs({ sections }: { sections: SettingsSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sections des paramètres"
        className="hidden items-center gap-1 border-b border-border lg:flex"
      >
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            id={`tab-${section.id}`}
            aria-selected={active === section.id}
            aria-controls={`panel-${section.id}`}
            onClick={() => setActive(section.id)}
            className={cn(
              "-mb-px border-b-2 px-3.5 py-2.5 text-[13.5px] transition-colors",
              active === section.id
                ? "border-brand-navy font-semibold text-brand-navy"
                : "border-transparent font-medium text-text-secondary hover:text-text-primary",
            )}
          >
            {section.label}
          </button>
        ))}
      </div>
      {sections.map((section) => (
        <div
          key={section.id}
          role="tabpanel"
          id={`panel-${section.id}`}
          aria-labelledby={`tab-${section.id}`}
          className={cn(active === section.id ? "lg:pt-6" : "lg:hidden")}
        >
          {section.content}
        </div>
      ))}
    </div>
  );
}
