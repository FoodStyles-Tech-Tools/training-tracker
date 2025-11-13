import { Suspense } from "react";
import { desc, eq, and } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { ensurePermission, getUserPermissions } from "@/lib/permissions";
import { env } from "@/env";
import { VSRManager } from "./vsr-manager";

export default async function ValidationScheduleRequestPage() {
  const session = await requireSession();
  await ensurePermission(session.user.id, "validation_schedule_request", "list");
  
  const permissions = await getUserPermissions(session.user.id);
  const canEdit = permissions.get("validation_schedule_request")?.canEdit ?? false;

  // Get all validation schedule requests with related data
  const vsrsData = await db.query.validationScheduleRequest.findMany({
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
  });

  // Get all competencies for filter
  const competencies = await db.query.competencies.findMany({
    where: and(eq(schema.competencies.isDeleted, false), eq(schema.competencies.status, 1)),
    orderBy: schema.competencies.name,
  });

  // Get all users with role information for assignment
  const users = await db.query.users.findMany({
    with: {
      role: true,
    },
    orderBy: schema.users.name,
  });

  // Parse status labels from environment variable
  const statusLabels = env.VSR_STATUS.split(",").map((s) => s.trim());

  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}>
      <VSRManager
        vsrs={vsrsData}
        competencies={competencies}
        users={users}
        statusLabels={statusLabels}
        currentUserId={session.user.id}
        canEdit={canEdit}
      />
    </Suspense>
  );
}

