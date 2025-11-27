import { asc, inArray } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { ensurePermission } from "@/lib/permissions";
import { env } from "@/env";
import { WaitlistClient } from "./waitlist-client";

// Statuses to show in waitlist: Looking for trainer (1), In Queue (2), No batch match (3), On Hold (6), Drop Off (7)
const WAITLIST_STATUSES = [1, 2, 3, 6, 7] as const;

// VPA statuses to show in waitlist: Pending Validation Project Approval (0), Resubmit for Re-validation (3)
const VPA_WAITLIST_STATUSES = [0, 3] as const;

// VSR statuses to show in waitlist: Pending Validation (0), Pending Re-validation (1), Validation Scheduled (2)
const VSR_WAITLIST_STATUSES = [0, 1, 2] as const;

export default async function WaitlistPage() {
  const session = await requireSession();
  await ensurePermission(session.user.id, "training_request", "list");

  // Get training requests with the specified statuses, sorted by oldest date first
  const trainingRequests = await db.query.trainingRequest.findMany({
    where: inArray(schema.trainingRequest.status, WAITLIST_STATUSES),
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
    orderBy: asc(schema.trainingRequest.requestedDate),
  });

  // Get VPAs with the specified statuses, sorted by oldest date first
  const vpas = await db.query.validationProjectApproval.findMany({
    where: inArray(schema.validationProjectApproval.status, VPA_WAITLIST_STATUSES),
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
    orderBy: asc(schema.validationProjectApproval.requestedDate),
  });

  // Get VSRs with the specified statuses, sorted by oldest date first
  const vsrs = await db.query.validationScheduleRequest.findMany({
    where: inArray(schema.validationScheduleRequest.status, VSR_WAITLIST_STATUSES),
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
    orderBy: asc(schema.validationScheduleRequest.requestedDate),
  });

  // Parse status labels from environment variables
  const statusLabels = env.TRAINING_REQUEST_STATUS.split(",").map((s) => s.trim());
  const vpaStatusLabels = env.VPA_STATUS.split(",").map((s) => s.trim());
  const vsrStatusLabels = env.VSR_STATUS.split(",").map((s) => s.trim());

  return (
    <WaitlistClient
      trainingRequests={trainingRequests}
      vpas={vpas}
      vsrs={vsrs}
      statusLabels={statusLabels}
      vpaStatusLabels={vpaStatusLabels}
      vsrStatusLabels={vsrStatusLabels}
    />
  );
}

