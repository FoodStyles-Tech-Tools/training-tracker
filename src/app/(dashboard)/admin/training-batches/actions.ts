"use server";

import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { logActivity } from "@/lib/utils-server";

// Helper function to convert Date to DATE only (no timezone, no time)
function toDateOnly(date: Date | null | undefined): Date | null | undefined {
  if (!date) return date;
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  return new Date(Date.UTC(year, month, day));
}

const trainingBatchSchema = z.object({
  batchName: z.string().min(1, "Batch name is required"),
  competencyLevelId: z.string().uuid("Invalid competency level ID"),
  trainerUserId: z.string().uuid("Invalid trainer ID"),
  sessionCount: z.number().int().min(1, "Session count must be at least 1"),
  durationHrs: z.number().min(0).step(0.5).optional().nullable(),
  estimatedStart: z.date().optional().nullable(),
  batchStartDate: z.date().optional().nullable(),
  capacity: z.number().int().min(1, "Capacity must be at least 1"),
  learnerIds: z.array(z.string().uuid()),
  sessionDates: z.array(z.date().optional().nullable()),
});

const trainingBatchUpdateSchema = trainingBatchSchema.extend({
  id: z.string().uuid(),
}).partial().extend({
  id: z.string().uuid(),
  batchName: z.string().min(1).optional(),
  competencyLevelId: z.string().uuid().optional(),
  trainerUserId: z.string().uuid().optional(),
  sessionCount: z.number().int().min(1).optional(),
  capacity: z.number().int().min(1).optional(),
});

export type TrainingBatchFormInput = z.infer<typeof trainingBatchSchema>;
export type TrainingBatchUpdateInput = z.infer<typeof trainingBatchUpdateSchema>;

export async function createTrainingBatchAction(
  input: TrainingBatchFormInput,
) {
  const session = await requireSession();

  try {
    const parsed = trainingBatchSchema.parse(input);

    // Validate capacity vs learners
    if (parsed.learnerIds && parsed.learnerIds.length > parsed.capacity) {
      return {
        success: false,
        error: "Number of learners cannot exceed capacity",
      };
    }

    // Start transaction
    const result = await db.transaction(async (tx) => {
      // Create training batch
      const [batch] = await tx
        .insert(schema.trainingBatch)
        .values({
          batchName: parsed.batchName,
          competencyLevelId: parsed.competencyLevelId,
          trainerUserId: parsed.trainerUserId,
          sessionCount: parsed.sessionCount,
          durationHrs: parsed.durationHrs ? String(parsed.durationHrs) : null,
          estimatedStart: toDateOnly(parsed.estimatedStart),
          batchStartDate: toDateOnly(parsed.batchStartDate),
          capacity: parsed.capacity,
          currentParticipant: parsed.learnerIds?.length || 0,
          spotLeft: parsed.capacity - (parsed.learnerIds?.length || 0),
        })
        .returning();

      // Create sessions
      if (parsed.sessionCount > 0) {
        const sessions = [];
        for (let i = 0; i < parsed.sessionCount; i++) {
          sessions.push({
            trainingBatchId: batch.id,
            sessionNumber: i + 1,
            sessionDate: parsed.sessionDates && parsed.sessionDates[i]
              ? toDateOnly(parsed.sessionDates[i])
              : null,
          });
        }
        await tx.insert(schema.trainingBatchSessions).values(sessions);
      }

      // Add learners
      if (parsed.learnerIds && parsed.learnerIds.length > 0) {
        // Get training requests for these learners and competency level
        const trainingRequests = await tx
          .select()
          .from(schema.trainingRequest)
          .where(
            and(
              eq(schema.trainingRequest.competencyLevelId, parsed.competencyLevelId),
              eq(schema.trainingRequest.status, 2), // Status 2 (defined in env.TRAINING_REQUEST_STATUS)
              inArray(schema.trainingRequest.learnerUserId, parsed.learnerIds),
            ),
          );

        if (trainingRequests.length !== parsed.learnerIds.length) {
          throw new Error("Some learners do not have training requests in queue");
        }

        // Create batch learners
        const batchLearners = trainingRequests.map((tr) => ({
          trainingBatchId: batch.id,
          learnerUserId: tr.learnerUserId,
          trainingRequestId: tr.id,
        }));

        await tx.insert(schema.trainingBatchLearners).values(batchLearners);

        // Update training request status to "In Progress" (4)
        await tx
          .update(schema.trainingRequest)
          .set({
            trainingBatchId: batch.id,
            status: 4, // Status 4 (defined in env.TRAINING_REQUEST_STATUS)
            updatedAt: new Date(),
          })
          .where(
            inArray(
              schema.trainingRequest.id,
              trainingRequests.map((tr) => tr.id),
            ),
          );
      }

      return batch;
    });

    // Log activity
    await logActivity({
      userId: session.user.id,
      module: "training_batch",
      action: "add",
      data: {
        batchId: result.id,
        batchName: result.batchName,
        competencyLevelId: result.competencyLevelId,
        trainerUserId: result.trainerUserId,
        sessionCount: result.sessionCount,
        capacity: result.capacity,
        learnerCount: parsed.learnerIds?.length || 0,
      },
    });

    revalidatePath("/admin/training-batches");
    return { success: true, batch: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map((i) => i.message).join(", ");
      return { success: false, error: message };
    }
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create training batch" };
  }
}

