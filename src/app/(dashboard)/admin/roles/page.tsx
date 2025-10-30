import { asc } from "drizzle-orm";

import { db, schema } from "@/db";
import { getUserPermissions, ensurePermission } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

import { RoleManager } from "./role-manager";

export default async function RolesPage() {
  const session = await requireSession();
  await ensurePermission(session.user.id, "roles", "list");

  const roles = await db.query.rolesList.findMany({
    orderBy: asc(schema.rolesList.roleName),
    with: {
      permissions: true,
    },
  });

  const permissions = await getUserPermissions(session.user.id);
  const ability =
    permissions.get("roles") ?? {
      canList: false,
      canAdd: false,
      canEdit: false,
      canDelete: false,
    };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">User Roles</h1>
          <p className="text-sm text-slate-400">
            Manage role definitions and fine-grained permissions per module.
          </p>
        </div>
      </div>
      <RoleManager roles={roles} modules={schema.MODULES} ability={ability} />
    </div>
  );
}

