import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { user as userTable } from "@/lib/schema";
import { getSessionWithRole } from "@/lib/session";
import { UserManagementTable } from "./components/user-role-selector";

export default async function UtilisateursPage() {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");

  const { session, role } = result;
  if (!can(role, "user.manage")) redirect("/");

  const users = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .orderBy(asc(userTable.createdAt));

  return (
    <div className="flex flex-col px-5 pt-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Paramètres
      </p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
        Gestion des utilisateurs
      </h1>
      <p className="mt-0.5 text-sm text-text-secondary">Rôles &amp; accès</p>

      <div className="mt-6">
        <UserManagementTable
          users={users as Array<{ id: string; name: string; email: string; role: string; createdAt: Date }>}
          currentUserId={session.user.id}
        />
      </div>
    </div>
  );
}
