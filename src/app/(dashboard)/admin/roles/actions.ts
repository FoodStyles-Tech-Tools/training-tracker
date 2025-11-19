"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import type { ModuleName } from "@/db/schema";
import { ensurePermission } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { logActivity } from "@/lib/utils-server";

const permissionSchema = z.object({
  module: z.enum(schema.MODULES as [ModuleName, ...ModuleName[]]),
  canList: z.boolean().default(false),
  canAdd: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
});

const roleSchema = z.object({
  roleName: z.string().min(2, "Role name must contain at least 2 characters"),
  permissions: z.array(permissionSchema),
});

export type RoleFormInput = z.infer<typeof roleSchema>;

export async function createRoleAction(input: RoleFormInput) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "roles", "add");

  const parsed = roleSchema.parse(input);

  const [role] = await db
    .insert(schema.rolesList)
    .values({ roleName: parsed.roleName })
    .returning();

  if (!role) {
    throw new Error("Failed to create role");
  }

  if (parsed.permissions.length) {
    await db.insert(schema.rolePermissions).values(
      parsed.permissions.map((perm) => ({
        roleId: role.id,
        module: perm.module,
        canList: perm.canList,
        canAdd: perm.canAdd,
        canEdit: perm.canEdit,
        canDelete: perm.canDelete,
      })),
    );
  }

  // Log role creation
  await logActivity({
    userId: session.user.id,
    module: "roles",
    action: "add",
    data: {
      createdId: role.id,
      roleName: parsed.roleName,
      permissions: parsed.permissions,
    },
  });

  revalidatePath("/admin/roles");
  return role.id;
}

export async function updateRoleAction(id: string, input: RoleFormInput) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "roles", "edit");

  const parsed = roleSchema.parse(input);

  // Use a transaction to ensure atomicity - if anything fails, all changes are rolled back
  await db.transaction(async (tx) => {
    // Update role name
    await tx
      .update(schema.rolesList)
      .set({
        roleName: parsed.roleName,
        updatedAt: new Date(),
      })
      .where(eq(schema.rolesList.id, id));

    // Delete existing permissions
    await tx
      .delete(schema.rolePermissions)
      .where(eq(schema.rolePermissions.roleId, id));

    // Insert new permissions
    if (parsed.permissions.length) {
      await tx.insert(schema.rolePermissions).values(
        parsed.permissions.map((perm) => ({
          roleId: id,
          module: perm.module,
          canList: perm.canList,
          canAdd: perm.canAdd,
          canEdit: perm.canEdit,
          canDelete: perm.canDelete,
        })),
      );
    }
  });

  // Log role update (outside transaction to avoid rollback on logging failure)
  await logActivity({
    userId: session.user.id,
    module: "roles",
    action: "edit",
    data: {
      updatedId: id,
      roleName: parsed.roleName,
      permissions: parsed.permissions,
    },
  });

  revalidatePath("/admin/roles");
}

export async function deleteRoleAction(id: string) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "roles", "delete");

  // Fetch role before deletion for log
  const role = await db.query.rolesList.findFirst({ where: eq(schema.rolesList.id, id) });
  await db.delete(schema.rolesList).where(eq(schema.rolesList.id, id));
  // Log role deletion
  await logActivity({
    userId: session.user.id,
    module: "roles",
    action: "delete",
    data: {
      deletedId: id,
      roleName: role?.roleName,
    },
  });
  revalidatePath("/admin/roles");
}
