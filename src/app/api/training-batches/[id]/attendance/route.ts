import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

import { db, schema } from "@/db";
import { PermissionError, ensurePermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";

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

    await db.transaction(async (tx) => {
      // Update attendance for each learner
      for (const item of attendance) {
        const { learnerId, attended } = item;

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
    });

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

