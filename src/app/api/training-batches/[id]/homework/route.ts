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
    const { sessionId, homework } = body; // homework is array of { learnerId, completed, homeworkUrl }

    if (!sessionId || !Array.isArray(homework)) {
      return NextResponse.json(
        { error: "sessionId and homework array are required" },
        { status: 400 },
      );
    }

    await db.transaction(async (tx) => {
      // Update homework for each learner
      for (const item of homework) {
        const { learnerId, completed, homeworkUrl } = item;

        // Check if homework record exists
        const existing = await tx.query.trainingBatchHomeworkSessions.findFirst({
          where: and(
            eq(schema.trainingBatchHomeworkSessions.trainingBatchId, id),
            eq(schema.trainingBatchHomeworkSessions.learnerUserId, learnerId),
            eq(schema.trainingBatchHomeworkSessions.sessionId, sessionId),
          ),
        });

        if (existing) {
          // Update existing record
          await tx
            .update(schema.trainingBatchHomeworkSessions)
            .set({
              completed: completed ?? false,
              homeworkUrl: homeworkUrl || null,
            })
            .where(
              and(
                eq(schema.trainingBatchHomeworkSessions.trainingBatchId, id),
                eq(schema.trainingBatchHomeworkSessions.learnerUserId, learnerId),
                eq(schema.trainingBatchHomeworkSessions.sessionId, sessionId),
              ),
            );
        } else {
          // Create new record
          await tx.insert(schema.trainingBatchHomeworkSessions).values({
            trainingBatchId: id,
            learnerUserId: learnerId,
            sessionId: sessionId,
            completed: completed ?? false,
            homeworkUrl: homeworkUrl || null,
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating homework:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to update homework" },
      { status: 500 },
    );
  }
}

