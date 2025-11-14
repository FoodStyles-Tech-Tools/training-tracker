"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { ensurePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/utils-server";

const vsrUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.number().int().min(0).max(4).optional(),
  validatorOps: z.string().uuid().optional().nullable(),
  validatorTrainer: z.string().uuid().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
  scheduledDate: z.date().optional().nullable(),
  responseDue: z.date().optional().nullable(),
  responseDate: z.date().optional().nullable(),
  definiteAnswer: z.boolean().optional().nullable(),
  noFollowUpDate: z.date().optional().nullable(),
  followUpDate: z.date().optional().nullable(),
  description: z.string().optional().nullable(),
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

export async function getVSRById(id: string) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "validation_schedule_request", "list");

  try {
    const vsr = await db.query.validationScheduleRequest.findFirst({
      where: eq(schema.validationScheduleRequest.id, id),
      with: {
        learner: true,
        competencyLevel: {
          with: {
            competency: true,
          },
        },
        validatorOpsUser: true,
        validatorTrainerUser: true,
        assignedUser: true,
      },
    });

    if (!vsr) {
      return { success: false, error: "VSR not found" };
    }

    return { success: true, data: vsr };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch VSR" };
  }
}

export async function getEligibleUsersForAssignment(competencyId?: string) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "validation_schedule_request", "list");

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

export async function updateVSRAction(
  input: z.infer<typeof vsrUpdateSchema>,
) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "validation_schedule_request", "edit");

  const parsed = vsrUpdateSchema.parse(input);

  try {
    // Get the current VSR record
    const currentVSR = await db.query.validationScheduleRequest.findFirst({
      where: eq(schema.validationScheduleRequest.id, parsed.id),
    });

    if (!currentVSR) {
      return { success: false, error: "VSR not found" };
    }

    // Determine assignedTo value:
    // - If assignedTo in database is empty/null, use provided value or set to current logged-in user
    // - If assignedTo in database exists, preserve it (don't change)
    const assignedToValue = currentVSR.assignedTo 
      ? currentVSR.assignedTo  // Preserve existing value
      : (parsed.assignedTo || session.user.id);  // Use provided value or set to current user if empty

    // Update the VSR record
    await db
      .update(schema.validationScheduleRequest)
      .set({
        status: parsed.status,
        validatorOps: parsed.validatorOps,
        validatorTrainer: parsed.validatorTrainer,
        assignedTo: assignedToValue,
        scheduledDate: parsed.scheduledDate,
        responseDue: toDateOnly(parsed.responseDue),
        responseDate: toDateOnly(parsed.responseDate),
        definiteAnswer: parsed.definiteAnswer,
        noFollowUpDate: toDateOnly(parsed.noFollowUpDate),
        followUpDate: toDateOnly(parsed.followUpDate),
        description: parsed.description,
        updatedAt: new Date(),
      })
      .where(eq(schema.validationScheduleRequest.id, parsed.id));

    // Create log entry
    const finalStatus = parsed.status ?? currentVSR.status;
    await db.insert(schema.validationScheduleRequestLog).values({
      vsrId: currentVSR.vsrId,
      status: finalStatus,
      updatedBy: session.user.id,
    });

    // Get VSR info for activity log
    const vsr = await db.query.validationScheduleRequest.findFirst({
      where: eq(schema.validationScheduleRequest.id, parsed.id),
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
    if (vsr) {
      await logActivity({
        userId: session.user.id,
        module: "validation_schedule_request",
        action: "edit",
        data: {
          vsrId: vsr.id,
          vsrIdString: vsr.vsrId,
          learnerId: vsr.learnerUserId,
          learnerName: vsr.learner?.name,
          competencyLevelId: vsr.competencyLevelId,
          competencyName: vsr.competencyLevel?.competency?.name,
          levelName: vsr.competencyLevel?.name,
          ...parsed, // Include all submitted fields
        },
      });
    }

    // If status is changing to Pass (4), update Training Request to Training Complete (8)
    const isPassing = finalStatus === 4 && currentVSR.status !== 4;
    if (isPassing && currentVSR.trId) {
      // Find Training Request by trId
      const trainingRequest = await db.query.trainingRequest.findFirst({
        where: eq(schema.trainingRequest.trId, currentVSR.trId),
      });

      if (trainingRequest) {
        // Update Training Request status to 8 (Training Complete)
        await db
          .update(schema.trainingRequest)
          .set({
            status: 8, // Training Complete
            updatedAt: new Date(),
          })
          .where(eq(schema.trainingRequest.id, trainingRequest.id));
      }
    }

    // If status is changing to Fail (3), update VPA to Resubmit for Re-validation (3)
    const isFailing = finalStatus === 3 && currentVSR.status !== 3;
    if (isFailing && currentVSR.trId) {
      // Find VPA by trId
      const vpa = await db.query.validationProjectApproval.findFirst({
        where: eq(schema.validationProjectApproval.trId, currentVSR.trId),
      });

      if (vpa) {
        // Update VPA status to 3 (Resubmit for Re-validation)
        await db
          .update(schema.validationProjectApproval)
          .set({
            status: 3, // Resubmit for Re-validation
            updatedAt: new Date(),
          })
          .where(eq(schema.validationProjectApproval.id, vpa.id));

        // Create log entry for VPA
        await db.insert(schema.validationProjectApprovalLog).values({
          vpaId: vpa.vpaId,
          status: 3,
          projectDetailsText: vpa.projectDetails,
          rejectionReason: null,
          updatedBy: session.user.id,
        });
      }
    }

    // Don't revalidate to avoid page refresh - state is updated locally
    // revalidatePath("/admin/validation-schedule-request");
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update validation schedule request" };
  }
}

export async function deleteVSRAction(vsrId: string) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "validation_schedule_request", "delete");

  try {
    // Get VSR info for logging before deletion
    const vsr = await db.query.validationScheduleRequest.findFirst({
      where: eq(schema.validationScheduleRequest.vsrId, vsrId),
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

    if (!vsr) {
      return { success: false, error: "VSR not found" };
    }

    // Delete VSR logs first
    await db
      .delete(schema.validationScheduleRequestLog)
      .where(eq(schema.validationScheduleRequestLog.vsrId, vsrId));

    // Delete VSR
    await db
      .delete(schema.validationScheduleRequest)
      .where(eq(schema.validationScheduleRequest.vsrId, vsrId));

    // Log activity
    if (vsr) {
      await logActivity({
        userId: session.user.id,
        module: "validation_schedule_request",
        action: "delete",
        data: {
          vsrId: vsr.id,
          vsrIdString: vsr.vsrId,
          learnerId: vsr.learnerUserId,
          learnerName: vsr.learner?.name,
          competencyLevelId: vsr.competencyLevelId,
          competencyName: vsr.competencyLevel?.competency?.name,
          levelName: vsr.competencyLevel?.name,
        },
      });
    }

    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to delete validation schedule request" };
  }
}

