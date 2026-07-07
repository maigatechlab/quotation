import Link from "next/link";
import { CreateUserForm } from "./create-user-form";

export default function NewUserPage() {
  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          OWNER CONSOLE
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
          Nouveau compte owner
        </h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          Compte superadmin pour la console owner — accès immédiat après création.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <CreateUserForm />
      </div>

      <Link
        href="/owner/users"
        className="text-sm text-text-muted hover:text-text-primary transition-colors"
      >
        ← Retour à la liste
      </Link>
    </div>
  );
}
