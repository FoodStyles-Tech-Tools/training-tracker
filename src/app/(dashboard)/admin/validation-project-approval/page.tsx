import { Suspense } from "react";
import { desc, eq, and } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { ensurePermission } from "@/lib/permissions";
import { env } from "@/env";
import { VPAManager } from "./vpa-manager";

export default async function ValidationProjectApprovalPage() {
  const session = await requireSession();
  await ensurePermission(session.user.id, "validation_project_approval", "list");

  // Get all validation project approvals with related data
  const vpasData = await db.query.validationProjectApproval.findMany({
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
  });

  // Get all competencies for filter
  const competencies = await db.query.competencies.findMany({
    where: and(eq(schema.competencies.isDeleted, false), eq(schema.competencies.status, 1)),
    orderBy: schema.competencies.name,
  });

  // Get all users for assignment
  const users = await db.query.users.findMany({
    orderBy: schema.users.name,
  });

  // Parse status labels from environment variable
  const statusLabels = env.VPA_STATUS.split(",").map((s) => s.trim());

  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}>
      <VPAManager
        vpas={vpasData}
        competencies={competencies}
        users={users}
        statusLabels={statusLabels}
      />
    </Suspense>
  );
}

