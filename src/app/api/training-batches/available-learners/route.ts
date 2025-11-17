import { NextRequest, NextResponse } from "next/server";
import { eq, and, notInArray, isNull, ne, inArray } from "drizzle-orm";

import { db, schema } from "@/db";
import { PermissionError, ensurePermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";
import { ALLOWED_TRAINING_REQUEST_STATUSES } from "@/app/(dashboard)/admin/training-batches/constants";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensurePermission(session.user.id, "training_batch", "list");
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const searchParams = req.nextUrl.searchParams;
  const competencyLevelId = searchParams.get("competencyLevelId");
  const batchId = searchParams.get("batchId"); // For editing - include existing learners

  if (!competencyLevelId) {
    return NextResponse.json(
      { error: "competencyLevelId is required" },
      { status: 400 },
    );
  }

  try {
    // Get learners with training requests in allowed statuses:
    // Status 2 = In Queue, 3 = No batch match, 6 = On Hold, 7 = Drop off
    // for the specified competency level
    // Exclude learners already in batches for this competency level
    const trainingRequests = await db
      .select({
        id: schema.trainingRequest.id,
        learnerUserId: schema.trainingRequest.learnerUserId,
        learner: {
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
        },
      })
      .from(schema.trainingRequest)
      .innerJoin(
        schema.users,
        eq(schema.trainingRequest.learnerUserId, schema.users.id),
      )
      .where(
        and(
          eq(schema.trainingRequest.competencyLevelId, competencyLevelId),
          inArray(schema.trainingRequest.status, ALLOWED_TRAINING_REQUEST_STATUSES),
          isNull(schema.trainingRequest.trainingBatchId), // Not already in a batch
        ),
      );

    // Get learners already in batches for this competency level
    // If batchId is provided, exclude learners from OTHER batches (not the current one being edited)
    const learnersInBatches = await db
      .select({
        learnerUserId: schema.trainingBatchLearners.learnerUserId,
      })
      .from(schema.trainingBatchLearners)
      .innerJoin(
        schema.trainingBatch,
        eq(schema.trainingBatchLearners.trainingBatchId, schema.trainingBatch.id),
      )
      .where(
        batchId
          ? and(
              eq(schema.trainingBatch.competencyLevelId, competencyLevelId),
              ne(schema.trainingBatch.id, batchId), // Exclude learners from OTHER batches (not current)
            )
          : eq(schema.trainingBatch.competencyLevelId, competencyLevelId),
      );

    const learnerIdsInBatches = new Set(
      learnersInBatches.map((l) => l.learnerUserId),
    );

    // Filter out learners already in batches (excluding current batch if editing)
    let availableLearners = trainingRequests
      .filter((tr) => !learnerIdsInBatches.has(tr.learnerUserId))
      .map((tr) => ({
        id: tr.learner.id,
        name: tr.learner.name,
        email: tr.learner.email,
        trainingRequestId: tr.id,
      }));

    // If editing (batchId provided), include existing learners from this batch
    if (batchId) {
      const existingBatchLearners = await db.query.trainingBatchLearners.findMany({
        where: eq(schema.trainingBatchLearners.trainingBatchId, batchId),
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
            },
          },
        },
      });

      // Add existing learners to available learners
      const existingLearners = existingBatchLearners.map((bl) => ({
        id: bl.learner.id,
        name: bl.learner.name,
        email: bl.learner.email,
        trainingRequestId: bl.trainingRequestId,
      }));

      // Merge and deduplicate - existing learners first, then new ones
      const existingLearnerIds = new Set(existingLearners.map((l) => l.id));
      availableLearners = [
        ...existingLearners,
        ...availableLearners.filter((l) => !existingLearnerIds.has(l.id)),
      ];
    }

    return NextResponse.json({ learners: availableLearners });
  } catch (error) {
    console.error("Error fetching available learners:", error);
    return NextResponse.json(
      { error: "Failed to fetch available learners" },
      { status: 500 },
    );
  }
}

