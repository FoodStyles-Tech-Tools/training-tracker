import { Suspense } from "react";
import { desc, eq, and } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { ensurePermission } from "@/lib/permissions";
import { env } from "@/env";
import { TrainingRequestManager } from "./training-request-manager";

export default async function TrainingRequestsPage() {
  const session = await requireSession();
  await ensurePermission(session.user.id, "training_request", "list");

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

  // Get all users with trainer role for assignment
  const allUsers = await db.query.users.findMany({
    with: {
      role: true,
    },
    orderBy: schema.users.name,
  });

  // Filter to only users with "trainer" role (case-insensitive)
  const users = allUsers.filter(
    (user) => user.role?.roleName?.toLowerCase() === "trainer",
  );

  // Parse status labels from environment variable
  const statusLabels = env.TRAINING_REQUEST_STATUS.split(",").map((s) => s.trim());

  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}>
      <TrainingRequestManager
        trainingRequests={trainingRequestsData}
        competencies={competencies}
        users={users}
        statusLabels={statusLabels}
      />
    </Suspense>
  );
}

