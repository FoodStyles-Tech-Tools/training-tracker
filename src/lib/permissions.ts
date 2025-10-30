import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import type { ModuleName } from "@/db/schema";

export type PermissionAction = "list" | "add" | "edit" | "delete";

export class PermissionError extends Error {
  constructor(message: string = "You do not have sufficient permissions for this action") {
    super(message);
    this.name = "PermissionError";
  }
}

export interface PermissionSet {
  canList: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export async function getUserPermissions(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user?.roleId) {
    return new Map<ModuleName, PermissionSet>();
  }

  const permissions = await db.query.rolePermissions.findMany({
    where: eq(schema.rolePermissions.roleId, user.roleId),
  });

  const map = new Map<ModuleName, PermissionSet>();

  permissions.forEach((perm) => {
    map.set(perm.module as ModuleName, {
      canList: perm.canList,
      canAdd: perm.canAdd,
      canEdit: perm.canEdit,
      canDelete: perm.canDelete,
    });
  });

  return map;
}

export async function ensurePermission(
  userId: string,
  module: ModuleName,
  action: PermissionAction,
) {
  const permissions = await getUserPermissions(userId);
  const set = permissions.get(module);

  if (!set) {
    throw new PermissionError("You do not have permission to access this area");
  }

  const allowed =
    action === "list"
      ? set.canList
      : action === "add"
        ? set.canAdd
        : action === "edit"
          ? set.canEdit
          : set.canDelete;

  if (!allowed) {
    throw new PermissionError("You do not have sufficient permissions for this action");
  }
}