export async function updateTrainingBatchAction(
  input: TrainingBatchUpdateInput,
) {
  const session = await requireSession();

  try {
    const parsed = trainingBatchUpdateSchema.parse(input);

    // Get current batch
    const currentBatch = await db.query.trainingBatch.findFirst({
      where: eq(schema.trainingBatch.id, parsed.id),
      with: {
        learners: true,
      },
    });

    if (!currentBatch) {
      return { success: false, error: "Training batch not found" };
    }

    // Validate capacity
    const currentParticipantCount = currentBatch.learners.length;
    if (parsed.capacity && parsed.capacity < currentParticipantCount) {
      return {
        success: false,
        error: `Cannot set capacity below current participant count (${currentParticipantCount})`,
      };
    }

    if (parsed.learnerIds && parsed.learnerIds.length > (parsed.capacity || currentBatch.capacity)) {
      return {
        success: false,
        error: "Number of learners cannot exceed capacity",
      };
    }

    // Start transaction
    const result = await db.transaction(async (tx) => {
      // Update batch
      const updateData: any = {};
      if (parsed.batchName !== undefined) updateData.batchName = parsed.batchName;
      if (parsed.competencyLevelId !== undefined)
        updateData.competencyLevelId = parsed.competencyLevelId;
      if (parsed.trainerUserId !== undefined) updateData.trainerUserId = parsed.trainerUserId;
      if (parsed.sessionCount !== undefined) updateData.sessionCount = parsed.sessionCount;
      if (parsed.durationHrs !== undefined)
        updateData.durationHrs = parsed.durationHrs ? String(parsed.durationHrs) : null;
      if (parsed.estimatedStart !== undefined)
        updateData.estimatedStart = toDateOnly(parsed.estimatedStart);
      if (parsed.batchStartDate !== undefined)
        updateData.batchStartDate = toDateOnly(parsed.batchStartDate);
      if (parsed.capacity !== undefined) updateData.capacity = parsed.capacity;
      updateData.updatedAt = new Date();

      const [updatedBatch] = await tx
        .update(schema.trainingBatch)
        .set(updateData)
        .where(eq(schema.trainingBatch.id, parsed.id))
        .returning();

      // Update sessions if sessionCount changed
      if (parsed.sessionCount !== undefined && parsed.sessionCount !== currentBatch.sessionCount) {
        const newSessionCount = parsed.sessionCount;
        // Get current sessions
        const currentSessions = await tx
          .select()
          .from(schema.trainingBatchSessions)
          .where(eq(schema.trainingBatchSessions.trainingBatchId, parsed.id))
          .orderBy(schema.trainingBatchSessions.sessionNumber);

        if (newSessionCount > currentSessions.length) {
          // Add new sessions
          const newSessions = [];
          for (let i = currentSessions.length + 1; i <= newSessionCount; i++) {
            newSessions.push({
              trainingBatchId: parsed.id,
              sessionNumber: i,
              sessionDate:
                parsed.sessionDates && parsed.sessionDates[i - 1]
                  ? toDateOnly(parsed.sessionDates[i - 1])
                  : null,
            });
          }
          await tx.insert(schema.trainingBatchSessions).values(newSessions);
        } else if (newSessionCount < currentSessions.length) {
          // Remove extra sessions (delete from highest session number down)
          const sessionsToRemove = currentSessions
            .filter((s) => s.sessionNumber > newSessionCount)
            .map((s) => s.id);

          for (const sessionId of sessionsToRemove) {
            await tx
              .delete(schema.trainingBatchSessions)
              .where(eq(schema.trainingBatchSessions.id, sessionId));
          }
        }
      }

      // Update session dates if provided
      if (parsed.sessionDates && Array.isArray(parsed.sessionDates)) {
        for (let i = 0; i < parsed.sessionDates.length; i++) {
          if (parsed.sessionDates[i] !== undefined && parsed.sessionDates[i] !== null) {
            await tx
              .update(schema.trainingBatchSessions)
              .set({
                sessionDate: toDateOnly(parsed.sessionDates[i]),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(schema.trainingBatchSessions.trainingBatchId, parsed.id),
                  eq(schema.trainingBatchSessions.sessionNumber, i + 1),
                ),
              );
          }
        }
      }

      // Update learners if provided
      if (parsed.learnerIds !== undefined) {
        const currentLearnerIds = currentBatch.learners.map((l) => l.learnerUserId);
        const newLearnerIds = parsed.learnerIds || [];
        const toAdd = newLearnerIds.filter((id) => !currentLearnerIds.includes(id));
        const toRemove = currentLearnerIds.filter((id) => !newLearnerIds.includes(id));

        // Remove learners
        for (const learnerId of toRemove) {
          const batchLearner = await tx.query.trainingBatchLearners.findFirst({
            where: and(
              eq(schema.trainingBatchLearners.trainingBatchId, parsed.id),
              eq(schema.trainingBatchLearners.learnerUserId, learnerId),
            ),
            with: {
              trainingRequest: true,
            },
          });

          if (batchLearner) {
            await tx
              .delete(schema.trainingBatchLearners)
              .where(
                and(
                  eq(schema.trainingBatchLearners.trainingBatchId, parsed.id),
                  eq(schema.trainingBatchLearners.learnerUserId, learnerId),
                ),
              );

            // Update training request status back to "In Queue" (2)
            await tx
              .update(schema.trainingRequest)
              .set({
                trainingBatchId: null,
                status: 2, // In Queue
                updatedAt: new Date(),
              })
              .where(eq(schema.trainingRequest.id, batchLearner.trainingRequestId));
          }
        }

        // Add learners
        if (toAdd.length > 0) {
          const trainingRequests = await tx
            .select()
            .from(schema.trainingRequest)
            .where(
              and(
                eq(
                  schema.trainingRequest.competencyLevelId,
                  updatedBatch.competencyLevelId,
                ),
                eq(schema.trainingRequest.status, 2), // Status 2 (defined in env.TRAINING_REQUEST_STATUS)
                inArray(schema.trainingRequest.learnerUserId, toAdd),
              ),
            );

          if (trainingRequests.length !== toAdd.length) {
            throw new Error("Some learners do not have training requests in queue");
          }

          const batchLearners = trainingRequests.map((tr) => ({
            trainingBatchId: parsed.id,
            learnerUserId: tr.learnerUserId,
            trainingRequestId: tr.id,
          }));

          await tx.insert(schema.trainingBatchLearners).values(batchLearners);

          // Update training request status to "In Progress" (4)
          await tx
            .update(schema.trainingRequest)
            .set({
              trainingBatchId: parsed.id,
              status: 4, // Status 4 (defined in env.TRAINING_REQUEST_STATUS)
              updatedAt: new Date(),
            })
            .where(
              inArray(
                schema.trainingRequest.id,
                trainingRequests.map((tr) => tr.id),
              ),
            );
        }

        // Recalculate current participant and spot left
        const finalLearnerCount = await tx
          .select()
          .from(schema.trainingBatchLearners)
          .where(eq(schema.trainingBatchLearners.trainingBatchId, parsed.id));

        await tx
          .update(schema.trainingBatch)
          .set({
            currentParticipant: finalLearnerCount.length,
            spotLeft: updatedBatch.capacity - finalLearnerCount.length,
            updatedAt: new Date(),
          })
          .where(eq(schema.trainingBatch.id, parsed.id));
      } else {
        // Recalculate if capacity changed
        if (parsed.capacity !== undefined) {
          await tx
            .update(schema.trainingBatch)
            .set({
              spotLeft: updatedBatch.capacity - currentParticipantCount,
              updatedAt: new Date(),
            })
            .where(eq(schema.trainingBatch.id, parsed.id));
        }
      }

      return updatedBatch;
    });

    // Log activity
    await logActivity({
      userId: session.user.id,
      module: "training_batch",
      action: "edit",
      data: {
        batchId: result.id,
        batchName: result.batchName,
        updatedFields: Object.keys(parsed).filter((key) => key !== "id" && parsed[key as keyof typeof parsed] !== undefined),
      },
    });

    revalidatePath("/admin/training-batches");
    revalidatePath(`/admin/training-batches/${parsed.id}/edit`);
    return { success: true, batch: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map((i) => i.message).join(", ");
      return { success: false, error: message };
    }
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update training batch" };
  }
}

