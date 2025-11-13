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

/**
 * Generate the next VPA ID (e.g., VPA01, VPA02, etc.)
 * Uses PostgreSQL's atomic UPDATE to ensure thread-safe number generation
 */
async function generateVpaId(): Promise<string> {
  // First, ensure the 'vpa' module exists in custom_numbering
  const existing = await db.query.customNumbering.findFirst({
    where: eq(schema.customNumbering.module, "vpa"),
  });

  if (!existing) {
    // Initialize with running_number = 0 (will be incremented to 1 for first VPA ID)
    await db.insert(schema.customNumbering).values({
      module: "vpa",
      runningNumber: 0,
    });
  }

  // Atomically increment and get the new number
  // First request will be VPA01 (running_number becomes 1), second will be VPA02, etc.
  const result = await db
    .update(schema.customNumbering)
    .set({
      runningNumber: sql`${schema.customNumbering.runningNumber} + 1`,
    })
    .where(eq(schema.customNumbering.module, "vpa"))
    .returning({ runningNumber: schema.customNumbering.runningNumber });

  if (!result[0]) {
    throw new Error("Failed to generate VPA ID");
  }

  const vpaNumber = result[0].runningNumber;
  return `VPA${vpaNumber.toString().padStart(2, "0")}`;
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
        status: 1, // Status 1 (Looking for trainer - defined in env.TRAINING_REQUEST_STATUS)
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

export async function submitHomeworkAction(
  trainingBatchId: string,
  sessionId: string,
  homeworkUrl: string,
) {
  const session = await requireSession();

  try {
    // Validate URL format
    try {
      new URL(homeworkUrl);
    } catch {
      return { success: false, error: "Invalid URL format" };
    }

    // Verify the learner is part of this batch
    const batchLearner = await db.query.trainingBatchLearners.findFirst({
      where: (tbl, { and, eq }) =>
        and(
          eq(tbl.trainingBatchId, trainingBatchId),
          eq(tbl.learnerUserId, session.user.id),
        ),
    });

    if (!batchLearner) {
      return { success: false, error: "You are not part of this training batch" };
    }

    // Verify the session exists in this batch
    const sessionData = await db.query.trainingBatchSessions.findFirst({
      where: (tbs, { and, eq }) =>
        and(
          eq(tbs.trainingBatchId, trainingBatchId),
          eq(tbs.id, sessionId),
        ),
    });

    if (!sessionData) {
      return { success: false, error: "Session not found in this batch" };
    }

    // Upsert homework submission
    // Set completed to false - trainer will mark it as completed after checking
    await db
      .insert(schema.trainingBatchHomeworkSessions)
      .values({
        trainingBatchId,
        learnerUserId: session.user.id,
        sessionId,
        completed: false,
        homeworkUrl,
      })
      .onConflictDoUpdate({
        target: [
          schema.trainingBatchHomeworkSessions.trainingBatchId,
          schema.trainingBatchHomeworkSessions.learnerUserId,
          schema.trainingBatchHomeworkSessions.sessionId,
        ],
        set: {
          // Don't change completed status - only update the URL
          // Trainer will mark it as completed after checking
          homeworkUrl,
        },
      });

    revalidatePath("/admin/learner-dashboard");
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to submit homework" };
  }
}

export async function submitProjectAction(
  competencyLevelId: string,
  projectDetails: string,
) {
  const session = await requireSession();

  try {
    // Validate project details
    if (!projectDetails || projectDetails.trim() === "") {
      return { success: false, error: "Project details cannot be empty" };
    }

    // Get the training request for this competency level
    const trainingRequest = await db.query.trainingRequest.findFirst({
      where: (tr, { and, eq }) =>
        and(
          eq(tr.learnerUserId, session.user.id),
          eq(tr.competencyLevelId, competencyLevelId),
        ),
    });

    if (!trainingRequest) {
      return { success: false, error: "Training request not found for this competency level" };
    }

    // Check if project approval already exists
    const existingProjectApproval = await db.query.validationProjectApproval.findFirst({
      where: (vpa, { and, eq }) =>
        and(
          eq(vpa.learnerUserId, session.user.id),
          eq(vpa.competencyLevelId, competencyLevelId),
        ),
    });

    const requestedDate = new Date();
    const responseDue = new Date(requestedDate);
    responseDue.setDate(responseDue.getDate() + 1);

    let vpaId: string;
    let projectApprovalId: string;

    // Always set status to 0 (Pending Validation Project Approval) when submitting
    const submissionStatus = 0;

    if (existingProjectApproval) {
      // Update existing project approval
      vpaId = existingProjectApproval.vpaId;
      projectApprovalId = existingProjectApproval.id;

      await db
        .update(schema.validationProjectApproval)
        .set({
          projectDetails: projectDetails.trim(),
          status: submissionStatus, // 0 = Pending Validation Project Approval
          requestedDate,
          responseDue,
          responseDate: null, // Clear response date when resubmitting
          trId: trainingRequest.trId,
          updatedAt: new Date(),
        })
        .where(eq(schema.validationProjectApproval.id, existingProjectApproval.id));
    } else {
      // Create new project approval
      vpaId = await generateVpaId();

      const [newProjectApproval] = await db
        .insert(schema.validationProjectApproval)
        .values({
          vpaId,
          trId: trainingRequest.trId,
          requestedDate,
          learnerUserId: session.user.id,
          competencyLevelId,
          projectDetails: projectDetails.trim(),
          status: submissionStatus, // 0 = Pending Validation Project Approval
          responseDue,
        })
        .returning();

      if (!newProjectApproval) {
        throw new Error("Failed to create project approval");
      }

      projectApprovalId = newProjectApproval.id;
    }

    // Create log entry
    await db.insert(schema.validationProjectApprovalLog).values({
      vpaId,
      status: submissionStatus, // 1 = Pending Validation Project Approval
      projectDetailsText: projectDetails.trim(),
      updatedBy: session.user.id,
    });

    revalidatePath("/admin/learner-dashboard");
    return { success: true, vpaId };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to submit project" };
  }
}

