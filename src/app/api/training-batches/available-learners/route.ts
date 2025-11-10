import { NextRequest, NextResponse } from "next/server";
import { eq, and, notInArray, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { PermissionError, ensurePermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";

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

  if (!competencyLevelId) {
    return NextResponse.json(
      { error: "competencyLevelId is required" },
      { status: 400 },
    );
  }

  try {
    // Get learners with training requests in "In Queue" status (status = 2)
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
          eq(schema.trainingRequest.status, 2), // In Queue
          isNull(schema.trainingRequest.trainingBatchId), // Not already in a batch
        ),
      );

    // Get learners already in batches for this competency level
    const learnersInBatches = await db
      .select({
        learnerUserId: schema.trainingBatchLearners.learnerUserId,
      })
      .from(schema.trainingBatchLearners)
      .innerJoin(
        schema.trainingBatch,
        eq(schema.trainingBatchLearners.trainingBatchId, schema.trainingBatch.id),
      )
      .where(eq(schema.trainingBatch.competencyLevelId, competencyLevelId));

    const learnerIdsInBatches = new Set(
      learnersInBatches.map((l) => l.learnerUserId),
    );

    // Filter out learners already in batches
    const availableLearners = trainingRequests
      .filter((tr) => !learnerIdsInBatches.has(tr.learnerUserId))
      .map((tr) => ({
        id: tr.learner.id,
        name: tr.learner.name,
        email: tr.learner.email,
        trainingRequestId: tr.id,
      }));

    return NextResponse.json({ learners: availableLearners });
  } catch (error) {
    console.error("Error fetching available learners:", error);
    return NextResponse.json(
      { error: "Failed to fetch available learners" },
      { status: 500 },
    );
  }
}

