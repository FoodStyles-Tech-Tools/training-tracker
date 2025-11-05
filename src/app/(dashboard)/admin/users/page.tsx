import { asc } from "drizzle-orm";

import { db, schema } from "@/db";
import { ensurePermission, getUserPermissions } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

import { UserManager } from "./user-manager";

export default async function UsersPage() {
  const session = await requireSession();
  await ensurePermission(session.user.id, "users", "list");

  const users = await db.query.users.findMany({
    orderBy: asc(schema.users.createdAt),
    with: {
      role: true,
    },
  });

  const roles = await db.query.rolesList.findMany({
    orderBy: asc(schema.rolesList.roleName),
  });

  const permissions = await getUserPermissions(session.user.id);
  const ability =
    permissions.get("users") ?? {
      canList: false,
      canAdd: false,
      canEdit: false,
      canDelete: false,
    };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-slate-400">
            Invite teammates and manage their access levels across modules.
          </p>
        </div>
      </div>
      <UserManager users={users} roles={roles} ability={ability} />
    </div>
  );
}
