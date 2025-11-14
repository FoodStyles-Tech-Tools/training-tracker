"use server";

import { eq, and } from "drizzle-orm";
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
      responseDue: toDateOnly(parsed.responseDue), // DATE only, no timezone
      responseDate: toDateOnly(parsed.responseDate), // DATE only, no timezone
      inQueueDate: toDateOnly(parsed.inQueueDate), // DATE only, no timezone
      definiteAnswer: parsed.definiteAnswer,
      noFollowUpDate: toDateOnly(parsed.noFollowUpDate), // DATE only, no timezone
      followUpDate: toDateOnly(parsed.followUpDate), // DATE only, no timezone
      updatedAt: new Date(),
    };

    // If status is being updated to "In Queue" (2) and it wasn't already "In Queue", set inQueueDate to today
    if (parsed.status === 2 && currentRequest?.status !== 2 && !parsed.inQueueDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      updateData.inQueueDate = toDateOnly(today);
    }

    await db
      .update(schema.trainingRequest)
      .set(updateData)
      .where(eq(schema.trainingRequest.id, parsed.id));

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

