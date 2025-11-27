"use server";

import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { ensurePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/utils-server";

const trainingRequestUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.number().int().min(0).max(8).optional(),
  onHoldBy: z.number().int().optional().nullable(),
  onHoldReason: z.string().optional().nullable(),
  dropOffReason: z.string().optional().nullable(),
  isBlocked: z.boolean().optional(),
  blockedReason: z.string().optional().nullable(),
  expectedUnblockedDate: z.date().optional().nullable(),
  notes: z.string().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
  trainingBatchId: z.string().uuid().optional().nullable(),
  responseDue: z.date().optional().nullable(),
  responseDate: z.date().optional().nullable(),
  inQueueDate: z.date().optional().nullable(),
  definiteAnswer: z.boolean().optional().nullable(),
  noFollowUpDate: z.date().optional().nullable(),
  followUpDate: z.date().optional().nullable(),
});

// Helper function to convert Date to DATE only (no timezone, no time)
function toDateOnly(date: Date | null | undefined): Date | null | undefined {
  if (!date) return date;
  // Create a new date at UTC midnight to strip timezone and time
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  return new Date(Date.UTC(year, month, day));
}

export async function getTrainingRequestById(id: string) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "training_request", "list");

  try {
    const trainingRequest = await db.query.trainingRequest.findFirst({
      where: eq(schema.trainingRequest.id, id),
      with: {
        learner: true,
        competencyLevel: {
          with: {
            competency: true,
          },
        },
        assignedUser: true,
        trainingBatch: {
          with: {
            trainer: true,
          },
        },
      },
    });

    if (!trainingRequest) {
      return { success: false, error: "Training request not found" };
    }

    return { success: true, data: trainingRequest };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch training request" };
  }
}

export async function getEligibleUsersForAssignment(competencyId?: string) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "training_request", "list");

  try {
    // Get all users with role and trainer competencies
    const allUsers = await db.query.users.findMany({
      with: {
        role: true,
        trainerCompetencies: {
          with: {
            competency: true,
          },
        },
      },
      orderBy: schema.users.name,
    });

    // Map to simplified structure
    const users = allUsers.map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role?.roleName ?? null,
      competencyIds:
        user.trainerCompetencies?.map((tc) => tc.competencyId).filter(Boolean) ?? [],
    }));

    // Filter: Ops users + Trainers for the specific competency
    const eligibleUsers = users.filter((user) => {
      const roleLower = String(user.role ?? "").toLowerCase();
      if (roleLower === "ops") {
        return true;
      }
      if (roleLower === "trainer" && competencyId && user.competencyIds.includes(competencyId)) {
        return true;
      }
      return false;
    });

    return { success: true, data: eligibleUsers };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch eligible users" };
  }
}

