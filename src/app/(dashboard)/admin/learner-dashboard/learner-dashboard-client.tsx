"use client";

import React, { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Competency, CompetencyLevel } from "@/db/schema";
import { createTrainingRequestAction, submitHomeworkAction, submitProjectAction, createProjectAssignmentRequestAction } from "./actions";
import { getVSRStatusBadgeClass } from "@/lib/vsr-config";
import { getTrainingRequestStatusLabel, getStatusBadgeClass, getTrainingRequestStatusNumber } from "@/lib/training-request-config";
import { getVPAStatusLabel, getVPAStatusBadgeClass } from "@/lib/vpa-config";
import { getPARStatusLabel, getPARStatusBadgeClass } from "@/lib/par-config";
import { X, Check, Info, Eye, Upload, CheckCircle2, FileText } from "lucide-react";

type CompetencyWithLevels = Competency & {
  levels: CompetencyLevel[];
  requirements: Array<{
    requiredLevel: CompetencyLevel & {
      competency: Competency;
    };
  }>;
};

type TrainingBatchInfo = {
  id: string;
  batchName: string;
  trainer: {
    id: string;
    name: string | null;
  } | null;
};

type TrainingRequest = {
  id: string;
  trId: string;
  requestedDate: Date;
  competencyLevelId: string;
  status: number; // Status values defined in env.TRAINING_REQUEST_STATUS
  trainingBatch: TrainingBatchInfo | null;
};

type ProjectApproval = {
  id: string;
  vpaId: string;
  competencyLevelId: string;
  status: number; // 0 = Pending Validation Project Approval, 1 = Approved, 2 = Rejected, 3 = Resubmit for Re-validation
  projectDetails: string | null;
  requestedDate: Date | null;
  responseDate: Date | null;
  assignedTo: string | null;
  assignedToUser: {
    id: string;
    name: string | null;
  } | null;
  rejectionReason: string | null;
};

type ValidationScheduleRequest = {
  id: string;
  vsrId: string;
  competencyLevelId: string;
  status: number; // 0 = Pending Validation, 1 = Pending Re-validation, 2 = Validation Scheduled, 3 = Fail, 4 = Pass
  requestedDate: Date | null;
  responseDate: Date | null;
  responseDue: Date | null;
  scheduledDate: Date | null;
  validatorOps: string | null;
  validatorOpsUser: {
    id: string;
    name: string | null;
  } | null;
  validatorTrainer: string | null;
  validatorTrainerUser: {
    id: string;
    name: string | null;
  } | null;
  description: string | null;
};

type ProjectAssignmentRequest = {
  id: string;
  parId: string;
  competencyLevelId: string;
  status: number;
};

interface LearnerDashboardClientProps {
  competencies: CompetencyWithLevels[];
  userId: string;
  trainingRequests?: TrainingRequest[];
  projectApprovals?: ProjectApproval[];
  validationScheduleRequests?: ValidationScheduleRequest[];
  projectAssignmentRequests?: ProjectAssignmentRequest[];
  statusLabels: string[];
  vpaStatusLabels: string[];
  vsrStatusLabels: string[];
  parStatusLabels: string[];
}

type LevelType = "basic" | "competent" | "advanced";

type TableRow = {
  competency: CompetencyWithLevels;
  level: CompetencyLevel;
  competencyId: string;
  levelId: string;
  levelType: LevelType;
  trainingRequest: TrainingRequest | null;
  projectApproval: ProjectApproval | null;
  vsr: ValidationScheduleRequest | null;
  par: ProjectAssignmentRequest | null;
  areRequirementsMet: boolean;
  applicableRequirements: Array<{
    requiredLevel: CompetencyLevel & {
      competency: Competency;
    };
  }>;
};

// Helper function to format dates as "d M Y" (e.g., "09 Nov 2025")
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  
  const day = d.getDate().toString().padStart(2, "0");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

// Helper function to format dates with time as "d M Y h:mm A" (e.g., "21 Nov 2025 3:30 PM")
function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  
  const day = d.getDate().toString().padStart(2, "0");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  
  // Convert to 12-hour format with AM/PM
  let hours = d.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const minutes = d.getMinutes().toString().padStart(2, "0");
  
  return `${day} ${month} ${year} ${hours}:${minutes} ${ampm}`;
}