export async function deleteTrainingBatchAction(batchId: string) {
  const session = await requireSession();

  try {
    // Get batch info before deletion for logging
    const batch = await db.query.trainingBatch.findFirst({
      where: eq(schema.trainingBatch.id, batchId),
    });

    // Get batch learners to update their training requests
    const batchLearners = await db.query.trainingBatchLearners.findMany({
      where: eq(schema.trainingBatchLearners.trainingBatchId, batchId),
      with: {
        trainingRequest: true,
      },
    });

    await db.transaction(async (tx) => {
      // Update training requests back to "In Queue" (2)
      for (const batchLearner of batchLearners) {
        await tx
          .update(schema.trainingRequest)
          .set({
            trainingBatchId: null,
            status: 2, // In Queue
            updatedAt: new Date(),
          })
          .where(eq(schema.trainingRequest.id, batchLearner.trainingRequestId));
      }

      // Delete batch (cascade will handle related records)
      await tx.delete(schema.trainingBatch).where(eq(schema.trainingBatch.id, batchId));
    });

    // Log activity
    if (batch) {
      await logActivity({
        userId: session.user.id,
        module: "training_batch",
        action: "delete",
        data: {
          batchId: batch.id,
          batchName: batch.batchName,
          learnerCount: batchLearners.length,
        },
      });
    }

    revalidatePath("/admin/training-batches");
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to delete training batch" };
  }
}

