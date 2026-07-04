export type Role = "admin" | "commercial" | "operateur" | "superadmin";

export type Action =
  | "quote.create"
  | "quote.read"
  | "quote.update"
  | "quote.delete"
  | "quote.change-status"
  | "quote.duplicate"
  | "client.create"
  | "client.read"
  | "client.update"
  | "client.delete"
  | "company.read"
  | "company.update"
  | "clause.create"
  | "clause.read"
  | "clause.update"
  | "clause.delete"
  | "template.create"
  | "template.read"
  | "template.update"
  | "template.delete"
  | "route-template.create"
  | "route-template.read"
  | "route-template.update"
  | "route-template.delete"
  | "user.read"
  | "user.manage"
  | "sync.push"
  | "sync.pull"
  | "owner.access"
  | "tenant.read"
  | "tenant.read-all";

type Permission = boolean | "own";

const PERMISSION_MATRIX: Record<Role, Partial<Record<Action, Permission>>> = {
  superadmin: {
    "owner.access": true,
    "tenant.read": true,
    "tenant.read-all": true,
    "quote.create": false,
    "quote.read": false,
    "quote.update": false,
    "quote.delete": false,
    "quote.change-status": false,
    "quote.duplicate": false,
    "client.create": false,
    "client.read": false,
    "client.update": false,
    "client.delete": false,
    "company.read": false,
    "company.update": false,
    "clause.create": false,
    "clause.read": false,
    "clause.update": false,
    "clause.delete": false,
    "template.create": false,
    "template.read": false,
    "template.update": false,
    "template.delete": false,
    "route-template.create": false,
    "route-template.read": false,
    "route-template.update": false,
    "route-template.delete": false,
    "user.read": false,
    "user.manage": false,
    "sync.push": false,
    "sync.pull": false,
  },
  admin: {
    "quote.create": true,
    "quote.read": true,
    "quote.update": true,
    "quote.delete": true,
    "quote.change-status": true,
    "quote.duplicate": true,
    "client.create": true,
    "client.read": true,
    "client.update": true,
    "client.delete": true,
    "company.read": true,
    "company.update": true,
    "clause.create": true,
    "clause.read": true,
    "clause.update": true,
    "clause.delete": true,
    "template.create": true,
    "template.read": true,
    "template.update": true,
    "template.delete": true,
    "route-template.create": true,
    "route-template.read": true,
    "route-template.update": true,
    "route-template.delete": true,
    "user.read": true,
    "user.manage": true,
    "sync.push": true,
    "sync.pull": true,
  },
  commercial: {
    "quote.create": true,
    "quote.read": true,
    "quote.update": "own",
    "quote.delete": "own",
    "quote.change-status": "own",
    "quote.duplicate": true,
    "client.create": true,
    "client.read": true,
    "client.update": "own",
    "client.delete": false,
    "company.read": true,
    "company.update": false,
    "clause.create": false,
    "clause.read": true,
    "clause.update": false,
    "clause.delete": false,
    "template.create": false,
    "template.read": true,
    "template.update": false,
    "template.delete": false,
    "route-template.create": false,
    "route-template.read": true,
    "route-template.update": false,
    "route-template.delete": false,
    "user.read": false,
    "user.manage": false,
    "sync.push": true,
    "sync.pull": true,
  },
  operateur: {
    "quote.create": false,
    "quote.read": true,
    "quote.update": false,
    "quote.delete": false,
    "quote.change-status": false,
    "quote.duplicate": false,
    "client.create": false,
    "client.read": true,
    "client.update": false,
    "client.delete": false,
    "company.read": true,
    "company.update": false,
    "clause.create": false,
    "clause.read": true,
    "clause.update": false,
    "clause.delete": false,
    "template.create": false,
    "template.read": true,
    "template.update": false,
    "template.delete": false,
    "route-template.create": false,
    "route-template.read": true,
    "route-template.update": false,
    "route-template.delete": false,
    "user.read": false,
    "user.manage": false,
    "sync.push": true,
    "sync.pull": true,
  },
};

export class PermissionError extends Error {
  readonly statusCode = 403;

  constructor(action: Action) {
    super(`Forbidden: ${action}`);
    this.name = "PermissionError";
  }
}

export function can(role: Role, action: Action): boolean {
  const perm = PERMISSION_MATRIX[role]?.[action];
  return perm === true || perm === "own";
}

export function requirePermission(
  userRole: Role,
  action: Action,
  ownerId?: string,
  currentUserId?: string
): void {
  const perm = PERMISSION_MATRIX[userRole]?.[action];
  if (!perm) {
    throw new PermissionError(action);
  }
  if (perm === "own") {
    if (!ownerId || !currentUserId || ownerId !== currentUserId) {
      throw new PermissionError(action);
    }
  }
}
