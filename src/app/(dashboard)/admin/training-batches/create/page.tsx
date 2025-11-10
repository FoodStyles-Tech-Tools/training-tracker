import { Suspense } from "react";
import { eq, and } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { ensurePermission } from "@/lib/permissions";
import { TrainingBatchForm } from "../training-batch-form";

export default async function CreateTrainingBatchPage() {
  const session = await requireSession();
  await ensurePermission(session.user.id, "training_batch", "add");

  // Get all competencies for selection
  const competencies = await db.query.competencies.findMany({
    where: and(eq(schema.competencies.isDeleted, false), eq(schema.competencies.status, 1)),
    with: {
      levels: {
        where: eq(schema.competencyLevels.isDeleted, false),
        orderBy: schema.competencyLevels.name,
      },
    },
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
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Create Training Batch</h1>
            <p className="text-sm text-slate-400">
              Create a new training batch and assign learners.
            </p>
          </div>
        </div>
        <TrainingBatchForm competencies={competencies} trainers={trainers} />
      </div>
    </Suspense>
  );
}