export async function removeLearnerFromBatchAction(
  batchId: string,
  learnerId: string,
) {
  const session = await requireSession();

  try {
    await db.transaction(async (tx) => {
      // Get the batch learner record
      const batchLearner = await tx.query.trainingBatchLearners.findFirst({
        where: and(
          eq(schema.trainingBatchLearners.trainingBatchId, batchId),
          eq(schema.trainingBatchLearners.learnerUserId, learnerId),
        ),
        with: {
          trainingRequest: true,
        },
      });

      if (!batchLearner) {
        throw new Error("Learner not found in batch");
      }

      // Remove learner from batch
      await tx
        .delete(schema.trainingBatchLearners)
        .where(
          and(
            eq(schema.trainingBatchLearners.trainingBatchId, batchId),
            eq(schema.trainingBatchLearners.learnerUserId, learnerId),
          ),
        );

      // Update training request status back to "In Queue" (2)
      await tx
        .update(schema.trainingRequest)
        .set({
          trainingBatchId: null,
          status: 2, // In Queue
          updatedAt: new Date(),
        })
        .where(eq(schema.trainingRequest.id, batchLearner.trainingRequestId));

      // Recalculate current participant and spot left
      const remainingLearners = await tx
        .select()
        .from(schema.trainingBatchLearners)
        .where(eq(schema.trainingBatchLearners.trainingBatchId, batchId));

      const batch = await tx.query.trainingBatch.findFirst({
        where: eq(schema.trainingBatch.id, batchId),
      });

      if (batch) {
        await tx
          .update(schema.trainingBatch)
          .set({
            currentParticipant: remainingLearners.length,
            spotLeft: batch.capacity - remainingLearners.length,
            updatedAt: new Date(),
          })
          .where(eq(schema.trainingBatch.id, batchId));
      }
    });

    // Get batch and learner info for logging
    const batch = await db.query.trainingBatch.findFirst({
      where: eq(schema.trainingBatch.id, batchId),
    });
    const learner = await db.query.users.findFirst({
      where: eq(schema.users.id, learnerId),
      columns: {
        id: true,
        name: true,
        email: true,
      },
    });

    // Log activity
    if (batch && learner) {
      await logActivity({
        userId: session.user.id,
        module: "training_batch",
        action: "edit",
        data: {
          batchId: batch.id,
          batchName: batch.batchName,
          action: "remove_learner",
          learnerId: learner.id,
          learnerName: learner.name,
        },
      });
    }

    revalidatePath("/admin/training-batches");
    revalidatePath(`/admin/training-batches/${batchId}/edit`);
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to remove learner" };
  }
}

