import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";

import { db, schema } from "@/db";
import { PermissionError, ensurePermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";
import { logActivity } from "@/lib/utils-server";

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
    const { sessionId, attendance } = body; // attendance is array of { learnerId, attended }

    if (!sessionId || !Array.isArray(attendance)) {
      return NextResponse.json(
        { error: "sessionId and attendance array are required" },
        { status: 400 },
      );
    }

    // Get batch and session data
    const batch = await db.query.trainingBatch.findFirst({
      where: eq(schema.trainingBatch.id, id),
      with: {
        sessions: {
          orderBy: (sessions, { asc }) => [asc(sessions.sessionNumber)],
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const sessionData = batch.sessions.find((s) => s.id === sessionId);
    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await db.transaction(async (tx) => {
      // Update attendance for each learner
      for (const item of attendance) {
        const { learnerId, attended } = item;

        // If marking as attended, validate that all previous sessions were attended
        if (attended && sessionData.sessionNumber > 1) {
          // Get all previous sessions
          const previousSessions = batch.sessions.filter(
            (s) => s.sessionNumber < sessionData.sessionNumber,
          );

          // Check attendance for all previous sessions
          for (const prevSession of previousSessions) {
            const prevAttendance = await tx.query.trainingBatchAttendanceSessions.findFirst({
              where: and(
                eq(schema.trainingBatchAttendanceSessions.trainingBatchId, id),
                eq(schema.trainingBatchAttendanceSessions.learnerUserId, learnerId),
                eq(schema.trainingBatchAttendanceSessions.sessionId, prevSession.id),
              ),
            });

            if (!prevAttendance || !prevAttendance.attended) {
              throw new Error(
                `Cannot mark attendance for Session ${sessionData.sessionNumber}. Learner must attend Session ${prevSession.sessionNumber} first.`,
              );
            }
          }
        }

        // Check if attendance record exists
        const existing = await tx.query.trainingBatchAttendanceSessions.findFirst({
          where: and(
            eq(schema.trainingBatchAttendanceSessions.trainingBatchId, id),
            eq(schema.trainingBatchAttendanceSessions.learnerUserId, learnerId),
            eq(schema.trainingBatchAttendanceSessions.sessionId, sessionId),
          ),
        });

        if (existing) {
          // Update existing record
          await tx
            .update(schema.trainingBatchAttendanceSessions)
            .set({ attended })
            .where(
              and(
                eq(schema.trainingBatchAttendanceSessions.trainingBatchId, id),
                eq(schema.trainingBatchAttendanceSessions.learnerUserId, learnerId),
                eq(schema.trainingBatchAttendanceSessions.sessionId, sessionId),
              ),
            );
        } else {
          // Create new record
          await tx.insert(schema.trainingBatchAttendanceSessions).values({
            trainingBatchId: id,
            learnerUserId: learnerId,
            sessionId: sessionId,
            attended,
          });
        }
      }

      // If this is Session 1, update training request status to "In Progress" (4)
      // Note: This is a safety check - status should already be updated when "Start Session" is clicked
      // But we update it here too in case attendance is saved directly without going through "Start Session"
      if (sessionData.sessionNumber === 1) {
        // Get all batch learners with their training request IDs
        const batchLearners = await tx.query.trainingBatchLearners.findMany({
          where: eq(schema.trainingBatchLearners.trainingBatchId, id),
        });

        if (batchLearners.length > 0) {
          const trainingRequestIds = batchLearners
            .map((bl) => bl.trainingRequestId)
            .filter((id): id is string => id !== null);

          if (trainingRequestIds.length > 0) {
            // Update all training requests to "In Progress" (status 4)
            // Only update if not already "In Progress" to avoid unnecessary updates
            await tx
              .update(schema.trainingRequest)
              .set({
                status: 4, // In Progress
                updatedAt: new Date(),
              })
              .where(
                and(
                  inArray(schema.trainingRequest.id, trainingRequestIds),
                  // Only update if status is not already "In Progress" (4)
                  // This prevents duplicate updates if status was already set when "Start Session" was clicked
                ),
              );
          }
        }
      }

      // If this is the last session and attendance is marked, update status to "Sessions Completed" (5)
      const isLastSession = sessionData.sessionNumber === batch.sessionCount;
      if (isLastSession) {
        // Get batch learners to find training request IDs
        const batchLearners = await tx.query.trainingBatchLearners.findMany({
          where: eq(schema.trainingBatchLearners.trainingBatchId, id),
        });

        // Create a map of learnerId to trainingRequestId
        const learnerToRequestMap = new Map(
          batchLearners.map((bl) => [bl.learnerUserId, bl.trainingRequestId]),
        );

        // Update training request status for each learner who attended the last session
        for (const item of attendance) {
          const { learnerId, attended } = item;

          if (attended) {
            const trainingRequestId = learnerToRequestMap.get(learnerId);
            if (trainingRequestId) {
              await tx
                .update(schema.trainingRequest)
                .set({
                  status: 5, // Sessions Completed
                  updatedAt: new Date(),
                })
                .where(eq(schema.trainingRequest.id, trainingRequestId));
            }
          }
        }
      }
    });

    // Batch is already fetched above

    // Log activity
    if (batch && sessionData) {
      await logActivity({
        userId: session.user.id,
        module: "training_batch",
        action: "edit",
        data: {
          batchId: batch.id,
          batchName: batch.batchName,
          action: "update_attendance",
          sessionId: sessionId,
          sessionNumber: sessionData.sessionNumber,
          attendanceCount: attendance.length,
          attendance, // Include full attendance data
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating attendance:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to update attendance" },
      { status: 500 },
    );
  }
}

