import { ReactNode } from "react";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import type { ModuleName } from "@/db/schema";
import { AdminShell } from "./admin-shell";
import { requireSession } from "@/lib/session";

const NAV_ITEMS: Array<{ label: string; href: string; module: ModuleName }> = [
  { label: "Dashboard", href: "/admin", module: "users" },
  { label: "Competencies", href: "/admin/competencies", module: "competencies" },
  { label: "Training Requests", href: "/admin/training-requests", module: "users" },
  { label: "Validation Project Approval", href: "/admin/validation-project-approval", module: "users" },
  { label: "Training Batches", href: "/admin/training-batches", module: "training_batch" },
  { label: "Users", href: "/admin/users", module: "users" },
  { label: "Roles", href: "/admin/roles", module: "roles" },
  { label: "Activity Log", href: "/admin/activity-log", module: "activity_log" },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireSession();

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, session.user.id),
    with: {
      role: true,
    },
  });

  if (!user) {
    return null;
  }

  const rolePermissions = user.roleId
    ? await db.query.rolePermissions.findMany({
        where: eq(schema.rolePermissions.roleId, user.roleId),
      })
    : [];

  const permissionMap = new Map<
    ModuleName,
    { canList: boolean; canAdd: boolean; canEdit: boolean; canDelete: boolean }
  >();

  rolePermissions.forEach((perm) => {
    permissionMap.set(perm.module, {
      canList: perm.canList,
      canAdd: perm.canAdd,
      canEdit: perm.canEdit,
      canDelete: perm.canDelete,
    });
  });

  const allowedNav = NAV_ITEMS.filter((item) =>
    permissionMap.get(item.module)?.canList ?? false,
  );

  const navItems = allowedNav.map((item) => ({
    label: item.label,
    href: item.href,
  }));

  return (
    <AdminShell
      user={{ name: user.name, roleName: user.role?.roleName ?? null }}
      navItems={navItems}
    >
      {children}
    </AdminShell>
  );
}
