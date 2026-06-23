"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Role } from "@/lib/permissions";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "Administrateur" },
  { value: "commercial", label: "Commercial" },
  { value: "operateur", label: "Opérateur" },
];

interface UserRoleSelectorProps {
  userId: string;
  currentRole: Role;
  currentUserId: string;
  userName: string;
}

export function UserRoleSelector({
  userId,
  currentRole,
  currentUserId,
  userName,
}: UserRoleSelectorProps) {
  const [role, setRole] = useState<Role>(currentRole);
  const [isPending, setIsPending] = useState(false);
  const isOwnRow = userId === currentUserId;

  const handleChange = async (newRole: string) => {
    const previous = role;
    setRole(newRole as Role);
    setIsPending(true);
    try {
      const res = await fetch(`/api/v1/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        toast.success("Rôle mis à jour");
      } else {
        setRole(previous);
        const data = await res.json();
        toast.error(data?.error?.message ?? "Erreur lors de la mise à jour du rôle");
      }
    } catch {
      setRole(previous);
      toast.error("Erreur lors de la mise à jour du rôle");
    } finally {
      setIsPending(false);
    }
  };

  if (isOwnRow) {
    return (
      <span className="text-sm text-text-muted italic" title="Votre propre rôle">
        {ROLE_OPTIONS.find((r) => r.value === currentRole)?.label ?? currentRole}
      </span>
    );
  }

  return (
    <Select
      value={role}
      onValueChange={handleChange}
      disabled={isPending}
    >
      <SelectTrigger
        className="w-40"
        aria-label={`Rôle de ${userName}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_OPTIONS.map(({ value, label }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
}

interface UserManagementTableProps {
  users: UserRow[];
  currentUserId: string;
}

export function UserManagementTable({ users, currentUserId }: UserManagementTableProps) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-alt">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-text-muted">Nom</th>
            <th className="px-4 py-3 text-left font-semibold text-text-muted">Email</th>
            <th className="px-4 py-3 text-left font-semibold text-text-muted">Rôle</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-border">
              <td className="px-4 py-3 text-text-primary">{u.name}</td>
              <td className="px-4 py-3 text-text-secondary">{u.email}</td>
              <td className="px-4 py-3">
                <UserRoleSelector
                  userId={u.id}
                  currentRole={u.role as Role}
                  currentUserId={currentUserId}
                  userName={u.name}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
