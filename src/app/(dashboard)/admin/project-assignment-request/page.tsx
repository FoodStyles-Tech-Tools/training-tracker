import { desc, eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { ensurePermission } from "@/lib/permissions";
import { env } from "@/env";
import type { AssignableUser } from "./project-assignment-request-client";
import { ProjectAssignmentRequestClient } from "./project-assignment-request-client";

export default async function ProjectAssignmentRequestPage() {
  const session = await requireSession();
  await ensurePermission(session.user.id, "project_assignment_request", "list");

  // Get all project assignment requests with related data
  const parsData = await db.query.projectAssignmentRequest.findMany({
    with: {
      learner: true,
      competencyLevel: {
        with: {
          competency: true,
        },
      },
      assignedUser: true,
    },
    orderBy: desc(schema.projectAssignmentRequest.createdAt),
  });

  // Get all competencies for filter
  const competencies = await db.query.competencies.findMany({
    where: and(eq(schema.competencies.isDeleted, false), eq(schema.competencies.status, 1)),
    orderBy: schema.competencies.name,
  });

  // Parse status labels from environment variable
  const statusLabels = env.PAR_STATUS.split(",").map((s) => s.trim());

  const assignableUsersData = await db.query.users.findMany({
    with: {
      role: {
        columns: {
          roleName: true,
        },
      },
    },
    orderBy: schema.users.name,
  });

  const assignableUsers: AssignableUser[] = assignableUsersData.map((user) => ({
    id: user.id,
    name: user.name,
    roleName: user.role?.roleName ?? null,
  }));

  return (
    <ProjectAssignmentRequestClient
      pars={parsData}
      competencies={competencies}
      statusLabels={statusLabels}
      assignableUsers={assignableUsers}
    />
  );
}