export async function dropOffLearnerAction(
  batchId: string,
  learnerId: string,
  dropOffReason?: string,
) {
  const session = await requireSession();

  try {
    await db.transaction(async (tx) => {
      // Get the batch learner record
      const batchLearner = await tx.query.trainingBatchLearners.findFirst({
        where: and(
          eq(schema.trainingBatchLearners.trainingBatchId, batchId),
          eq(schema.trainingBatchLearners.learnerUserId, learnerId),
        ),
        with: {
          trainingRequest: true,
        },
      });

      if (!batchLearner) {
        throw new Error("Learner not found in batch");
      }

      // Remove learner from batch
      await tx
        .delete(schema.trainingBatchLearners)
        .where(
          and(
            eq(schema.trainingBatchLearners.trainingBatchId, batchId),
            eq(schema.trainingBatchLearners.learnerUserId, learnerId),
          ),
        );

      // Update training request status to "Drop Off" (7)
      await tx
        .update(schema.trainingRequest)
        .set({
          trainingBatchId: null,
          status: 7, // Status 7 (defined in env.TRAINING_REQUEST_STATUS)
          dropOffReason: dropOffReason || null,
          updatedAt: new Date(),
        })
        .where(eq(schema.trainingRequest.id, batchLearner.trainingRequestId));

      // Recalculate current participant and spot left
      const remainingLearners = await tx
        .select()
        .from(schema.trainingBatchLearners)
        .where(eq(schema.trainingBatchLearners.trainingBatchId, batchId));

      const batch = await tx.query.trainingBatch.findFirst({
        where: eq(schema.trainingBatch.id, batchId),
      });

      if (batch) {
        await tx
          .update(schema.trainingBatch)
          .set({
            currentParticipant: remainingLearners.length,
            spotLeft: batch.capacity - remainingLearners.length,
            updatedAt: new Date(),
          })
          .where(eq(schema.trainingBatch.id, batchId));
      }
    });

    // Get batch and learner info for logging
    const batch = await db.query.trainingBatch.findFirst({
      where: eq(schema.trainingBatch.id, batchId),
    });
    const learner = await db.query.users.findFirst({
      where: eq(schema.users.id, learnerId),
      columns: {
        id: true,
        name: true,
        email: true,
      },
    });

    // Log activity
    if (batch && learner) {
      await logActivity({
        userId: session.user.id,
        module: "training_batch",
        action: "edit",
        data: {
          batchId: batch.id,
          batchName: batch.batchName,
          action: "drop_off_learner",
          learnerId: learner.id,
          learnerName: learner.name,
          dropOffReason: dropOffReason || null,
        },
      });
    }

    revalidatePath("/admin/training-batches");
    revalidatePath(`/admin/training-batches/${batchId}/edit`);
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to drop off learner" };
  }
}

