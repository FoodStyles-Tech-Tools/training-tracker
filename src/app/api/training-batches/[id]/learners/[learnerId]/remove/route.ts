import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

import { db, schema } from "@/db";
import { PermissionError, ensurePermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; learnerId: string }> },
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

  const { id, learnerId } = await params;

  try {
    await db.transaction(async (tx) => {
      // Get the batch learner record
      const batchLearner = await tx.query.trainingBatchLearners.findFirst({
        where: and(
          eq(schema.trainingBatchLearners.trainingBatchId, id),
          eq(schema.trainingBatchLearners.learnerUserId, learnerId),
        ),
        with: {
          trainingRequest: true,
        },
      });

      if (!batchLearner) {
        throw new Error("Learner not found in batch");
      }

      // Remove learner from batch
      await tx
        .delete(schema.trainingBatchLearners)
        .where(
          and(
            eq(schema.trainingBatchLearners.trainingBatchId, id),
            eq(schema.trainingBatchLearners.learnerUserId, learnerId),
          ),
        );

      // Update training request status back to "In Queue" (2)
      await tx
        .update(schema.trainingRequest)
        .set({
          trainingBatchId: null,
          status: 2, // In Queue
          updatedAt: new Date(),
        })
        .where(eq(schema.trainingRequest.id, batchLearner.trainingRequestId));

      // Recalculate current participant and spot left
      const remainingLearners = await tx
        .select()
        .from(schema.trainingBatchLearners)
        .where(eq(schema.trainingBatchLearners.trainingBatchId, id));

      const batch = await tx.query.trainingBatch.findFirst({
        where: eq(schema.trainingBatch.id, id),
      });

      if (batch) {
        await tx
          .update(schema.trainingBatch)
          .set({
            currentParticipant: remainingLearners.length,
            spotLeft: batch.capacity - remainingLearners.length,
            updatedAt: new Date(),
          })
          .where(eq(schema.trainingBatch.id, id));
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing learner:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to remove learner" },
      { status: 500 },
    );
  }
}

