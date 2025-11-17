import { eq, inArray, and, notInArray, isNotNull, desc, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { ensurePermission } from "@/lib/permissions";
import { env } from "@/env";
import { ProjectSubmissionClient } from "./project-submission-client";

// Pending projects: Training Requests with status 5 (Sessions Completed) and no VPA
const SESSIONS_COMPLETED_STATUS = 5;

// Resubmit projects: VPAs with status 2 (Rejected) or 3 (Resubmit for Re-validation)
const RESUBMIT_STATUSES = [2, 3] as const;

export default async function ProjectSubmissionPage() {
  const session = await requireSession();
  await ensurePermission(session.user.id, "training_request", "list");
  await ensurePermission(session.user.id, "validation_project_approval", "list");

  // Find all TR IDs that already have a VPA
  const vpaTrIdsResult = await db
    .select({ trId: schema.validationProjectApproval.trId })
    .from(schema.validationProjectApproval)
    .where(isNotNull(schema.validationProjectApproval.trId));

  const vpaTrIds = vpaTrIdsResult
    .map((row) => row.trId)
    .filter((trId): trId is string => Boolean(trId));

  // Get training requests that have completed sessions but no VPA yet
  let pendingCondition = eq(schema.trainingRequest.status, SESSIONS_COMPLETED_STATUS);
  if (vpaTrIds.length > 0) {
    pendingCondition = and(pendingCondition, notInArray(schema.trainingRequest.trId, vpaTrIds));
  }

  const pendingTrainingRequests = await db.query.trainingRequest.findMany({
    where: pendingCondition,
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
              id: true,
              name: true,
            },
          },
        },
      },
      trainingBatch: {
        columns: {
          id: true,
          batchFinishDate: true,
        },
      },
    },
    orderBy: schema.trainingRequest.updatedAt,
  });

  // Get resubmit VPAs
  const resubmitVPAs = await db.query.validationProjectApproval.findMany({
    where: inArray(schema.validationProjectApproval.status, RESUBMIT_STATUSES),
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
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: schema.validationProjectApproval.responseDate,
  });

  // Get latest rejected date (status = 2) from log for each VPA
  const vpaIds = resubmitVPAs.map((vpa) => vpa.vpaId);
  const rejectedDatesMap = new Map<string, Date | null>();
  
  if (vpaIds.length > 0) {
    // Use SQL query to get the MAX(created_at) for each vpa_id where status = 2
    // Using unnest to properly handle the array parameter
    const rejectedLogs = await db.execute(sql`
      SELECT 
        vpa_id,
        MAX(created_at) as latest_rejected_date
      FROM validation_project_approval_log
      WHERE vpa_id = ANY(ARRAY[${sql.join(vpaIds.map(id => sql`${id}`), sql`, `)}])
        AND status = 2
      GROUP BY vpa_id
    `);

    // Map the results
    for (const row of rejectedLogs.rows) {
      const vpaId = row.vpa_id as string;
      const latestDate = row.latest_rejected_date as Date | null;
      if (vpaId && latestDate) {
        rejectedDatesMap.set(vpaId, latestDate);
      }
    }
  }

  // Add rejectedDate to each VPA
  const resubmitVPAsWithRejectedDate = resubmitVPAs.map((vpa) => ({
    ...vpa,
    rejectedDate: rejectedDatesMap.get(vpa.vpaId) || null,
  }));

  // Get all competencies for filter
  const competencies = await db.query.competencies.findMany({
    where: eq(schema.competencies.isDeleted, false),
    orderBy: schema.competencies.name,
  });

  // Parse status labels from environment variables
  const vpaStatusLabels = env.VPA_STATUS.split(",").map((s) => s.trim());
  const trainingRequestStatusLabels = env.TRAINING_REQUEST_STATUS.split(",").map((s) => s.trim());

  return (
    <ProjectSubmissionClient
      pendingTrainingRequests={pendingTrainingRequests}
      resubmitVPAs={resubmitVPAsWithRejectedDate}
      competencies={competencies}
      vpaStatusLabels={vpaStatusLabels}
      trainingRequestStatusLabels={trainingRequestStatusLabels}
    />
  );
}

