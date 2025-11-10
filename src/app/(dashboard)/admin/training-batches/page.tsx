import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { ensurePermission } from "@/lib/permissions";
import { TrainingBatchManager } from "./training-batch-manager";

export default async function TrainingBatchesPage() {
  const session = await requireSession();
  await ensurePermission(session.user.id, "training_batch", "list");

  // Get all training batches with related data
  const trainingBatchesData = await db.query.trainingBatch.findMany({
    with: {
      competencyLevel: {
        with: {
          competency: true,
        },
      },
      trainer: true,
      learners: {
        with: {
          learner: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: desc(schema.trainingBatch.createdAt),
  });

  // Get all competencies for filter
  const competencies = await db.query.competencies.findMany({
    where: eq(schema.competencies.isDeleted, false),
    orderBy: schema.competencies.name,
  });

  // Get all users with trainer role
  const allUsers = await db.query.users.findMany({
    with: {
      role: true,
    },
    orderBy: schema.users.name,
  });

  // Filter to only users with "trainer" role (case-insensitive)
  const trainers = allUsers.filter(
    (user) => user.role?.roleName?.toLowerCase() === "trainer",
  );

  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}>
      <TrainingBatchManager
        trainingBatches={trainingBatchesData}
        competencies={competencies}
        trainers={trainers}
      />
    </Suspense>
  );
}

