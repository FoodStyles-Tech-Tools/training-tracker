"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";

const vpaUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.number().int().min(0).max(4).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  responseDue: z.date().optional().nullable(),
  responseDate: z.date().optional().nullable(),
  projectDetails: z.string().optional().nullable(),
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

export async function updateVPAAction(
  input: z.infer<typeof vpaUpdateSchema>,
) {
  const session = await requireSession();

  const parsed = vpaUpdateSchema.parse(input);

  try {
    // Get the current VPA record
    const currentVPA = await db.query.validationProjectApproval.findFirst({
      where: eq(schema.validationProjectApproval.id, parsed.id),
    });

    if (!currentVPA) {
      return { success: false, error: "VPA not found" };
    }

    // Update the VPA record
    await db
      .update(schema.validationProjectApproval)
      .set({
        status: parsed.status,
        assignedTo: parsed.assignedTo,
        responseDue: toDateOnly(parsed.responseDue),
        responseDate: toDateOnly(parsed.responseDate),
        projectDetails: parsed.projectDetails,
        updatedAt: new Date(),
      })
      .where(eq(schema.validationProjectApproval.id, parsed.id));

    // Create log entry
    await db.insert(schema.validationProjectApprovalLog).values({
      vpaId: currentVPA.vpaId,
      status: parsed.status ?? currentVPA.status,
      projectDetailsText: parsed.projectDetails ?? currentVPA.projectDetails,
      updatedBy: session.user.id,
    });

    // Don't revalidate to avoid page refresh - state is updated locally
    // revalidatePath("/admin/validation-project-approval");
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update validation project approval" };
  }
}

