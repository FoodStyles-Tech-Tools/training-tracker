"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";

/**
 * Generate the next TR ID (e.g., TR01, TR02, etc.)
 * Uses PostgreSQL's atomic UPDATE to ensure thread-safe number generation
 */
async function generateTrId(): Promise<string> {
  // First, ensure the 'tr' module exists in custom_numbering
  const existing = await db.query.customNumbering.findFirst({
    where: eq(schema.customNumbering.module, "tr"),
  });

  if (!existing) {
    // Initialize with running_number = 0 (will be incremented to 1 for first TR ID)
    await db.insert(schema.customNumbering).values({
      module: "tr",
      runningNumber: 0,
    });
  }

  // Atomically increment and get the new number
  // First request will be TR01 (running_number becomes 1), second will be TR02, etc.
  const result = await db
    .update(schema.customNumbering)
    .set({
      runningNumber: sql`${schema.customNumbering.runningNumber} + 1`,
    })
    .where(eq(schema.customNumbering.module, "tr"))
    .returning({ runningNumber: schema.customNumbering.runningNumber });

  if (!result[0]) {
    throw new Error("Failed to generate TR ID");
  }

  const trNumber = result[0].runningNumber;
  return `TR${trNumber.toString().padStart(2, "0")}`;
}

export async function createTrainingRequestAction(competencyLevelId: string) {
  const session = await requireSession();

  try {
    // Check if user already has a training request for this competency level
    const existingRequest = await db.query.trainingRequest.findFirst({
      where: (tr, { and, eq }) =>
        and(
          eq(tr.learnerUserId, session.user.id),
          eq(tr.competencyLevelId, competencyLevelId),
        ),
    });

    if (existingRequest) {
      throw new Error("You already have a training request for this competency level");
    }

    // Generate TR ID
    const trId = await generateTrId();

    // Calculate requested date and response due (requested date + 1 day)
    const requestedDate = new Date();
    const responseDue = new Date(requestedDate);
    responseDue.setDate(responseDue.getDate() + 1);

    // Create training request
    const [trainingRequest] = await db
      .insert(schema.trainingRequest)
      .values({
        trId,
        requestedDate,
        learnerUserId: session.user.id,
        competencyLevelId,
        status: 0, // Not Started
        responseDue, // Auto-fill as requested date + 1 day
      })
      .returning();

    if (!trainingRequest) {
      throw new Error("Failed to create training request");
    }

    revalidatePath("/admin/learner-dashboard");
    return { success: true, trainingRequestId: trainingRequest.id, trId };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create training request" };
  }
}

