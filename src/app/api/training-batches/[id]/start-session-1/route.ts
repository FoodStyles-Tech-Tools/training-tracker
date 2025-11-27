import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";

import { db, schema } from "@/db";
import { PermissionError, ensurePermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensurePermission(session.user.id, "training_batch", "edit");
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const { id } = await params;

  try {
    // Get batch info
    const batch = await db.query.trainingBatch.findFirst({
      where: eq(schema.trainingBatch.id, id),
      with: {
        sessions: {
          where: eq(schema.trainingBatchSessions.sessionNumber, 1),
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    // Check if Session 1 already has a date (already started)
    const session1 = batch.sessions.find((s) => s.sessionNumber === 1);
    if (session1?.sessionDate) {
      // Session 1 already started, status should already be updated
      return NextResponse.json({ success: true, message: "Session 1 already started" });
    }

    // Get all batch learners with their training request IDs
    const batchLearners = await db.query.trainingBatchLearners.findMany({
      where: eq(schema.trainingBatchLearners.trainingBatchId, id),
    });

    if (batchLearners.length > 0) {
      const trainingRequestIds = batchLearners
        .map((bl) => bl.trainingRequestId)
        .filter((id): id is string => id !== null);

      if (trainingRequestIds.length > 0) {
        // Update all training requests to "In Progress" (status 4)
        await db
          .update(schema.trainingRequest)
          .set({
            status: 4, // In Progress
            updatedAt: new Date(),
          })
          .where(inArray(schema.trainingRequest.id, trainingRequestIds));
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error starting session 1:", error);
    return NextResponse.json(
      { error: "Failed to start session 1" },
      { status: 500 },
    );
  }
}

