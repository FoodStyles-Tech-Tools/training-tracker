import { Suspense } from "react";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { ensurePermission } from "@/lib/permissions";
import { TrainingBatchForm } from "../../training-batch-form";
import { HomeworkTable } from "../../homework-table";
import { Button } from "@/components/ui/button";

export default async function EditTrainingBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "training_batch", "edit");

  const { id } = await params;

  // Get training batch with all related data
  const batch = await db.query.trainingBatch.findFirst({
    where: eq(schema.trainingBatch.id, id),
    with: {
      competencyLevel: {
        with: {
          competency: true,
        },
      },
      trainer: true,
      sessions: {
        orderBy: (sessions, { asc }) => [asc(sessions.sessionNumber)],
      },
      learners: {
        with: {
          learner: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
          trainingRequest: {
            columns: {
              id: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!batch) {
    notFound();
  }

  // Get all competencies for selection
  const competencies = await db.query.competencies.findMany({
    where: and(eq(schema.competencies.isDeleted, false), eq(schema.competencies.status, 1)),
    with: {
      levels: {
        where: eq(schema.competencyLevels.isDeleted, false),
        orderBy: schema.competencyLevels.name,
      },
      trainers: {
        with: {
          trainer: true,
        },
      },
    },
    orderBy: schema.competencies.name,
  });

  // Get all users with trainer role and their competency associations
  const allUsers = await db.query.users.findMany({
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

  // Filter to only users with "trainer" role (case-insensitive) and include their competency associations
  const trainers = allUsers
    .filter((user) => user.role?.roleName?.toLowerCase() === "trainer")
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      competencyIds: user.trainerCompetencies?.map((ct) => ct.competencyId) || [],
    }));

  // Get homework data
  const homework = await db.query.trainingBatchHomeworkSessions.findMany({
    where: eq(schema.trainingBatchHomeworkSessions.trainingBatchId, id),
    with: {
      session: true,
      learner: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
  });

  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Edit Training Batch</h1>
            <p className="text-sm text-slate-400">
              Edit training batch details, sessions, attendance, and homework.
            </p>
          </div>
        </div>
        <TrainingBatchForm
          batch={batch}
          competencies={competencies}
          trainers={trainers}
        />
        <HomeworkTable
          batch={batch}
          sessions={batch.sessions}
          learners={batch.learners.map((l) => l.learner)}
          homework={homework}
          disabled={!!batch.batchFinishDate}
        />

        {/* Save button - below homework */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link
            href="/admin/training-batches"
            className="inline-flex items-center justify-center rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-500 hover:text-blue-200"
          >
            Cancel
          </Link>
          <Button type="submit" form="training-batch-edit-form" disabled={!!batch.batchFinishDate}>
            Save
          </Button>
        </div>
      </div>
    </Suspense>
  );
}

