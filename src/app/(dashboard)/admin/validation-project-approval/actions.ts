"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { ensurePermission } from "@/lib/permissions";

/**
 * Generate the next VSR ID (e.g., VSR01, VSR02, etc.)
 * Uses PostgreSQL's atomic UPDATE to ensure thread-safe number generation
 */
async function generateVSRId(): Promise<string> {
  // First, ensure the 'vsr' module exists in custom_numbering
  const existing = await db.query.customNumbering.findFirst({
    where: eq(schema.customNumbering.module, "vsr"),
  });

  if (!existing) {
    // Initialize with running_number = 0 (will be incremented to 1 for first VSR ID)
    await db.insert(schema.customNumbering).values({
      module: "vsr",
      runningNumber: 0,
    });
  }

  // Atomically increment and get the new number
  // First request will be VSR01 (running_number becomes 1), second will be VSR02, etc.
  const result = await db
    .update(schema.customNumbering)
    .set({
      runningNumber: sql`${schema.customNumbering.runningNumber} + 1`,
    })
    .where(eq(schema.customNumbering.module, "vsr"))
    .returning({ runningNumber: schema.customNumbering.runningNumber });

  if (!result[0]) {
    throw new Error("Failed to generate VSR ID");
  }

  const vsrNumber = result[0].runningNumber;
  return `VSR${vsrNumber.toString().padStart(2, "0")}`;
}

const vpaUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.number().int().min(0).max(4).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  responseDue: z.date().optional().nullable(),
  responseDate: z.date().optional().nullable(),
  projectDetails: z.string().optional().nullable(),
  rejectionReason: z.string().optional().nullable(),
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

export async function getVPAById(id: string) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "validation_project_approval", "list");

  try {
    const vpa = await db.query.validationProjectApproval.findFirst({
      where: eq(schema.validationProjectApproval.id, id),
      with: {
        learner: true,
        competencyLevel: {
          with: {
            competency: true,
          },
        },
        assignedUser: true,
      },
    });

    if (!vpa) {
      return { success: false, error: "VPA not found" };
    }

    return { success: true, data: vpa };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch VPA" };
  }
}

export async function updateVPAAction(
  input: z.infer<typeof vpaUpdateSchema>,
) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "validation_project_approval", "edit");

  const parsed = vpaUpdateSchema.parse(input);

  try {
    // Get the current VPA record
    const currentVPA = await db.query.validationProjectApproval.findFirst({
      where: eq(schema.validationProjectApproval.id, parsed.id),
    });

    if (!currentVPA) {
      return { success: false, error: "VPA not found" };
    }

    // Determine assignedTo value:
    // - If assignedTo in database is empty/null, set it to current logged-in user
    // - If assignedTo in database exists, preserve it (don't change)
    const assignedToValue = currentVPA.assignedTo 
      ? currentVPA.assignedTo  // Preserve existing value
      : session.user.id;       // Set to current user if empty

    // Update the VPA record
    await db
      .update(schema.validationProjectApproval)
      .set({
        status: parsed.status,
        assignedTo: assignedToValue,
        responseDue: toDateOnly(parsed.responseDue),
        responseDate: toDateOnly(parsed.responseDate),
        projectDetails: parsed.projectDetails,
        rejectionReason: parsed.rejectionReason,
        updatedAt: new Date(),
      })
      .where(eq(schema.validationProjectApproval.id, parsed.id));

    // Create log entry
    const finalStatus = parsed.status ?? currentVPA.status;
    await db.insert(schema.validationProjectApprovalLog).values({
      vpaId: currentVPA.vpaId,
      status: finalStatus,
      projectDetailsText: parsed.projectDetails ?? currentVPA.projectDetails,
      rejectionReason: parsed.rejectionReason ?? (finalStatus === 2 ? currentVPA.rejectionReason : null),
      updatedBy: session.user.id,
    });

    // If status is changing to 1 (Approved), update existing VSR or create new one
    const wasApproved = finalStatus === 1 && currentVPA.status !== 1;
    if (wasApproved && currentVPA.trId) {
      // Find existing VSR with the same trId
      const existingVSR = await db.query.validationScheduleRequest.findFirst({
        where: eq(schema.validationScheduleRequest.trId, currentVPA.trId),
      });
      
      // Calculate requested date (today) and response due (today + 1 day)
      const requestedDate = new Date();
      requestedDate.setHours(0, 0, 0, 0); // Set to midnight
      const responseDue = new Date(requestedDate);
      responseDue.setDate(responseDue.getDate() + 1);
      
      if (existingVSR) {
        // Update existing VSR - reset to Pending Validation status
        await db
          .update(schema.validationScheduleRequest)
          .set({
            requestedDate,
            status: 0, // Pending Validation
            responseDue,
            description: currentVPA.projectDetails, // Update project details as description
            updatedAt: new Date(),
          })
          .where(eq(schema.validationScheduleRequest.id, existingVSR.id));
      } else {
        // Create new VSR if none exists
        const vsrId = await generateVSRId();
        
        await db.insert(schema.validationScheduleRequest).values({
          vsrId,
          trId: currentVPA.trId,
          requestedDate,
          learnerUserId: currentVPA.learnerUserId,
          competencyLevelId: currentVPA.competencyLevelId,
          status: 0, // Pending Validation
          responseDue,
          description: currentVPA.projectDetails, // Copy project details as description
        });
      }
    }

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

