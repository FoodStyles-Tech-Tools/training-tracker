import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, like, desc, asc, inArray, gt } from "drizzle-orm";

import { db, schema } from "@/db";
import { PermissionError, ensurePermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";
import { ALLOWED_TRAINING_REQUEST_STATUSES } from "@/app/(dashboard)/admin/training-batches/constants";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensurePermission(session.user.id, "training_batch", "list");
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const searchParams = req.nextUrl.searchParams;
  const competency = searchParams.get("competency");
  const level = searchParams.get("level");
  const competencyLevelId = searchParams.get("competencyLevelId");
  const batchName = searchParams.get("batch");
  const trainer = searchParams.get("trainer");
  const trainingRequestId = searchParams.get("trainingRequestId");
  const availableForTrainingRequestId = searchParams.get("availableForTrainingRequestId");
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "50");

  // If trainingRequestId is provided, fetch batch for that training request
  if (trainingRequestId) {
    const trainingRequest = await db.query.trainingRequest.findFirst({
      where: eq(schema.trainingRequest.id, trainingRequestId),
      with: {
        trainingBatch: {
          with: {
            competencyLevel: {
              with: {
                competency: true,
              },
            },
            trainer: true,
            learners: {
              with: {
                learner: true,
              },
            },
            sessions: true,
          },
        },
      },
    });

    if (!trainingRequest || !trainingRequest.trainingBatch) {
      return NextResponse.json({ batches: [] });
    }

    return NextResponse.json({
      batches: [trainingRequest.trainingBatch],
      total: 1,
      page: 1,
      pageSize: 1,
    });
  }

  // If availableForTrainingRequestId is provided, fetch available batches for that training request
  if (availableForTrainingRequestId) {
    const trainingRequest = await db.query.trainingRequest.findFirst({
      where: eq(schema.trainingRequest.id, availableForTrainingRequestId),
      with: {
        competencyLevel: {
          with: {
            competency: true,
          },
        },
        trainingBatch: {
          with: {
            trainer: true,
          },
        },
      },
    });

    if (!trainingRequest) {
      return NextResponse.json({ error: "Training request not found" }, { status: 404 });
    }

    // Get batches that match the competency level and have spots left
    // Also include the current batch if assigned (for reassignment)
    const availableBatches = await db
      .select({
        id: schema.trainingBatch.id,
        batchName: schema.trainingBatch.batchName,
        sessionCount: schema.trainingBatch.sessionCount,
        durationHrs: schema.trainingBatch.durationHrs,
        estimatedStart: schema.trainingBatch.estimatedStart,
        batchStartDate: schema.trainingBatch.batchStartDate,
        capacity: schema.trainingBatch.capacity,
        currentParticipant: schema.trainingBatch.currentParticipant,
        spotLeft: schema.trainingBatch.spotLeft,
        createdAt: schema.trainingBatch.createdAt,
        competency: {
          id: schema.competencies.id,
          name: schema.competencies.name,
        },
        level: {
          id: schema.competencyLevels.id,
          name: schema.competencyLevels.name,
        },
        trainer: {
          id: schema.users.id,
          name: schema.users.name,
        },
      })
      .from(schema.trainingBatch)
      .leftJoin(
        schema.competencyLevels,
        eq(schema.trainingBatch.competencyLevelId, schema.competencyLevels.id),
      )
      .leftJoin(
        schema.competencies,
        eq(schema.competencyLevels.competencyId, schema.competencies.id),
      )
      .leftJoin(schema.users, eq(schema.trainingBatch.trainerUserId, schema.users.id))
      .where(
        and(
          eq(schema.trainingBatch.competencyLevelId, trainingRequest.competencyLevelId),
          gt(schema.trainingBatch.spotLeft, 0), // Has spots left
        ),
      )
      .orderBy(desc(schema.trainingBatch.createdAt));

    // If there's a current batch and it's not in the list, add it (for reassignment)
    if (trainingRequest.trainingBatchId && trainingRequest.trainingBatch) {
      const currentBatchInList = availableBatches.find(b => b.id === trainingRequest.trainingBatchId);
      if (!currentBatchInList) {
        availableBatches.unshift({
          id: trainingRequest.trainingBatch.id,
          batchName: trainingRequest.trainingBatch.batchName,
          sessionCount: trainingRequest.trainingBatch.sessionCount || 0,
          durationHrs: trainingRequest.trainingBatch.durationHrs,
          estimatedStart: trainingRequest.trainingBatch.estimatedStart,
          batchStartDate: trainingRequest.trainingBatch.batchStartDate,
          capacity: trainingRequest.trainingBatch.capacity,
          currentParticipant: trainingRequest.trainingBatch.currentParticipant,
          spotLeft: trainingRequest.trainingBatch.spotLeft,
          createdAt: trainingRequest.trainingBatch.createdAt,
          competency: {
            id: trainingRequest.competencyLevel.competency.id,
            name: trainingRequest.competencyLevel.competency.name,
          },
          level: {
            id: trainingRequest.competencyLevel.id,
            name: trainingRequest.competencyLevel.name,
          },
          trainer: {
            id: trainingRequest.trainingBatch.trainer.id,
            name: trainingRequest.trainingBatch.trainer.name,
          },
        });
      }
    }

    return NextResponse.json({
      batches: availableBatches,
      total: availableBatches.length,
      page: 1,
      pageSize: availableBatches.length,
    });
  }

  // Build where conditions
  const conditions: any[] = [];

  if (competencyLevelId) {
    conditions.push(eq(schema.trainingBatch.competencyLevelId, competencyLevelId));
  }

  if (competency) {
    conditions.push(like(schema.competencies.name, `%${competency}%`));
  }

  if (level) {
    conditions.push(eq(schema.competencyLevels.name, level));
  }

  if (batchName) {
    conditions.push(like(schema.trainingBatch.batchName, `%${batchName}%`));
  }

  if (trainer) {
    conditions.push(like(schema.users.name, `%${trainer}%`));
  }

  // Get training batches with related data
  let query = db
    .select({
      id: schema.trainingBatch.id,
      batchName: schema.trainingBatch.batchName,
      sessionCount: schema.trainingBatch.sessionCount,
      durationHrs: schema.trainingBatch.durationHrs,
      estimatedStart: schema.trainingBatch.estimatedStart,
      batchStartDate: schema.trainingBatch.batchStartDate,
      capacity: schema.trainingBatch.capacity,
      currentParticipant: schema.trainingBatch.currentParticipant,
      spotLeft: schema.trainingBatch.spotLeft,
      createdAt: schema.trainingBatch.createdAt,
      competency: {
        id: schema.competencies.id,
        name: schema.competencies.name,
      },
      level: {
        id: schema.competencyLevels.id,
        name: schema.competencyLevels.name,
      },
      trainer: {
        id: schema.users.id,
        name: schema.users.name,
      },
    })
    .from(schema.trainingBatch)
    .leftJoin(
      schema.competencyLevels,
      eq(schema.trainingBatch.competencyLevelId, schema.competencyLevels.id),
    )
    .leftJoin(
      schema.competencies,
      eq(schema.competencyLevels.competencyId, schema.competencies.id),
    )
    .leftJoin(schema.users, eq(schema.trainingBatch.trainerUserId, schema.users.id));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const batches = await query
    .orderBy(desc(schema.trainingBatch.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // Get total count
  const totalCount = await db
    .select({ count: schema.trainingBatch.id })
    .from(schema.trainingBatch)
    .leftJoin(
      schema.competencyLevels,
      eq(schema.trainingBatch.competencyLevelId, schema.competencyLevels.id),
    )
    .leftJoin(
      schema.competencies,
      eq(schema.competencyLevels.competencyId, schema.competencies.id),
    )
    .leftJoin(schema.users, eq(schema.trainingBatch.trainerUserId, schema.users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return NextResponse.json({
    batches,
    total: totalCount.length,
    page,
    pageSize,
  });
}

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensurePermission(session.user.id, "training_batch", "add");
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  try {
    const body = await req.json();
    const {
      batchName,
      competencyLevelId,
      trainerUserId,
      sessionCount,
      durationHrs,
      estimatedStart,
      batchStartDate,
      capacity,
      learnerIds,
      sessionDates,
    } = body;

    // Validate required fields
    if (!batchName || !competencyLevelId || !trainerUserId || !sessionCount || !capacity) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Validate capacity vs learners
    if (learnerIds && learnerIds.length > capacity) {
      return NextResponse.json(
        { error: "Number of learners cannot exceed capacity" },
        { status: 400 },
      );
    }

    // Start transaction
    const result = await db.transaction(async (tx) => {
      // Create training batch
      const [batch] = await tx
        .insert(schema.trainingBatch)
        .values({
          batchName,
          competencyLevelId,
          trainerUserId,
          sessionCount,
          durationHrs: durationHrs ? String(durationHrs) : null,
          estimatedStart: estimatedStart ? new Date(estimatedStart) : null,
          batchStartDate: batchStartDate ? new Date(batchStartDate) : null,
          capacity,
          currentParticipant: learnerIds?.length || 0,
          spotLeft: capacity - (learnerIds?.length || 0),
        })
        .returning();

      // Create sessions
      if (sessionCount > 0 && sessionDates && Array.isArray(sessionDates)) {
        const sessions = [];
        for (let i = 0; i < sessionCount; i++) {
          sessions.push({
            trainingBatchId: batch.id,
            sessionNumber: i + 1,
            sessionDate: sessionDates[i] ? new Date(sessionDates[i]) : null,
          });
        }
        await tx.insert(schema.trainingBatchSessions).values(sessions);
      }

      // Add learners
      if (learnerIds && learnerIds.length > 0) {
        // Get training requests for these learners and competency level
        // Only allow learners with status: Looking for trainer (1), No batch match (3), On Hold (6), or Drop off (7)
        const trainingRequests = await tx
          .select()
          .from(schema.trainingRequest)
          .where(
            and(
              eq(schema.trainingRequest.competencyLevelId, competencyLevelId),
              inArray(schema.trainingRequest.status, ALLOWED_TRAINING_REQUEST_STATUSES),
              inArray(schema.trainingRequest.learnerUserId, learnerIds),
            ),
          );

        if (trainingRequests.length !== learnerIds.length) {
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

    return NextResponse.json({ batch: result }, { status: 201 });
  } catch (error) {
    console.error("Error creating training batch:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to create training batch" },
      { status: 500 },
    );
  }
}

