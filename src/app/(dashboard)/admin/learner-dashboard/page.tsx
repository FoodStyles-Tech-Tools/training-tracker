import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { env } from "@/env";
import { LearnerDashboardClient } from "./learner-dashboard-client";

export default async function LearnerDashboardPage() {
  const session = await requireSession();

  // Get all published competencies with their levels
  const competencies = await db.query.competencies.findMany({
    where: and(
      eq(schema.competencies.status, 1), // Published
      eq(schema.competencies.isDeleted, false),
    ),
    with: {
      levels: {
        where: eq(schema.competencyLevels.isDeleted, false),
        orderBy: schema.competencyLevels.name,
      },
      requirements: {
        with: {
          requiredLevel: {
            with: {
              competency: true,
            },
          },
        },
      },
    },
    orderBy: schema.competencies.name,
  });

  // Get user's training requests
  const trainingRequests = await db.query.trainingRequest.findMany({
    where: eq(schema.trainingRequest.learnerUserId, session.user.id),
  });

  // Get user's project approvals with assigned user information
  const projectApprovalsData = await db.query.validationProjectApproval.findMany({
    where: eq(schema.validationProjectApproval.learnerUserId, session.user.id),
    with: {
      assignedUser: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Map to the expected format
  const projectApprovals = projectApprovalsData.map((vpa) => ({
    id: vpa.id,
    vpaId: vpa.vpaId,
    competencyLevelId: vpa.competencyLevelId,
    status: vpa.status,
    projectDetails: vpa.projectDetails,
    requestedDate: vpa.requestedDate,
    responseDate: vpa.responseDate,
    assignedTo: vpa.assignedTo,
    assignedToUser: vpa.assignedUser
      ? {
          id: vpa.assignedUser.id,
          name: vpa.assignedUser.name,
        }
      : null,
    rejectionReason: vpa.rejectionReason,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Learner Dashboard</h1>
        <p className="text-sm text-slate-400">
          Browse available competencies and apply for training levels.
        </p>
      </div>

      <LearnerDashboardClient
        competencies={competencies}
        userId={session.user.id}
        trainingRequests={trainingRequests}
        projectApprovals={projectApprovals}
        statusLabels={env.TRAINING_REQUEST_STATUS.split(",").map((s) => s.trim())}
        vpaStatusLabels={env.VPA_STATUS.split(",").map((s) => s.trim())}
      />
    </div>
  );
}

