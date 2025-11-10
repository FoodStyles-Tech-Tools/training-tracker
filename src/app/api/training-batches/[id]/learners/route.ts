import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

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
    const learners = await db.query.trainingBatchLearners.findMany({
      where: eq(schema.trainingBatchLearners.trainingBatchId, id),
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
    });

    return NextResponse.json({
      learners: learners.map((l) => ({
        id: l.learner.id,
        name: l.learner.name,
        email: l.learner.email,
        trainingRequestId: l.trainingRequest.id,
        status: l.trainingRequest.status,
      })),
    });
  } catch (error) {
    console.error("Error fetching learners:", error);
    return NextResponse.json(
      { error: "Failed to fetch learners" },
      { status: 500 },
    );
  }
}