export async function updateTrainingRequestAction(
  input: z.infer<typeof trainingRequestUpdateSchema>,
) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "training_request", "edit");

  const parsed = trainingRequestUpdateSchema.parse(input);

  try {
    // Get current training request to check if status is changing to "In Queue" (2)
    const currentRequest = await db
      .select()
      .from(schema.trainingRequest)
      .where(eq(schema.trainingRequest.id, parsed.id))
      .limit(1)
      .then((results) => results[0] || null);

    // Prepare update data
    const updateData: any = {
      status: parsed.status,
      onHoldBy: parsed.onHoldBy,
      onHoldReason: parsed.onHoldReason,
      dropOffReason: parsed.dropOffReason,
      isBlocked: parsed.isBlocked,
      blockedReason: parsed.blockedReason,
      expectedUnblockedDate: toDateOnly(parsed.expectedUnblockedDate),
      notes: parsed.notes,
      assignedTo: parsed.assignedTo,
      trainingBatchId: parsed.trainingBatchId,
      responseDue: toDateOnly(parsed.responseDue), // DATE only, no timezone
      responseDate: toDateOnly(parsed.responseDate), // DATE only, no timezone
      inQueueDate: toDateOnly(parsed.inQueueDate), // DATE only, no timezone
      definiteAnswer: parsed.definiteAnswer,
      noFollowUpDate: toDateOnly(parsed.noFollowUpDate), // DATE only, no timezone
      followUpDate: toDateOnly(parsed.followUpDate), // DATE only, no timezone
      updatedAt: new Date(),
    };

    // If trainingBatchId is being assigned and status is not explicitly set, set status to "In Queue" (2)
    if (parsed.trainingBatchId !== undefined && parsed.trainingBatchId !== null && parsed.status === undefined) {
      updateData.status = 2; // In Queue
    }

    // If status is being updated to "In Queue" (2) and it wasn't already "In Queue", set inQueueDate to today
    if (parsed.status === 2 && currentRequest?.status !== 2 && !parsed.inQueueDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      updateData.inQueueDate = toDateOnly(today);
    }

    // If trainingBatchId is being assigned and status is set to "In Queue" (2), set inQueueDate to today
    if (parsed.trainingBatchId !== undefined && parsed.trainingBatchId !== null && updateData.status === 2 && currentRequest?.status !== 2 && !parsed.inQueueDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      updateData.inQueueDate = toDateOnly(today);
    }

    // If status is being updated to "Drop Off" (7) and responseDue is not set, set it to +3 days from today
    if (parsed.status === 7 && !parsed.responseDue) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const responseDueDate = new Date(today);
      responseDueDate.setDate(responseDueDate.getDate() + 3);
      updateData.responseDue = toDateOnly(responseDueDate);
    }

    // If status is being changed TO a status where response date appears, clear the response date
    // Response date appears for: Looking for trainer (1), In Queue (2), No batch match (3), Drop Off (7)
    const statusesWithResponseDate = [1, 2, 3, 7];
    if (parsed.status !== undefined && 
        currentRequest && 
        parsed.status !== currentRequest.status && 
        statusesWithResponseDate.includes(parsed.status) && 
        currentRequest.responseDate) {
      updateData.responseDate = null;
    }

    // Handle batch assignment/unassignment
    const isAssigningBatch = parsed.trainingBatchId !== undefined && 
                             parsed.trainingBatchId !== null && 
                             currentRequest?.trainingBatchId !== parsed.trainingBatchId;
    const isUnassigningBatch = parsed.trainingBatchId === null && 
                                currentRequest?.trainingBatchId !== null;
    const oldBatchId = currentRequest?.trainingBatchId;

    // Use transaction if batch assignment/unassignment is involved
    if (isAssigningBatch || isUnassigningBatch) {
      await db.transaction(async (tx) => {
        // Update training request
        await tx
          .update(schema.trainingRequest)
          .set(updateData)
          .where(eq(schema.trainingRequest.id, parsed.id));

        if (isAssigningBatch && parsed.trainingBatchId) {
          // Check if learner is already in the batch
          const existingLearner = await tx.query.trainingBatchLearners.findFirst({
            where: and(
              eq(schema.trainingBatchLearners.trainingBatchId, parsed.trainingBatchId),
              eq(schema.trainingBatchLearners.learnerUserId, currentRequest!.learnerUserId),
            ),
          });

          // Add learner to batch if not already there
          if (!existingLearner) {
            await tx.insert(schema.trainingBatchLearners).values({
              trainingBatchId: parsed.trainingBatchId,
              learnerUserId: currentRequest!.learnerUserId,
              trainingRequestId: parsed.id,
            });

            // Update batch participant counts
            const batchLearners = await tx.query.trainingBatchLearners.findMany({
              where: eq(schema.trainingBatchLearners.trainingBatchId, parsed.trainingBatchId),
            });

            const batch = await tx.query.trainingBatch.findFirst({
              where: eq(schema.trainingBatch.id, parsed.trainingBatchId),
            });

            if (batch) {
              await tx
                .update(schema.trainingBatch)
                .set({
                  currentParticipant: batchLearners.length,
                  spotLeft: batch.capacity - batchLearners.length,
                  updatedAt: new Date(),
                })
                .where(eq(schema.trainingBatch.id, parsed.trainingBatchId));
            }
          }
        }

        if (isUnassigningBatch && oldBatchId) {
          // Remove learner from old batch
          await tx
            .delete(schema.trainingBatchLearners)
            .where(
              and(
                eq(schema.trainingBatchLearners.trainingBatchId, oldBatchId),
                eq(schema.trainingBatchLearners.learnerUserId, currentRequest!.learnerUserId),
              ),
            );

          // Update old batch participant counts
          const batchLearners = await tx.query.trainingBatchLearners.findMany({
            where: eq(schema.trainingBatchLearners.trainingBatchId, oldBatchId),
          });

          const batch = await tx.query.trainingBatch.findFirst({
            where: eq(schema.trainingBatch.id, oldBatchId),
          });

          if (batch) {
            await tx
              .update(schema.trainingBatch)
              .set({
                currentParticipant: batchLearners.length,
                spotLeft: batch.capacity - batchLearners.length,
                updatedAt: new Date(),
              })
              .where(eq(schema.trainingBatch.id, oldBatchId));
          }
        }
      });
    } else {
      // No batch assignment changes, just update the training request
      await db
        .update(schema.trainingRequest)
        .set(updateData)
        .where(eq(schema.trainingRequest.id, parsed.id));
    }

    // Get training request info for logging
    const trainingRequest = await db.query.trainingRequest.findFirst({
      where: eq(schema.trainingRequest.id, parsed.id),
      with: {
        learner: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        competencyLevel: {
          with: {
            competency: {
              columns: {
                name: true,
              },
            },
          },
        },
      },
    });

    // Log activity - capture all submitted data
    if (trainingRequest) {
      await logActivity({
        userId: session.user.id,
        module: "training_request",
        action: "edit",
        data: {
          trainingRequestId: parsed.id,
          trId: trainingRequest.trId,
          learnerId: trainingRequest.learnerUserId,
          learnerName: trainingRequest.learner?.name,
          competencyLevelId: trainingRequest.competencyLevelId,
          competencyName: trainingRequest.competencyLevel?.competency?.name,
          levelName: trainingRequest.competencyLevel?.name,
          ...parsed, // Include all submitted fields
        },
      });
    }

    // Don't revalidate to avoid page refresh - state is updated locally
    // revalidatePath("/admin/training-requests");
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update training request" };
  }
}