export async function updateAttendanceAction(
  batchId: string,
  sessionId: string,
  attendance: Array<{ learnerId: string; attended: boolean }>,
) {
  const session = await requireSession();

  try {
    await db.transaction(async (tx) => {
      // Update attendance for each learner
      for (const item of attendance) {
        const { learnerId, attended } = item;

        // Check if attendance record exists
        const existing = await tx.query.trainingBatchAttendanceSessions.findFirst({
          where: and(
            eq(schema.trainingBatchAttendanceSessions.trainingBatchId, batchId),
            eq(schema.trainingBatchAttendanceSessions.learnerUserId, learnerId),
            eq(schema.trainingBatchAttendanceSessions.sessionId, sessionId),
          ),
        });

        if (existing) {
          // Update existing record
          await tx
            .update(schema.trainingBatchAttendanceSessions)
            .set({ attended })
            .where(
              and(
                eq(schema.trainingBatchAttendanceSessions.trainingBatchId, batchId),
                eq(schema.trainingBatchAttendanceSessions.learnerUserId, learnerId),
                eq(schema.trainingBatchAttendanceSessions.sessionId, sessionId),
              ),
            );
        } else {
          // Create new record
          await tx.insert(schema.trainingBatchAttendanceSessions).values({
            trainingBatchId: batchId,
            learnerUserId: learnerId,
            sessionId: sessionId,
            attended,
          });
        }
      }
    });

    // Get batch and session info for logging
    const batch = await db.query.trainingBatch.findFirst({
      where: eq(schema.trainingBatch.id, batchId),
    });
    const sessionData = await db.query.trainingBatchSessions.findFirst({
      where: eq(schema.trainingBatchSessions.id, sessionId),
    });

    // Log activity
    if (batch && sessionData) {
      await logActivity({
        userId: session.user.id,
        module: "training_batch",
        action: "edit",
        data: {
          batchId: batch.id,
          batchName: batch.batchName,
          action: "update_attendance",
          sessionId: sessionId,
          sessionNumber: sessionData.sessionNumber,
          attendanceCount: attendance.length,
        },
      });
    }

    revalidatePath(`/admin/training-batches/${batchId}/edit`);
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update attendance" };
  }
}

export async function updateHomeworkAction(
  batchId: string,
  sessionId: string,
  homework: Array<{ learnerId: string; completed: boolean; homeworkUrl?: string }>,
) {
  const session = await requireSession();

  try {
    await db.transaction(async (tx) => {
      // Update homework for each learner
      for (const item of homework) {
        const { learnerId, completed, homeworkUrl } = item;

        // Check if homework record exists
        const existing = await tx.query.trainingBatchHomeworkSessions.findFirst({
          where: and(
            eq(schema.trainingBatchHomeworkSessions.trainingBatchId, batchId),
            eq(schema.trainingBatchHomeworkSessions.learnerUserId, learnerId),
            eq(schema.trainingBatchHomeworkSessions.sessionId, sessionId),
          ),
        });

        if (existing) {
          // Update existing record
          await tx
            .update(schema.trainingBatchHomeworkSessions)
            .set({
              completed: completed ?? false,
              homeworkUrl: homeworkUrl || null,
            })
            .where(
              and(
                eq(schema.trainingBatchHomeworkSessions.trainingBatchId, batchId),
                eq(schema.trainingBatchHomeworkSessions.learnerUserId, learnerId),
                eq(schema.trainingBatchHomeworkSessions.sessionId, sessionId),
              ),
            );
        } else {
          // Create new record
          await tx.insert(schema.trainingBatchHomeworkSessions).values({
            trainingBatchId: batchId,
            learnerUserId: learnerId,
            sessionId: sessionId,
            completed: completed ?? false,
            homeworkUrl: homeworkUrl || null,
          });
        }
      }
    });

    // Get batch and session info for logging
    const batch = await db.query.trainingBatch.findFirst({
      where: eq(schema.trainingBatch.id, batchId),
    });
    const sessionData = await db.query.trainingBatchSessions.findFirst({
      where: eq(schema.trainingBatchSessions.id, sessionId),
    });

    // Log activity
    if (batch && sessionData) {
      await logActivity({
        userId: session.user.id,
        module: "training_batch",
        action: "edit",
        data: {
          batchId: batch.id,
          batchName: batch.batchName,
          action: "update_homework",
          sessionId: sessionId,
          sessionNumber: sessionData.sessionNumber,
          homeworkCount: homework.length,
        },
      });
    }

    revalidatePath(`/admin/training-batches/${batchId}/edit`);
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update homework" };
  }
}

