import { ReactNode } from "react";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import type { ModuleName } from "@/db/schema";
import { AdminShell } from "./admin-shell";
import { requireSession } from "@/lib/session";

type NavItem = {
  label: string;
  href: string;
  module: ModuleName;
  requiresEdit?: boolean;
  alwaysVisible?: boolean;
  group: "learner" | "trainer" | "report" | "training_forum" | "settings";
};

const NAV_ITEMS: NavItem[] = [
  { label: "Learner Dashboard", href: "/admin/learner-dashboard", module: "users", alwaysVisible: true, group: "learner" },
  { label: "Request Log", href: "/admin/request-log", module: "training_request", requiresEdit: true, group: "report" },
  { label: "Waitlist", href: "/admin/waitlist", module: "training_request", group: "report" },
  { label: "Project Submission", href: "/admin/project-submission", module: "validation_project_approval", group: "report" },
  { label: "Project Assignment Request", href: "/admin/project-assignment-request", module: "project_assignment_request", group: "training_forum" },
  { label: "Competencies", href: "/admin/competencies", module: "competencies", group: "trainer" },
  { label: "Training Batches", href: "/admin/training-batches", module: "training_batch", group: "trainer" },
  { label: "Users", href: "/admin/users", module: "users", group: "settings" },
  { label: "Roles", href: "/admin/roles", module: "roles", group: "settings" },
  { label: "Activity Log", href: "/admin/activity-log", module: "activity_log", group: "settings" },
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

  const allowedNav = NAV_ITEMS.filter((item) => {
    // Always show items marked as alwaysVisible (e.g., Learner Dashboard)
    if (item.alwaysVisible) {
      return true;
    }
    // Special handling for Request Log - show if user has permission to view any of the three request types
    if (item.href === "/admin/request-log") {
      const canListTR = permissionMap.get("training_request")?.canList ?? false;
      const canListVPA = permissionMap.get("validation_project_approval")?.canList ?? false;
      const canListVSR = permissionMap.get("validation_schedule_request")?.canList ?? false;
      return canListTR || canListVPA || canListVSR;
    }
    // For other items, check canList permission
    return permissionMap.get(item.module)?.canList ?? false;
  });

  // Organize nav items into groups
  const navGroups = {
    learner: allowedNav.filter((item) => item.group === "learner").map((item) => ({
      label: item.label,
      href: item.href,
    })),
    trainer: allowedNav.filter((item) => item.group === "trainer").map((item) => ({
      label: item.label,
      href: item.href,
    })),
    report: allowedNav.filter((item) => item.group === "report").map((item) => ({
      label: item.label,
      href: item.href,
    })),
    training_forum: allowedNav.filter((item) => item.group === "training_forum").map((item) => ({
      label: item.label,
      href: item.href,
    })),
    settings: allowedNav.filter((item) => item.group === "settings").map((item) => ({
      label: item.label,
      href: item.href,
    })),
  };

  return (
    <AdminShell
      user={{ name: user.name, roleName: user.role?.roleName ?? null }}
      navGroups={navGroups}
    >
      {children}
    </AdminShell>
  );
}
