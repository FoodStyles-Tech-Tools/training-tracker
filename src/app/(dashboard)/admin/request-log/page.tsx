import { Suspense } from "react";
import { desc, eq, and } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { ensurePermission, getUserPermissions } from "@/lib/permissions";
import { env } from "@/env";
import { RequestLogClient } from "./request-log-client";

export default async function RequestLogPage() {
  const session = await requireSession();
  
  // Check permissions for all three modules
  // User needs at least one of these permissions to access the page
  const permissions = await getUserPermissions(session.user.id);
  const canListTR = permissions.get("training_request")?.canList ?? false;
  const canListVPA = permissions.get("validation_project_approval")?.canList ?? false;
  const canListVSR = permissions.get("validation_schedule_request")?.canList ?? false;

  if (!canListTR && !canListVPA && !canListVSR) {
    // User doesn't have permission to view any of the request types
    return (
      <div className="p-6">
        <div className="rounded-md bg-red-950/50 border border-red-800 p-4">
          <p className="text-red-200">You do not have permission to view any request logs.</p>
        </div>
      </div>
    );
  }

  const canEditTR = permissions.get("training_request")?.canEdit ?? false;
  const canEditVPA = permissions.get("validation_project_approval")?.canEdit ?? false;
  const canEditVSR = permissions.get("validation_schedule_request")?.canEdit ?? false;

  // Fetch data for all three request types
  // Only fetch if user has list permission for that type
  const [trainingRequestsData, vpasData, vsrsData] = await Promise.all([
    canListTR
      ? db.query.trainingRequest.findMany({
          with: {
            learner: true,
            competencyLevel: {
              with: {
                competency: true,
              },
            },
            assignedUser: true,
            trainingBatch: {
              with: {
                trainer: true,
              },
            },
          },
          orderBy: desc(schema.trainingRequest.createdAt),
        })
      : Promise.resolve([]),
    canListVPA
      ? db.query.validationProjectApproval.findMany({
          with: {
            learner: true,
            competencyLevel: {
              with: {
                competency: true,
              },
            },
            assignedUser: true,
          },
          orderBy: desc(schema.validationProjectApproval.createdAt),
        })
      : Promise.resolve([]),
    canListVSR
      ? db.query.validationScheduleRequest.findMany({
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
          orderBy: desc(schema.validationScheduleRequest.createdAt),
        })
      : Promise.resolve([]),
  ]);

  // Get all competencies for filter (shared across all request types)
  const competencies = await db.query.competencies.findMany({
    where: and(eq(schema.competencies.isDeleted, false), eq(schema.competencies.status, 1)),
    orderBy: schema.competencies.name,
  });

  // Get all users for assignment (needed for VPA and VSR)
  const users = await db.query.users.findMany({
    orderBy: schema.users.name,
  });

  // Get all users with role information (needed for VSR and TR)
  const usersWithRole = await db.query.users.findMany({
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

  // Parse status labels from environment variables
  const trStatusLabels = env.TRAINING_REQUEST_STATUS.split(",").map((s) => s.trim());
  const vpaStatusLabels = env.VPA_STATUS.split(",").map((s) => s.trim());
  const vsrStatusLabels = env.VSR_STATUS.split(",").map((s) => s.trim());

  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}>
      <RequestLogClient
        trainingRequests={trainingRequestsData}
        vpas={vpasData}
        vsrs={vsrsData}
        competencies={competencies}
        users={users}
        usersWithRole={usersWithRole}
        trStatusLabels={trStatusLabels}
        vpaStatusLabels={vpaStatusLabels}
        vsrStatusLabels={vsrStatusLabels}
        currentUserId={session.user.id}
        canEditTR={canEditTR}
        canEditVPA={canEditVPA}
        canEditVSR={canEditVSR}
      />
    </Suspense>
  );
}

