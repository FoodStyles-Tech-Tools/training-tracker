"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, schema } from "@/db";
import { ensurePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/utils-server";
import { requireSession } from "@/lib/session";

const parUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.number().int().min(0).max(4).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  responseDate: z.date().optional().nullable(),
  projectName: z.string().max(255).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  definiteAnswer: z.boolean().optional().nullable(),
  noFollowUpDate: z.date().optional().nullable(),
  followUpDate: z.date().optional().nullable(),
});

function toDateOnly(date: Date | null | undefined): Date | null {
  if (!date) return null;
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  return new Date(Date.UTC(year, month, day));
}

export async function updateProjectAssignmentRequestAction(
  input: z.infer<typeof parUpdateSchema>,
) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "project_assignment_request", "edit");

  const parsed = parUpdateSchema.parse(input);

  try {
    const currentPar = await db.query.projectAssignmentRequest.findFirst({
      where: eq(schema.projectAssignmentRequest.id, parsed.id),
    });

    if (!currentPar) {
      return { success: false, error: "Project assignment request not found" };
    }

    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (parsed.status !== undefined) {
      updateValues.status = parsed.status;
    }
    if (parsed.assignedTo !== undefined) {
      updateValues.assignedTo = parsed.assignedTo;
    }
    if (parsed.responseDate !== undefined) {
      updateValues.responseDate = toDateOnly(parsed.responseDate);
    }
    if (parsed.projectName !== undefined) {
      updateValues.projectName = parsed.projectName;
    }
    if (parsed.description !== undefined) {
      updateValues.description = parsed.description;
    }
    if (parsed.definiteAnswer !== undefined) {
      updateValues.definiteAnswer = parsed.definiteAnswer;
    }
    if (parsed.noFollowUpDate !== undefined) {
      updateValues.noFollowUpDate = toDateOnly(parsed.noFollowUpDate);
    }
    if (parsed.followUpDate !== undefined) {
      updateValues.followUpDate = toDateOnly(parsed.followUpDate);
    }

    await db
      .update(schema.projectAssignmentRequest)
      .set(updateValues)
      .where(eq(schema.projectAssignmentRequest.id, parsed.id));

    const updatedPar = await db.query.projectAssignmentRequest.findFirst({
      where: eq(schema.projectAssignmentRequest.id, parsed.id),
      with: {
        learner: {
          columns: {
            id: true,
            name: true,
          },
        },
        competencyLevel: {
          columns: {
            name: true,
          },
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

    if (updatedPar) {
      await logActivity({
        userId: session.user.id,
        module: "project_assignment_request",
        action: "edit",
        data: {
          parId: updatedPar.parId,
          learnerId: updatedPar.learnerUserId,
          learnerName: updatedPar.learner?.name,
          competencyLevelId: updatedPar.competencyLevelId,
          competencyName: updatedPar.competencyLevel?.competency?.name,
          levelName: updatedPar.competencyLevel?.name,
          ...parsed,
        },
      });
    }

    revalidatePath("/admin/project-assignment-request");

    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update project assignment request" };
  }
}

