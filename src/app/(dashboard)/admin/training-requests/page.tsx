import { desc, eq, and } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { ensurePermission, getUserPermissions } from "@/lib/permissions";
import { env } from "@/env";
import { TrainingRequestManager } from "./training-request-manager";

export default async function TrainingRequestsPage() {
  const session = await requireSession();
  await ensurePermission(session.user.id, "training_request", "list");
  
  const permissions = await getUserPermissions(session.user.id);
  const canEdit = permissions.get("training_request")?.canEdit ?? false;

  // Get all training requests with related data
  const trainingRequestsData = await db.query.trainingRequest.findMany({
    with: {
      learner: true,
      competencyLevel: {
        with: {
          competency: true,
        },
      },
      assignedUser: true,
      trainingBatch: {
        with: {
          trainer: true,
        },
      },
    },
    orderBy: desc(schema.trainingRequest.createdAt),
  });

  // Get all competencies for filter
  const competencies = await db.query.competencies.findMany({
    where: and(eq(schema.competencies.isDeleted, false), eq(schema.competencies.status, 1)),
    orderBy: schema.competencies.name,
  });

  // Get all users with role and trainer competencies for assignment
  const usersWithRelations = await db.query.users.findMany({
    with: {
      role: true,
      trainerCompetencies: {
        with: {
          competency: true,
        },
      },
    },
    orderBy: schema.users.name,
  });
  
  const users = usersWithRelations.map((user) => ({
    id: user.id,
    name: user.name,
    role: user.role?.roleName ?? null,
    competencyIds:
      user.trainerCompetencies?.map((tc) => tc.competencyId).filter(Boolean) ?? [],
  }));
  
  // Explicitly serialize to ensure all data is passed to client
  const serializedUsers = JSON.parse(JSON.stringify(users));

  // Parse status labels from environment variable
  const statusLabels = env.TRAINING_REQUEST_STATUS.split(",").map((s) => s.trim());

  return (
    <TrainingRequestManager
      trainingRequests={trainingRequestsData}
      competencies={competencies}
      users={serializedUsers}
      statusLabels={statusLabels}
      canEdit={canEdit}
    />
  );
}

