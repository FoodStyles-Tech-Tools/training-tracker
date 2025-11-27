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
    const { sessionNumber, sessionDate } = body;

    if (!sessionNumber || typeof sessionNumber !== "number") {
      return NextResponse.json(
        { error: "sessionNumber is required and must be a number" },
        { status: 400 },
      );
    }

    // Get batch to verify it exists
    const batch = await db.query.trainingBatch.findFirst({
      where: eq(schema.trainingBatch.id, id),
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    // Get or create the session
    let sessionData = await db.query.trainingBatchSessions.findFirst({
      where: and(
        eq(schema.trainingBatchSessions.trainingBatchId, id),
        eq(schema.trainingBatchSessions.sessionNumber, sessionNumber),
      ),
    });

    if (!sessionData) {
      // Create session if it doesn't exist
      const [newSession] = await db
        .insert(schema.trainingBatchSessions)
        .values({
          trainingBatchId: id,
          sessionNumber: sessionNumber,
          sessionDate: sessionDate ? new Date(sessionDate) : null,
        })
        .returning();

      return NextResponse.json({ success: true, session: newSession });
    } else {
      // Update existing session
      await db
        .update(schema.trainingBatchSessions)
        .set({
          sessionDate: sessionDate ? new Date(sessionDate) : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.trainingBatchSessions.trainingBatchId, id),
            eq(schema.trainingBatchSessions.sessionNumber, sessionNumber),
          ),
        );

      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error("Error updating session date:", error);
    return NextResponse.json(
      { error: "Failed to update session date" },
      { status: 500 },
    );
  }
}

