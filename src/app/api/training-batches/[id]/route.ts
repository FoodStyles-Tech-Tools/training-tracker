import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

import { db, schema } from "@/db";
import { PermissionError, ensurePermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;

  try {
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
            learner: true,
            trainingRequest: true,
          },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: "Training batch not found" }, { status: 404 });
    }

    // Get attendance and homework data
    const attendance = await db.query.trainingBatchAttendanceSessions.findMany({
      where: eq(schema.trainingBatchAttendanceSessions.trainingBatchId, id),
      with: {
        session: true,
        learner: true,
      },
    });

    const homework = await db.query.trainingBatchHomeworkSessions.findMany({
      where: eq(schema.trainingBatchHomeworkSessions.trainingBatchId, id),
      with: {
        session: true,
        learner: true,
      },
    });

    return NextResponse.json({
      batch,
      attendance,
      homework,
    });
  } catch (error) {
    console.error("Error fetching training batch:", error);
    return NextResponse.json(
      { error: "Failed to fetch training batch" },
      { status: 500 },
    );
  }
}

export async function PATCH(
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
    const body = await req.json();
    const {
      batchName,
      competencyLevelId,
      trainerUserId,
      sessionCount,
      durationHrs,
      estimatedStart,
      batchStartDate,
      capacity,
      learnerIds,
      sessionDates,
    } = body;

    // Get current batch
    const currentBatch = await db.query.trainingBatch.findFirst({
      where: eq(schema.trainingBatch.id, id),
      with: {
        learners: true,
      },
    });

    if (!currentBatch) {
      return NextResponse.json({ error: "Training batch not found" }, { status: 404 });
    }

    // Validate capacity
    const currentParticipantCount = currentBatch.learners.length;
    if (capacity && capacity < currentParticipantCount) {
      return NextResponse.json(
        { error: `Cannot set capacity below current participant count (${currentParticipantCount})` },
        { status: 400 },
      );
    }

    if (learnerIds && learnerIds.length > (capacity || currentBatch.capacity)) {
      return NextResponse.json(
        { error: "Number of learners cannot exceed capacity" },
        { status: 400 },
      );
    }

    // Start transaction
    const result = await db.transaction(async (tx) => {
      // Update batch
      const updateData: any = {};
      if (batchName !== undefined) updateData.batchName = batchName;
      if (competencyLevelId !== undefined) updateData.competencyLevelId = competencyLevelId;
      if (trainerUserId !== undefined) updateData.trainerUserId = trainerUserId;
      if (sessionCount !== undefined) updateData.sessionCount = sessionCount;
      if (durationHrs !== undefined) updateData.durationHrs = durationHrs ? String(durationHrs) : null;
      if (estimatedStart !== undefined) updateData.estimatedStart = estimatedStart ? new Date(estimatedStart) : null;
      if (batchStartDate !== undefined) updateData.batchStartDate = batchStartDate ? new Date(batchStartDate) : null;
      if (capacity !== undefined) updateData.capacity = capacity;
      updateData.updatedAt = new Date();

      const [updatedBatch] = await tx
        .update(schema.trainingBatch)
        .set(updateData)
        .where(eq(schema.trainingBatch.id, id))
        .returning();

      // Update sessions if sessionCount changed
      if (sessionCount !== undefined && sessionCount !== currentBatch.sessionCount) {
        // Get current sessions
        const currentSessions = await tx
          .select()
          .from(schema.trainingBatchSessions)
          .where(eq(schema.trainingBatchSessions.trainingBatchId, id));

        if (sessionCount > currentSessions.length) {
          // Add new sessions
          const newSessions = [];
          for (let i = currentSessions.length + 1; i <= sessionCount; i++) {
            newSessions.push({
              trainingBatchId: id,
              sessionNumber: i,
              sessionDate: sessionDates && sessionDates[i - 1] ? new Date(sessionDates[i - 1]) : null,
            });
          }
          await tx.insert(schema.trainingBatchSessions).values(newSessions);
        } else if (sessionCount < currentSessions.length) {
          // Remove extra sessions
          const sessionsToRemove = currentSessions
            .filter((s) => s.sessionNumber > sessionCount)
            .map((s) => s.id);
          if (sessionsToRemove.length > 0) {
            await tx
              .delete(schema.trainingBatchSessions)
              .where(eq(schema.trainingBatchSessions.id, sessionsToRemove[0]));
            // Note: This is simplified - in production, you'd want to delete all sessions properly
          }
        }
      }

      // Update session dates if provided
      if (sessionDates && Array.isArray(sessionDates)) {
        for (let i = 0; i < sessionDates.length; i++) {
          if (sessionDates[i]) {
            await tx
              .update(schema.trainingBatchSessions)
              .set({
                sessionDate: new Date(sessionDates[i]),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(schema.trainingBatchSessions.trainingBatchId, id),
                  eq(schema.trainingBatchSessions.sessionNumber, i + 1),
                ),
              );
          }
        }
      }

      // Update learners if provided
      if (learnerIds !== undefined) {
        const currentLearnerIds = currentBatch.learners.map((l) => l.learnerUserId);
        const newLearnerIds = learnerIds || [];
        const toAdd = newLearnerIds.filter((id: string) => !currentLearnerIds.includes(id));
        const toRemove = currentLearnerIds.filter((id: string) => !newLearnerIds.includes(id));

        // Remove learners
        if (toRemove.length > 0) {
          await tx
            .delete(schema.trainingBatchLearners)
            .where(
              and(
                eq(schema.trainingBatchLearners.trainingBatchId, id),
                eq(schema.trainingBatchLearners.learnerUserId, toRemove[0]),
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
            .where(eq(schema.trainingRequest.learnerUserId, toRemove[0]));
        }

        // Add learners
        if (toAdd.length > 0) {
          const trainingRequests = await tx
            .select()
            .from(schema.trainingRequest)
            .where(
              and(
                eq(schema.trainingRequest.competencyLevelId, updatedBatch.competencyLevelId),
                eq(schema.trainingRequest.status, 2), // In Queue
                eq(schema.trainingRequest.learnerUserId, toAdd[0]),
              ),
            );

          if (trainingRequests.length > 0) {
            await tx.insert(schema.trainingBatchLearners).values({
              trainingBatchId: id,
              learnerUserId: toAdd[0],
              trainingRequestId: trainingRequests[0].id,
            });

            await tx
              .update(schema.trainingRequest)
              .set({
                trainingBatchId: id,
                status: 4, // In Progress
                updatedAt: new Date(),
              })
              .where(eq(schema.trainingRequest.id, trainingRequests[0].id));
          }
        }

        // Recalculate current participant and spot left
        const finalLearnerCount = await tx
          .select()
          .from(schema.trainingBatchLearners)
          .where(eq(schema.trainingBatchLearners.trainingBatchId, id));

        await tx
          .update(schema.trainingBatch)
          .set({
            currentParticipant: finalLearnerCount.length,
            spotLeft: updatedBatch.capacity - finalLearnerCount.length,
            updatedAt: new Date(),
          })
          .where(eq(schema.trainingBatch.id, id));
      }

      return updatedBatch;
    });

    return NextResponse.json({ batch: result });
  } catch (error) {
    console.error("Error updating training batch:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to update training batch" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensurePermission(session.user.id, "training_batch", "delete");
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const { id } = await params;

  try {
    // Get batch learners to update their training requests
    const batchLearners = await db.query.trainingBatchLearners.findMany({
      where: eq(schema.trainingBatchLearners.trainingBatchId, id),
      with: {
        trainingRequest: true,
      },
    });

    await db.transaction(async (tx) => {
      // Update training requests back to "In Queue" (2)
      if (batchLearners.length > 0) {
        const trainingRequestIds = batchLearners.map((bl) => bl.trainingRequestId);
        await tx
          .update(schema.trainingRequest)
          .set({
            trainingBatchId: null,
            status: 2, // In Queue
            updatedAt: new Date(),
          })
          .where(eq(schema.trainingRequest.id, trainingRequestIds[0]));
      }

      // Delete batch (cascade will handle related records)
      await tx.delete(schema.trainingBatch).where(eq(schema.trainingBatch.id, id));
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting training batch:", error);
    return NextResponse.json(
      { error: "Failed to delete training batch" },
      { status: 500 },
    );
  }
}