export function LearnerDashboardClient({
  competencies,
  userId,
  trainingRequests = [],
  projectApprovals = [],
  validationScheduleRequests = [],
  projectAssignmentRequests = [],
  statusLabels,
  vpaStatusLabels,
  vsrStatusLabels,
  parStatusLabels,
}: LearnerDashboardClientProps) {
  const [selectedRow, setSelectedRow] = useState<TableRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showHomeworkModal, setShowHomeworkModal] = useState(false);
  const [showTrainingSlotFormModal, setShowTrainingSlotFormModal] = useState(false);
  const [homeworkData, setHomeworkData] = useState<{
    batchId: string;
    sessions: Array<{ id: string; sessionNumber: number; sessionDate: Date | null }>;
    homework: Array<{ sessionId: string; homeworkUrl: string | null; completed: boolean }>;
  } | null>(null);
  const [homeworkUrls, setHomeworkUrls] = useState<Map<string, string>>(new Map());
  const [submittingSessionId, setSubmittingSessionId] = useState<string | null>(null);
  const [projectDetails, setProjectDetails] = useState<string>("");
  const [submittingProject, setSubmittingProject] = useState(false);
  const [inlineProjectLinks, setInlineProjectLinks] = useState<Record<string, string>>({});
  const [inlineSubmittingLevelId, setInlineSubmittingLevelId] = useState<string | null>(null);
  const router = useRouter();

  // Check if a level has content (at least one field is filled)
  const hasLevelContent = (level: CompetencyLevel | undefined): boolean => {
    if (!level) return false;
    
    const hasTrainingPlan = !!level.trainingPlanDocument?.trim();
    const hasTeamKnowledge = !!level.teamKnowledge?.trim();
    const hasEligibilityCriteria = !!level.eligibilityCriteria?.trim();
    const hasVerification = !!level.verification?.trim();
    
    return hasTrainingPlan || hasTeamKnowledge || hasEligibilityCriteria || hasVerification;
  };

  // Get applicable requirements for a level
  const getApplicableRequirements = (
    competency: CompetencyWithLevels,
    level: CompetencyLevel,
  ): Array<{
    requiredLevel: CompetencyLevel & {
      competency: Competency;
    };
  }> => {
    const levelName = level.name.toLowerCase();
    const requirements: Array<{
      requiredLevel: CompetencyLevel & {
        competency: Competency;
      };
    }> = [];

    // Add manually selected requirements from database (these are from different competencies)
    const manualRequirements = competency.requirements.filter((req) => {
      const isSameCompetency = req.requiredLevel.competency.id === competency.id;
      return !isSameCompetency;
    });
    requirements.push(...manualRequirements);

    // Add default requirements programmatically based on level
    const addedLevelIds = new Set(requirements.map((req) => req.requiredLevel.id));

    if (levelName === "competent" || levelName === "advanced") {
      const basicLevel = competency.levels.find((l) => l.name.toLowerCase() === "basic");
      if (basicLevel && !addedLevelIds.has(basicLevel.id)) {
        requirements.push({
          requiredLevel: {
            ...basicLevel,
            competency: competency,
          },
        });
        addedLevelIds.add(basicLevel.id);
      }
    }

    if (levelName === "advanced") {
      const competentLevel = competency.levels.find((l) => l.name.toLowerCase() === "competent");
      if (competentLevel && !addedLevelIds.has(competentLevel.id)) {
        requirements.push({
          requiredLevel: {
            ...competentLevel,
            competency: competency,
          },
        });
        addedLevelIds.add(competentLevel.id);
      }
    }

    return requirements;
  };

  // Check if all requirements are met for a level
  const areRequirementsMet = (
    requirements: Array<{
      requiredLevel: CompetencyLevel & {
        competency: Competency;
      };
    }>,
  ): boolean => {
    if (requirements.length === 0) return true;

    return requirements.every((req) => {
      const requiredLevelId = req.requiredLevel.id;
      const trainingRequest = trainingRequests.find(
        (tr) => tr.competencyLevelId === requiredLevelId,
      );
      return trainingRequest && trainingRequest.status === 8;
    });
  };

  // Generate table rows from competencies
  const tableRows = useMemo<TableRow[]>(() => {
    const rows: TableRow[] = [];
    const levelOrder: LevelType[] = ["basic", "competent", "advanced"];

    for (const competency of competencies) {
      for (const levelType of levelOrder) {
        const level = competency.levels.find(
          (l) => l.name.toLowerCase() === levelType,
        );

        if (!level || !hasLevelContent(level)) continue;

        const trainingRequest = trainingRequests.find(
          (tr) => tr.competencyLevelId === level.id,
        ) || null;

        const projectApproval = projectApprovals.find(
          (pa) => pa.competencyLevelId === level.id,
        ) || null;

        const vsr = validationScheduleRequests.find(
          (vsr) => vsr.competencyLevelId === level.id,
        ) || null;

        const par = projectAssignmentRequests.find(
          (par) => par.competencyLevelId === level.id,
        ) || null;

        const applicableRequirements = getApplicableRequirements(competency, level);
        const requirementsMet = areRequirementsMet(applicableRequirements);

        rows.push({
          competency,
          level,
          competencyId: competency.id,
          levelId: level.id,
          levelType,
          trainingRequest,
          projectApproval,
          vsr,
          par,
          areRequirementsMet: requirementsMet,
          applicableRequirements,
        });
      }
    }

    return rows;
  }, [competencies, trainingRequests, projectApprovals, validationScheduleRequests, projectAssignmentRequests]);

  // Get unmet requirements for display
  const unmetRequirements = useMemo(() => {
    if (!selectedRow) return [];
    return selectedRow.applicableRequirements.filter((req) => {
      const requiredLevelId = req.requiredLevel.id;
      const trainingRequest = trainingRequests.find(
        (tr) => tr.competencyLevelId === requiredLevelId,
      );
      const isRequirementMet = trainingRequest && trainingRequest.status === 8;
      return !isRequirementMet;
    });
  }, [selectedRow, trainingRequests]);

  // Initialize project details when selected row changes
  useEffect(() => {
    if (selectedRow?.projectApproval?.projectDetails) {
      setProjectDetails(selectedRow.projectApproval.projectDetails);
    } else {
      setProjectDetails("");
    }
  }, [selectedRow]);

  // Helper to check if project document link is empty
  const isProjectDetailsEmpty = useMemo(() => {
    return !projectDetails || projectDetails.trim() === "";
  }, [projectDetails]);

  // VPA Status mapping
  const isProjectSubmitted = !!selectedRow?.projectApproval;
  const isProjectEditable =
    !selectedRow?.projectApproval ||
    selectedRow.projectApproval.status === 2 ||
    selectedRow.projectApproval.status === 3;
  const isProjectApproved = selectedRow?.projectApproval?.status === 1;

  const getLevelBadgeClass = (level: string) => {
    const levelLower = level.toLowerCase();
    if (levelLower === "basic") {
      return "bg-blue-500/20 text-blue-200";
    } else if (levelLower === "competent") {
      return "bg-emerald-500/20 text-emerald-200";
    } else if (levelLower === "advanced") {
      return "bg-purple-500/20 text-purple-200";
    }
    return "bg-slate-500/20 text-slate-200";
  };

  const handleRowClick = (row: TableRow) => {
    setSelectedRow(row);
    setShowDetailModal(true);
    setError(null);
    setSuccess(null);
  };

  const handleApply = (row: TableRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRow(row);
    setShowConfirmModal(true);
  };

  const handleConfirmApply = () => {
    if (!selectedRow) return;

    setError(null);
    setSuccess(null);
    setShowConfirmModal(false);

    startTransition(async () => {
      const result = await createTrainingRequestAction(selectedRow.levelId);
      if (result.success) {
        const competencyName = selectedRow.competency.name || "this competency";
        const levelName = selectedRow.level.name;
        const successMessage = `You successfully applied for ${competencyName} - ${levelName}`;
        setSuccess(successMessage);
        sessionStorage.setItem("trainingRequestSuccess", successMessage);
        setShowTrainingSlotFormModal(true);
        router.refresh();
      } else {
        setError(result.error || "Failed to create training request");
      }
    });
  };

  // Restore success message from sessionStorage after refresh
  useEffect(() => {
    const savedSuccess = sessionStorage.getItem("trainingRequestSuccess");
    if (savedSuccess) {
      setSuccess(savedSuccess);
      sessionStorage.removeItem("trainingRequestSuccess");
    }
  }, []);

  const handleOpenHomeworkModal = async (rowOverride?: TableRow) => {
    const targetRow = rowOverride ?? selectedRow;
    if (rowOverride) {
      setSelectedRow(rowOverride);
    }

    if (!targetRow?.trainingRequest?.id) return;

    setShowHomeworkModal(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/training-batches?trainingRequestId=${targetRow.trainingRequest.id}`);
      if (response.ok) {
        const data = await response.json();
        const batch = data.batches?.find((b: any) =>
          b.learners?.some((l: any) => l.trainingRequestId === targetRow.trainingRequest?.id)
        );

        if (batch) {
          const batchResponse = await fetch(`/api/training-batches/${batch.id}`);
          if (batchResponse.ok) {
            const batchData = await batchResponse.json();
            setHomeworkData({
              batchId: batch.id,
              sessions: batchData.batch.sessions || [],
              homework: batchData.homework || [],
            });

            const urls = new Map<string, string>();
            batchData.homework?.forEach((h: any) => {
              if (h.homeworkUrl) {
                urls.set(h.sessionId, h.homeworkUrl);
              }
            });
            setHomeworkUrls(urls);
          } else {
            setError("Failed to load homework data");
          }
        } else {
          setError("No training batch found for this training request");
        }
      } else {
        setError("Failed to load training batch information");
      }
    } catch (error) {
      console.error("Error loading homework data:", error);
      setError("Failed to load homework data");
    }
  };

  const handleProjectLinkChange = (levelId: string, value: string) => {
    setInlineProjectLinks((prev) => ({
      ...prev,
      [levelId]: value,
    }));
  };

  const handleInlineProjectSubmit = (row: TableRow) => {
    const link = inlineProjectLinks[row.levelId]?.trim();
    if (!link) {
      setError("Project document link cannot be empty");
      return;
    }

    setInlineSubmittingLevelId(row.levelId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await submitProjectAction(row.levelId, link);
      if (result.success) {
        setSuccess("Project submitted successfully");
        setInlineProjectLinks((prev) => ({
          ...prev,
          [row.levelId]: "",
        }));
        router.refresh();
        setTimeout(() => {
          setSuccess(null);
        }, 3000);
      } else {
        setError(result.error || "Failed to submit project");
      }
      setInlineSubmittingLevelId(null);
    });
  };

  const sessionsCompletedStatus = useMemo(
    () => getTrainingRequestStatusNumber("Sessions Completed", statusLabels),
    [statusLabels],
  );

  const validationPassStatus = useMemo(() => {
    const passIndex = vsrStatusLabels.findIndex(
      (label) => label?.toLowerCase() === "pass",
    );
    return passIndex >= 0 ? passIndex : 4;
  }, [vsrStatusLabels]);

  const handleCloseHomeworkModal = () => {
    setShowHomeworkModal(false);
    setHomeworkData(null);
    setHomeworkUrls(new Map());
    setSubmittingSessionId(null);
  };

  const handleSubmitHomework = async (sessionId: string, sessionNumber: number) => {
    if (!homeworkData || !selectedRow?.trainingRequest) return;

    const homeworkUrl = homeworkUrls.get(sessionId)?.trim();
    if (!homeworkUrl) {
      setError("Please enter a homework URL");
      return;
    }

    setSubmittingSessionId(sessionId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await submitHomeworkAction(
        homeworkData.batchId,
        sessionId,
        homeworkUrl,
      );

      if (result.success) {
        setSuccess(`Homework ${sessionNumber} submitted successfully. Waiting for trainer review.`);

        if (homeworkData) {
          try {
            const batchResponse = await fetch(`/api/training-batches/${homeworkData.batchId}`);
            if (batchResponse.ok) {
              const batchData = await batchResponse.json();
              setHomeworkData({
                batchId: homeworkData.batchId,
                sessions: batchData.batch.sessions || [],
                homework: batchData.homework || [],
              });

              const urls = new Map<string, string>();
              batchData.homework?.forEach((h: any) => {
                if (h.homeworkUrl) {
                  urls.set(h.sessionId, h.homeworkUrl);
                }
              });
              setHomeworkUrls(urls);
            }
          } catch (error) {
            console.error("Error reloading homework data:", error);
          }
        }

        setTimeout(() => {
          setSuccess(null);
        }, 3000);
      } else {
        setError(result.error || "Failed to submit homework");
      }
      setSubmittingSessionId(null);
    });
  };

  const handleSubmitProject = async () => {
    if (!selectedRow) return;

    if (isProjectDetailsEmpty) {
      setError("Project details cannot be empty");
      return;
    }

    setSubmittingProject(true);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await submitProjectAction(selectedRow.levelId, projectDetails);
      if (result.success) {
        setSuccess("Project submitted successfully");
        router.refresh();
        setTimeout(() => {
          setSuccess(null);
        }, 3000);
      } else {
        setError(result.error || "Failed to submit project");
      }
      setSubmittingProject(false);
    });
  };


  if (competencies.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-slate-400">No published competencies available.</p>
        </CardContent>
      </Card>
    );
  }

  // Group rows by competency for visual grouping
  const groupedRows = useMemo(() => {
    const groups: { [key: string]: TableRow[] } = {};
    for (const row of tableRows) {
      if (!groups[row.competencyId]) {
        groups[row.competencyId] = [];
      }
      groups[row.competencyId].push(row);
    }
    return groups;
  }, [tableRows]);

  return (
    <div className="space-y-6">
      {/* Error/Success Messages */}
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="max-h-[78vh] overflow-auto">
          <table className="w-full table-fixed border-collapse text-sm text-slate-100">
            <thead className="sticky top-0 z-20 bg-slate-950 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ width: "14%" }}>
                  Level
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ width: "16%" }}>
                  Application Status
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ width: "16%" }}>
                  Batch Detail
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ width: "16%" }}>
                  Training Status
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide" style={{ width: "10%" }}>
                  Homework
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ width: "24%" }}>
                  Project Submission
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide" style={{ width: "10%" }}>
                  Project Status
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide" style={{ width: "10%" }}>
                  Validation Status
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide" style={{ width: "10%" }}>
                  Project Request
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {Object.entries(groupedRows).map(([competencyId, rows]) => (
                <React.Fragment key={competencyId}>
                  {/* Competency Header Row */}
                  <tr className="bg-slate-800/40 text-slate-100">
                    <td colSpan={9} className="px-4 py-3 text-sm font-semibold uppercase tracking-wide">
                      {rows[0]?.competency.name}
                    </td>
                  </tr>
                  {/* Level Rows */}
                  {rows.map((row) => (
                    <tr
                      key={`${row.competencyId}-${row.levelId}`}
                      className="bg-slate-900/40 text-sm transition hover:bg-slate-900/70"
                    >
                      <td className="px-3 py-3 align-middle">
                        <div className="flex items-center gap-2 text-slate-100">
                          <span
                            className={cn(
                              "inline-flex h-7 min-w-[70px] items-center justify-center rounded-full px-3 text-xs font-semibold",
                              getLevelBadgeClass(row.level.name),
                            )}
                          >
                            {row.level.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRowClick(row)}
                            className="cursor-pointer rounded-md border border-slate-800/80 bg-slate-900/60 p-1 text-slate-400 transition hover:border-blue-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                            aria-label={`View details for ${row.level.name}`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        {row.trainingRequest ? (
                          <div className="flex flex-col gap-0.5 text-slate-200">
                            <div className="flex items-center gap-2">
                              <Check className="h-4 w-4 text-emerald-400" />
                              <span>Applied</span>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              Applied on {formatDate(row.trainingRequest.requestedDate)}
                            </span>
                          </div>
                        ) : !row.areRequirementsMet ? (
                          <div className="group relative inline-flex items-center gap-1.5">
                            <span className="text-slate-400">Not Eligible</span>
                            <div className="relative">
                              <Info className="h-4 w-4 text-slate-400 cursor-help transition-colors hover:text-slate-300" />
                              <div className="absolute left-1/2 bottom-full mb-2 hidden group-hover:block z-50 transform -translate-x-1/2 pointer-events-none">
                                <div className="bg-slate-900 border border-slate-700 rounded-md p-3 shadow-xl min-w-[250px] max-w-[350px]">
                                  <div className="text-xs font-semibold text-slate-200 mb-2">
                                    Requirements needed:
                                  </div>
                                   <div className="space-y-1.5">
                                     {row.applicableRequirements
                                       .filter((req) => {
                                         const requiredLevelId = req.requiredLevel.id;
                                         const trainingRequest = trainingRequests.find(
                                           (tr) => tr.competencyLevelId === requiredLevelId,
                                         );
                                         const isRequirementMet = trainingRequest && trainingRequest.status === 8;
                                         return !isRequirementMet;
                                       })
                                       .map((req, idx) => (
                                         <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                                           <span className="text-slate-500 mt-0.5">•</span>
                                           <span>
                                             {req.requiredLevel.competency.name} - {req.requiredLevel.name}
                                           </span>
                                         </div>
                                       ))}
                                   </div>
                                 </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleApply(row, e)}
                            disabled={isPending}
                            className="cursor-pointer rounded-md border border-blue-400/40 px-3 py-1 text-xs font-semibold text-blue-200 transition hover:border-blue-400 hover:bg-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Apply
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        {row.trainingRequest?.trainingBatch ? (
                          <div className="space-y-0.5 text-xs">
                            <div className="font-semibold text-slate-100">
                              {row.trainingRequest.trainingBatch.batchName}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Trainer:{" "}
                              {row.trainingRequest.trainingBatch.trainer?.name || "Unassigned"}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        {row.trainingRequest ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "inline-block rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
                                getStatusBadgeClass(row.trainingRequest.status),
                              )}
                            >
                              {getTrainingRequestStatusLabel(row.trainingRequest.status, statusLabels)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center align-middle">
                        {row.trainingRequest ? (
                          <button
                            type="button"
                            onClick={() => handleOpenHomeworkModal(row)}
                            className={cn(
                              "inline-flex items-center justify-center rounded-md border px-2 py-1 text-slate-300 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60",
                              row.trainingRequest.status === 4
                                ? "border-blue-400/60 text-blue-200 hover:border-blue-400 hover:bg-blue-500/10"
                                : "border-slate-700 text-slate-300 hover:border-blue-400 hover:text-blue-200",
                            )}
                            aria-label={
                              row.trainingRequest.status === 4
                                ? "Submit or view homework"
                                : "View homework submissions"
                            }
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        {(() => {
                          const inlineLinkValue = inlineProjectLinks[row.levelId] ?? "";
                          const isSubmitDisabled =
                            inlineSubmittingLevelId === row.levelId ||
                            isPending ||
                            inlineLinkValue.trim() === "";

                          const renderReadOnlyInput = (link: string) => (
                            <div className="relative flex-1 min-w-0">
                              <Input
                                type="url"
                                value={link}
                                readOnly
                                disabled
                                className="pointer-events-none h-8 rounded-md border border-slate-800 bg-slate-900/50 px-3 text-[11px] text-transparent caret-transparent selection:bg-transparent"
                              />
                              <a
                                href={link}
                                target="_blank"
                                rel="noreferrer"
                                className="pointer-events-auto absolute inset-0 flex items-center rounded-md px-3 text-[11px] text-blue-300 underline hover:text-blue-200 truncate"
                                title={link}
                              >
                                {link}
                              </a>
                            </div>
                          );

                          if (row.projectApproval?.projectDetails?.trim()) {
                            return (
                              <div className="flex items-center gap-2 text-xs">
                                {renderReadOnlyInput(row.projectApproval.projectDetails)}
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-transparent text-emerald-700"
                                >
                                  <CheckCircle2 className="h-7 w-7 text-emerald-700" />
                                </Button>
                              </div>
                            );
                          }

                          if (row.trainingRequest?.status === sessionsCompletedStatus) {
                            return (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="url"
                                  placeholder="Enter document link..."
                                  value={inlineLinkValue}
                                  onChange={(e) => handleProjectLinkChange(row.levelId, e.target.value)}
                                  className="h-8 flex-1 rounded-md border border-slate-800 bg-slate-900/70 px-3 text-[11px] text-slate-200 placeholder-slate-500"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleInlineProjectSubmit(row)}
                                  disabled={isSubmitDisabled}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-transparent text-blue-400 hover:text-blue-300 disabled:opacity-50"
                                >
                                  <Upload className="h-7 w-7" />
                                </Button>
                              </div>
                            );
                          }

                          return <span className="text-slate-400">-</span>;
                        })()}
                      </td>
                      <td className="px-3 py-3 text-center align-middle">
                        {row.projectApproval ? (
                          <span
                            className={cn(
                              "inline-block rounded-md px-2 py-0.5 text-xs font-semibold",
                              getVPAStatusBadgeClass(row.projectApproval.status),
                            )}
                          >
                            {getVPAStatusLabel(row.projectApproval.status, vpaStatusLabels)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center align-middle">
                        {row.vsr ? (
                          <span
                            className={cn(
                              "inline-block rounded-md px-2 py-0.5 text-xs font-semibold",
                              getVSRStatusBadgeClass(row.vsr.status),
                            )}
                          >
                            {vsrStatusLabels[row.vsr.status] || "Unknown"}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center align-middle">
                        {row.vsr?.status === validationPassStatus ? (
                          <div className="flex flex-col items-center text-xs text-slate-400">
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                setError(null);
                                setSuccess(null);
                                startTransition(async () => {
                                  const result = await createProjectAssignmentRequestAction(row.levelId);
                                  if (result.success) {
                                    setSuccess("Project assignment request created successfully");
                                    router.refresh();
                                    setTimeout(() => {
                                      setSuccess(null);
                                    }, 3000);
                                  } else {
                                    setError(result.error || "Failed to create project assignment request");
                                  }
                                });
                              }}
                              disabled={
                                isPending ||
                                !!row.par ||
                                row.trainingRequest?.status !== 8 ||
                                row.vsr?.status !== validationPassStatus
                              }
                              className={cn(
                                "rounded-md px-3 py-1 text-xs font-semibold transition",
                                row.par
                                  ? "border border-emerald-400/60 bg-emerald-400/5 text-emerald-200 cursor-default"
                                  : "cursor-pointer border border-blue-400/40 text-blue-200 hover:border-blue-400 hover:bg-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed",
                              )}
                            >
                              <span>{row.par ? "Requested" : "Request"}</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail Modal */}
      {selectedRow && (
        <Modal
          open={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedRow(null);
          }}
          contentClassName="max-w-4xl max-h-[90vh] overflow-hidden"
          overlayClassName="bg-black/60 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{selectedRow.competency.name}</h2>
              <span
                className={cn(
                  "mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-semibold",
                  getLevelBadgeClass(selectedRow.level.name),
                )}
              >
                {selectedRow.level.name}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowDetailModal(false);
                setSelectedRow(null);
              }}
              className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-[calc(90vh-80px)] overflow-y-auto p-6">
            {error && <Alert variant="error" className="mb-4">{error}</Alert>}
            {success && <Alert variant="success" className="mb-4">{success}</Alert>}

            {/* Apply Button */}
            {!selectedRow.trainingRequest && selectedRow.areRequirementsMet && (
              <div className="mb-6 flex justify-end">
                <button
                  type="button"
                  onClick={handleApply.bind(null, selectedRow)}
                  disabled={isPending}
                  className="cursor-pointer rounded-md border border-blue-400/40 px-3 py-1 text-xs font-semibold text-blue-200 transition hover:border-blue-400 hover:bg-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Applying..." : "Apply"}
                </button>
              </div>
            )}

            {/* Requirements Section */}
            {unmetRequirements.length > 0 && (
              <Card className="mb-6 border border-slate-800/80 bg-slate-950/50">
                <CardContent className="space-y-3 p-6">
                  <div className="flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-amber-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <h3 className="text-sm font-semibold text-amber-400">Requirements needed</h3>
                  </div>
                  <p className="text-sm text-slate-300">
                    To apply for this competency level, you need to complete the following:
                  </p>
                  <div className="space-y-2">
                    {unmetRequirements.map((req, index) => (
                      <div
                        key={`${req.requiredLevel.competency.id}-${req.requiredLevel.name}-${index}`}
                        className="flex items-center gap-2 text-sm"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4 text-slate-500"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="8" x2="12" y2="12"></line>
                          <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        <span className="text-slate-200">
                          {req.requiredLevel.competency.name} - {req.requiredLevel.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Training Request and Validation Cards */}
            {(selectedRow.trainingRequest || isProjectApproved || selectedRow.vsr) && (
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                {selectedRow.trainingRequest && (
                  <Card className="border border-slate-800/80 bg-slate-950/50">
                    <CardContent className="space-y-3 p-6">
                      <h3 className="text-lg font-semibold text-white">Training Request</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-300">Applied at:</span>
                          <span className="text-slate-200">
                            {formatDate(selectedRow.trainingRequest.requestedDate)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-300">Training Status:</span>
                          <span
                            className={cn(
                              "inline-block rounded-md px-2 py-0.5 text-sm font-semibold whitespace-nowrap",
                              getStatusBadgeClass(selectedRow.trainingRequest.status),
                            )}
                          >
                            {getTrainingRequestStatusLabel(selectedRow.trainingRequest.status, statusLabels)}
                          </span>
                        </div>
                        {selectedRow.trainingRequest.status === 4 && (
                          <div className="mt-4">
                            <button
                              type="button"
                              onClick={handleOpenHomeworkModal}
                              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer"
                            >
                              Submit Homework
                            </button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {selectedRow.vsr && (
                  <Card className="border border-slate-800/80 bg-slate-950/50">
                    <CardContent className="space-y-3 p-6">
                      <h3 className="text-lg font-semibold text-white">Validation</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-300">VSR ID:</span>
                          <span className="text-slate-200">{selectedRow.vsr.vsrId}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-300">Validation Status:</span>
                          <span
                            className={cn(
                              "inline-block rounded-md px-2 py-0.5 text-xs font-semibold",
                              getVSRStatusBadgeClass(selectedRow.vsr.status),
                            )}
                          >
                            {vsrStatusLabels[selectedRow.vsr.status] || "Unknown"}
                          </span>
                        </div>
                        {selectedRow.vsr.requestedDate && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-300">Requested Date:</span>
                            <span className="text-slate-200">
                              {formatDate(selectedRow.vsr.requestedDate)}
                            </span>
                          </div>
                        )}
                        {selectedRow.vsr.scheduledDate && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-300">Scheduled Date Time:</span>
                            <span className="text-slate-200">
                              {formatDateTime(selectedRow.vsr.scheduledDate)} (UK Time)
                            </span>
                          </div>
                        )}
                        {selectedRow.vsr.validatorOpsUser && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-300">Validator (Ops):</span>
                            <span className="text-slate-200">
                              {selectedRow.vsr.validatorOpsUser.name || "-"}
                            </span>
                          </div>
                        )}
                        {selectedRow.vsr.validatorTrainerUser && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-300">Validator (Trainer):</span>
                            <span className="text-slate-200">
                              {selectedRow.vsr.validatorTrainerUser.name || "-"}
                            </span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Project Submission */}
            {selectedRow.trainingRequest &&
              (selectedRow.trainingRequest.status === 5 || selectedRow.trainingRequest.status === 8) && (
                <div id="project-submission-section" className="mb-6">
                  <Card className="border border-slate-800/80 bg-slate-950/50">
                    <CardContent className="space-y-4 p-6">
                      <h3 className="text-lg font-semibold text-white">Submit Project</h3>
                      <div className="space-y-3">
                        <Label htmlFor="project-document-link" className="text-sm font-medium text-slate-200">
                          Project document link
                        </Label>
                        <Input
                          id="project-document-link"
                          type="url"
                          value={projectDetails}
                          onChange={(e) => setProjectDetails(e.target.value)}
                          placeholder="Enter document link..."
                          disabled={submittingProject || isPending || !isProjectEditable}
                          className="w-full"
                        />
                        {isProjectSubmitted && selectedRow.projectApproval && (
                          <div className="text-sm border-t border-slate-800/80 pt-3">
                            <div className="flex gap-6">
                              <div className="space-y-2 flex-1">
                                {selectedRow.projectApproval.requestedDate && (
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-slate-300">Submitted Date:</span>
                                    <span className="text-slate-200">
                                      {formatDate(selectedRow.projectApproval.requestedDate)}
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-300">Status:</span>
                                  <span
                                    className={cn(
                                      "inline-block max-w-[140px] rounded-md px-2 py-0.5 text-sm font-semibold",
                                      getVPAStatusBadgeClass(selectedRow.projectApproval.status),
                                    )}
                                  >
                                    {getVPAStatusLabel(selectedRow.projectApproval.status, vpaStatusLabels)}
                                  </span>
                                </div>
                                {selectedRow.projectApproval.status === 1 &&
                                  selectedRow.projectApproval.assignedToUser && (
                                    <>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-slate-300">Approved by:</span>
                                        <span className="text-slate-200">
                                          {selectedRow.projectApproval.assignedToUser.name || "Unknown"}
                                        </span>
                                      </div>
                                      {selectedRow.projectApproval.responseDate && (
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-slate-300">Approved at:</span>
                                          <span className="text-slate-200">
                                            {formatDate(selectedRow.projectApproval.responseDate)}
                                          </span>
                                        </div>
                                      )}
                                    </>
                                  )}
                                {selectedRow.projectApproval.status === 2 && (
                                  <>
                                    {selectedRow.projectApproval.assignedToUser && (
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-slate-300">Rejected by:</span>
                                        <span className="text-slate-200">
                                          {selectedRow.projectApproval.assignedToUser.name || "Unknown"}
                                        </span>
                                      </div>
                                    )}
                                    {selectedRow.projectApproval.responseDate && (
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-slate-300">Rejected at:</span>
                                        <span className="text-slate-200">
                                          {formatDate(selectedRow.projectApproval.responseDate)}
                                        </span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                              {selectedRow.projectApproval.status === 2 &&
                                selectedRow.projectApproval.rejectionReason && (
                                  <div className="flex-1">
                                    <div className="flex flex-col gap-2">
                                      <span className="font-medium text-slate-300">Rejection reason:</span>
                                      <span className="text-slate-200">
                                        {selectedRow.projectApproval.rejectionReason}
                                      </span>
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>
                        )}
                        {!isProjectApproved && (
                          <button
                            type="button"
                            onClick={handleSubmitProject}
                            disabled={submittingProject || isPending || !isProjectEditable || isProjectDetailsEmpty}
                            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                          >
                            {submittingProject || isPending
                              ? "Submitting..."
                              : selectedRow.projectApproval?.status === 2 ||
                                  selectedRow.projectApproval?.status === 3
                                ? "Resubmit"
                                : isProjectSubmitted
                                  ? "Submitted"
                                  : "Submit"}
                          </button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

            {/* Level Content */}
            <div className="space-y-6">
              {/* Training Plan Document */}
              <Card className="border border-slate-800/80 bg-slate-950/50">
                <CardContent className="space-y-6 p-6">
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-white">Training Plan Document</h2>
                    <div className="text-sm">
                      <a
                        href={selectedRow.level.trainingPlanDocument || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="!text-blue-400 hover:!text-blue-300 underline cursor-pointer"
                      >
                        {selectedRow.level.trainingPlanDocument}
                      </a>
                    </div>
                  </div>
                  <hr className="border-slate-800/80" />
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-white">What team member should know</h2>
                    <div
                      className="text-sm text-slate-100 [&_p]:mb-2 [&_p]:leading-relaxed [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:leading-relaxed [&_a]:!text-blue-500 [&_a]:underline [&_a:hover]:!text-blue-400 [&_a:visited]:!text-blue-500 [&_strong]:font-semibold [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2 [&_h1]:leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:leading-relaxed [&_*]:break-words"
                      dangerouslySetInnerHTML={{
                        __html: selectedRow.level.teamKnowledge || "",
                      }}
                    />
                  </div>
                  <hr className="border-slate-800/80" />
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-white">Eligibility criteria</h2>
                    <div
                      className="text-sm text-slate-100 [&_p]:mb-2 [&_p]:leading-relaxed [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:leading-relaxed [&_a]:!text-blue-500 [&_a]:underline [&_a:hover]:!text-blue-400 [&_a:visited]:!text-blue-500 [&_strong]:font-semibold [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2 [&_h1]:leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:leading-relaxed [&_*]:break-words"
                      dangerouslySetInnerHTML={{
                        __html: selectedRow.level.eligibilityCriteria || "",
                      }}
                    />
                  </div>
                  <hr className="border-slate-800/80" />
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-white">Verification</h2>
                    <div
                      className="text-sm text-slate-100 [&_p]:mb-2 [&_p]:leading-relaxed [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:leading-relaxed [&_a]:!text-blue-500 [&_a]:underline [&_a:hover]:!text-blue-400 [&_a:visited]:!text-blue-500 [&_strong]:font-semibold [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2 [&_h1]:leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:leading-relaxed [&_*]:break-words"
                      dangerouslySetInnerHTML={{
                        __html: selectedRow.level.verification || "",
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Relevant Links */}
              {selectedRow.competency.relevantLinks && (
                <Card className="border border-slate-800/80 bg-slate-950/50">
                  <CardContent className="space-y-6 p-6">
                    <div className="space-y-4">
                      <h2 className="text-lg font-semibold text-white">Relevant Links</h2>
                      <div
                        className="text-sm text-slate-100 [&_p]:mb-2 [&_p]:leading-relaxed [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:leading-relaxed [&_a]:!text-blue-500 [&_a]:underline [&_a:hover]:!text-blue-400 [&_a:visited]:!text-blue-500 [&_strong]:font-semibold [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2 [&_h1]:leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:leading-relaxed [&_*]:break-words [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-600 [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:border-slate-600 [&_td]:p-2"
                        dangerouslySetInnerHTML={{
                          __html: selectedRow.competency.relevantLinks,
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Apply Confirmation Modal */}
      <Modal
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        contentClassName="max-w-md"
      >
        <div className="border-b border-slate-800/80 bg-slate-950/70 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Confirm Application</h2>
        </div>
        <div className="p-6">
          <p className="mb-4 text-sm text-slate-300">You are about to apply for</p>
          <div className="mb-6 flex items-center gap-3">
            <span className="text-lg font-semibold text-white">
              {selectedRow?.competency.name}
            </span>
            {selectedRow && (
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-sm font-semibold",
                  getLevelBadgeClass(selectedRow.level.name),
                )}
              >
                {selectedRow.level.name}
              </span>
            )}
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              className="rounded-md border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmApply}
              disabled={isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Applying..." : "Yes"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Training Slot Selection Form Modal */}
      <Modal
        open={showTrainingSlotFormModal}
        onClose={() => setShowTrainingSlotFormModal(false)}
        contentClassName="max-w-md"
      >
        <div className="border-b border-slate-800/80 bg-slate-950/70 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Training Slot Selection</h2>
        </div>
        <div className="p-6">
          <p className="mb-4 text-sm text-slate-300">
            Please fill out the Training Slot Selection Form to complete your application.
          </p>
          <div className="mb-6">
            <a
              href="https://docs.google.com/forms/d/e/1FAIpQLSePiV-8zYEQjmT56YE1dwbC-Yki_Xc1Ou7Z5nFvUiGJvVOgCg/viewform"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              Open Training Slot Selection Form
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </div>
          <div className="flex items-center justify-end">
            <Button
              type="button"
              onClick={() => setShowTrainingSlotFormModal(false)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Homework Submission Modal */}
      <Modal
        open={showHomeworkModal}
        onClose={handleCloseHomeworkModal}
        contentClassName="max-w-4xl max-h-[90vh] overflow-hidden"
        overlayClassName="bg-black/60 backdrop-blur-sm"
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Submit Homework</h2>
          <button
            type="button"
            onClick={handleCloseHomeworkModal}
            className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {error && <Alert variant="error" className="mb-4">{error}</Alert>}
          {success && <Alert variant="success" className="mb-4">{success}</Alert>}

          {homeworkData ? (
            <div className="space-y-4">
              {homeworkData.sessions.map((session) => {
                const existingHomework = homeworkData.homework.find(
                  (h) => h.sessionId === session.id,
                );
                const homeworkUrl = homeworkUrls.get(session.id) || existingHomework?.homeworkUrl || "";
                const hasSubmittedUrl = !!existingHomework?.homeworkUrl;
                const isCompleted = existingHomework?.completed || false;

                return (
                  <div key={session.id} className="space-y-2">
                    <Label className="text-sm font-medium text-slate-200">
                      Homework {session.sessionNumber}
                      {session.sessionDate && (
                        <span className="ml-2 text-xs text-slate-400">
                          ({formatDate(session.sessionDate)})
                        </span>
                      )}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="url"
                        placeholder="Enter homework submission URL..."
                        value={homeworkUrl}
                        onChange={(e) => {
                          const newUrls = new Map(homeworkUrls);
                          newUrls.set(session.id, e.target.value);
                          setHomeworkUrls(newUrls);
                        }}
                        disabled={isCompleted || submittingSessionId === session.id}
                        className="flex-1 min-w-[400px]"
                      />
                      <Button
                        type="button"
                        onClick={() => handleSubmitHomework(session.id, session.sessionNumber)}
                        disabled={isCompleted || submittingSessionId === session.id || !homeworkUrl.trim()}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submittingSessionId === session.id
                          ? "Submitting..."
                          : isCompleted
                            ? "Completed"
                            : hasSubmittedUrl
                              ? "Update"
                              : "Submit"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Loading homework data...</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
