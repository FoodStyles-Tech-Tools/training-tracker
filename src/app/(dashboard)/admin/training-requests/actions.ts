"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";

const trainingRequestUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.number().int().min(0).max(7).optional(),
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

export async function updateTrainingRequestAction(
  input: z.infer<typeof trainingRequestUpdateSchema>,
) {
  const session = await requireSession();

  const parsed = trainingRequestUpdateSchema.parse(input);

  try {
    await db
      .update(schema.trainingRequest)
      .set({
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
        definiteAnswer: parsed.definiteAnswer,
        noFollowUpDate: toDateOnly(parsed.noFollowUpDate), // DATE only, no timezone
        followUpDate: toDateOnly(parsed.followUpDate), // DATE only, no timezone
        updatedAt: new Date(),
      })
      .where(eq(schema.trainingRequest.id, parsed.id));

    revalidatePath("/admin/training-requests");
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update training request" };
  }
}

