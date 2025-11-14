"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { TrainingRequestManager } from "../training-requests/training-request-manager";
import { VPAManager } from "../validation-project-approval/vpa-manager";
import { VSRManager } from "../validation-schedule-request/vsr-manager";
import type { TrainingRequest, ValidationProjectApproval, ValidationScheduleRequest, Competency, User } from "@/db/schema";
import type { rolesList } from "@/db/schema";

type TrainingRequestWithRelations = TrainingRequest & {
  learner: {
    id: string;
    name: string;
    email: string;
  };
  competencyLevel: {
    id: string;
    name: string;
    competency: {
      id: string;
      name: string;
    };
  };
  assignedUser?: {
    id: string;
    name: string;
  } | null;
  trainingBatch?: {
    id: string;
    batchName: string;
    trainer: {
      id: string;
      name: string;
    };
  } | null;
};

type VPAWithRelations = ValidationProjectApproval & {
  learner: {
    id: string;
    name: string;
    email: string;
  };
  competencyLevel: {
    id: string;
    name: string;
    competency: {
      id: string;
      name: string;
    };
  };
  assignedUser?: {
    id: string;
    name: string;
  } | null;
};

type VSRWithRelations = ValidationScheduleRequest & {
  learner: {
    id: string;
    name: string;
    email: string;
  };
  competencyLevel: {
    id: string;
    name: string;
    competency: {
      id: string;
      name: string;
    };
  };
  validatorOpsUser?: {
    id: string;
    name: string;
  } | null;
  validatorTrainerUser?: {
    id: string;
    name: string;
  } | null;
  assignedUser?: {
    id: string;
    name: string;
  } | null;
};

type UserWithRole = User & {
  role: typeof rolesList.$inferSelect | null;
};

interface RequestLogClientProps {
  trainingRequests: TrainingRequestWithRelations[];
  vpas: VPAWithRelations[];
  vsrs: VSRWithRelations[];
  competencies: Competency[];
  users: User[];
  usersWithRole: UserWithRole[];
  trStatusLabels: string[];
  vpaStatusLabels: string[];
  vsrStatusLabels: string[];
  currentUserId: string;
  canEditTR: boolean;
  canEditVPA: boolean;
  canEditVSR: boolean;
}

type TabType = "tr" | "vpa" | "vsr";

export function RequestLogClient({
  trainingRequests,
  vpas,
  vsrs,
  competencies,
  users,
  usersWithRole,
  trStatusLabels,
  vpaStatusLabels,
  vsrStatusLabels,
  currentUserId,
  canEditTR,
  canEditVPA,
  canEditVSR,
}: RequestLogClientProps) {
  const [activeTab, setActiveTab] = useState<TabType>("tr");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Filter users for TR (only trainers)
  const trainerUsers = usersWithRole.filter(
    (user) => user.role?.roleName?.toLowerCase() === "trainer",
  );

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    // Refresh data when switching tabs
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-slate-800">
        <nav className="-mb-px flex items-center space-x-6" aria-label="Request Log Tabs">
          <button
            type="button"
            onClick={() => handleTabChange("tr")}
            disabled={isPending}
            className={`border-b-2 px-1 py-3 text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === "tr"
                ? "border-blue-500 text-blue-200"
                : "border-transparent text-slate-300 hover:border-slate-600 hover:text-slate-200"
            } ${isPending ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Training Request
            {isPending && activeTab === "tr" && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("vpa")}
            disabled={isPending}
            className={`border-b-2 px-1 py-3 text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === "vpa"
                ? "border-blue-500 text-blue-200"
                : "border-transparent text-slate-300 hover:border-slate-600 hover:text-slate-200"
            } ${isPending ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Validation Project Approval
            {isPending && activeTab === "vpa" && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("vsr")}
            disabled={isPending}
            className={`border-b-2 px-1 py-3 text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === "vsr"
                ? "border-blue-500 text-blue-200"
                : "border-transparent text-slate-300 hover:border-slate-600 hover:text-slate-200"
            } ${isPending ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Validation Schedule Request
            {isPending && activeTab === "vsr" && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="relative">
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 z-10 rounded-md">
            <div className="flex items-center gap-2 text-slate-300">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          </div>
        )}
        {activeTab === "tr" && (
          <TrainingRequestManager
            trainingRequests={trainingRequests}
            competencies={competencies}
            users={trainerUsers as User[]}
            statusLabels={trStatusLabels}
            canEdit={canEditTR}
          />
        )}
        {activeTab === "vpa" && (
          <VPAManager
            vpas={vpas}
            competencies={competencies}
            users={users}
            statusLabels={vpaStatusLabels}
            canEdit={canEditVPA}
          />
        )}
        {activeTab === "vsr" && (
          <VSRManager
            vsrs={vsrs}
            competencies={competencies}
            users={usersWithRole}
            statusLabels={vsrStatusLabels}
            currentUserId={currentUserId}
            canEdit={canEditVSR}
          />
        )}
      </div>
    </div>
  );
}

