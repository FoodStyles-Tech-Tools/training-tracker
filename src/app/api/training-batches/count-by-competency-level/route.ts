import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

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
    // Get all batches for this competency level
    const batches = await db.query.trainingBatch.findMany({
      where: eq(schema.trainingBatch.competencyLevelId, competencyLevelId),
      columns: {
        batchName: true,
      },
    });

    // Extract batch numbers from batch names (e.g., "Batch 1" -> 1, "Batch 2" -> 2)
    const batchNumbers: number[] = [];
    batches.forEach((batch) => {
      const match = batch.batchName.match(/^Batch\s+(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num)) {
          batchNumbers.push(num);
        }
      }
    });

    // Find the highest batch number
    const maxNumber = batchNumbers.length > 0 ? Math.max(...batchNumbers) : 0;

    return NextResponse.json({ count: maxNumber });
  } catch (error) {
    console.error("Error counting batches by competency level:", error);
    return NextResponse.json(
      { error: "Failed to count batches" },
      { status: 500 },
    );
  }
}

