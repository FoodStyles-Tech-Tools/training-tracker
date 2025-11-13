"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { Competency, CompetencyLevel } from "@/db/schema";
import { createTrainingRequestAction, submitHomeworkAction, submitProjectAction } from "./actions";
import { getVSRStatusBadgeClass } from "@/lib/vsr-config";
import { X } from "lucide-react";

type CompetencyWithLevels = Competency & {
  levels: CompetencyLevel[];
  requirements: Array<{
    requiredLevel: CompetencyLevel & {
      competency: Competency;
    };
  }>;
};

type TrainingRequest = {
  id: string;
  trId: string;
  requestedDate: Date;
  competencyLevelId: string;
  status: number; // Status values defined in env.TRAINING_REQUEST_STATUS
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

interface LearnerDashboardClientProps {
  competencies: CompetencyWithLevels[];
  userId: string;
  trainingRequests?: TrainingRequest[];
  projectApprovals?: ProjectApproval[];
  validationScheduleRequests?: ValidationScheduleRequest[];
  statusLabels: string[];
  vpaStatusLabels: string[];
  vsrStatusLabels: string[];
}

type LevelType = "basic" | "competent" | "advanced";

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
  statusLabels,
  vpaStatusLabels,
  vsrStatusLabels,
}: LearnerDashboardClientProps) {
  const [selectedCompetencyId, setSelectedCompetencyId] = useState<string>(
    competencies[0]?.id ?? "",
  );
  const [selectedLevel, setSelectedLevel] = useState<LevelType>("basic");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
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
  const router = useRouter();

  const selectedCompetency = useMemo(
    () => competencies.find((c) => c.id === selectedCompetencyId),
    [competencies, selectedCompetencyId],
  );

  const selectedLevelData = useMemo(() => {
    if (!selectedCompetency) return null;
    return selectedCompetency.levels.find(
      (level) => level.name.toLowerCase() === selectedLevel,
    );
  }, [selectedCompetency, selectedLevel]);

  // Auto-select first level with content if selected level has no content
  useEffect(() => {
    if (!selectedCompetency || !selectedLevelData) return;
    
    // Only auto-select if current level has no content
    if (!hasLevelContent(selectedLevelData)) {
      // Check levels in priority order: basic, competent, advanced
      const levelOrder: LevelType[] = ["basic", "competent", "advanced"];
      let firstLevelWithContent: LevelType | null = null;
      
      for (const levelType of levelOrder) {
        const levelData = selectedCompetency.levels.find(
          (l) => l.name.toLowerCase() === levelType,
        );
        if (levelData && hasLevelContent(levelData)) {
          firstLevelWithContent = levelType;
          break;
        }
      }
      
      if (firstLevelWithContent && firstLevelWithContent !== selectedLevel) {
        setSelectedLevel(firstLevelWithContent);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompetency?.id, selectedLevelData?.id]);

  // Get training request for selected competency and level
  const currentTrainingRequest = useMemo(() => {
    if (!selectedLevelData) return null;
    return trainingRequests.find(
      (tr) => tr.competencyLevelId === selectedLevelData.id,
    );
  }, [trainingRequests, selectedLevelData]);

  // Get project approval for selected competency and level
  const currentProjectApproval = useMemo(() => {
    if (!selectedLevelData) return null;
    return projectApprovals.find(
      (pa) => pa.competencyLevelId === selectedLevelData.id,
    );
  }, [projectApprovals, selectedLevelData]);

  // Get validation schedule request (VSR) for selected competency and level
  const currentVSR = useMemo(() => {
    if (!selectedLevelData) return null;
    return validationScheduleRequests.find(
      (vsr) => vsr.competencyLevelId === selectedLevelData.id,
    );
  }, [validationScheduleRequests, selectedLevelData]);

  // Initialize project details from current project approval
  useEffect(() => {
    if (currentProjectApproval?.projectDetails) {
      setProjectDetails(currentProjectApproval.projectDetails);
    } else {
      setProjectDetails("");
    }
  }, [currentProjectApproval]);

  // Helper to check if project document link is empty
  const isProjectDetailsEmpty = useMemo(() => {
    return !projectDetails || projectDetails.trim() === "";
  }, [projectDetails]);

  // VPA Status mapping:
  // Status 0 = Pending Validation Project Approval (read-only after submission)
  // Status 1 = Approved (read-only)
  // Status 2 = Rejected (editable, can resubmit)
  // Status 3 = Resubmit for Re-validation (editable, can resubmit)
  const isProjectSubmitted = !!currentProjectApproval; // Project is submitted if approval exists
  const isProjectEditable = !currentProjectApproval || currentProjectApproval.status === 2 || currentProjectApproval.status === 3; // Editable when rejected (status 2), resubmit (status 3), or not yet submitted
  const isProjectApproved = currentProjectApproval && currentProjectApproval.status === 1;

  // Get applicable requirements for the selected level
  // Default requirements are calculated programmatically (not stored in database):
  // - Competent level requires Basic level (of the same competency)
  // - Advanced level requires Basic level (of the same competency)
  // - Advanced level requires Competent level (of the same competency)
  // Only manually selected requirements (from different competencies) are stored in the database
  const applicableRequirements = useMemo(() => {
    if (!selectedCompetency || !selectedLevelData) return [];

    const selectedLevelName = selectedLevelData.name.toLowerCase();
    const requirements: Array<{
      requiredLevel: CompetencyLevel & {
        competency: Competency;
      };
    }> = [];

    // Add manually selected requirements from database (these are from different competencies)
    // These apply to all levels
    const manualRequirements = selectedCompetency.requirements.filter((req) => {
      const isSameCompetency = req.requiredLevel.competency.id === selectedCompetency.id;
      // Only include requirements from different competencies (manually set)
      return !isSameCompetency;
    });
    requirements.push(...manualRequirements);

    // Add default requirements programmatically based on selected level
    // Use a Set to track level IDs to avoid duplicates
    const addedLevelIds = new Set(
      requirements.map((req) => req.requiredLevel.id)
    );

    if (selectedLevelName === "competent" || selectedLevelName === "advanced") {
      // Competent and Advanced both require Basic level (same competency)
      const basicLevel = selectedCompetency.levels.find(
        (level) => level.name.toLowerCase() === "basic"
      );
      if (basicLevel && !addedLevelIds.has(basicLevel.id)) {
        requirements.push({
          requiredLevel: {
            ...basicLevel,
            competency: selectedCompetency,
          },
        });
        addedLevelIds.add(basicLevel.id);
      }
    }

    if (selectedLevelName === "advanced") {
      // Advanced also requires Competent level (same competency)
      const competentLevel = selectedCompetency.levels.find(
        (level) => level.name.toLowerCase() === "competent"
      );
      if (competentLevel && !addedLevelIds.has(competentLevel.id)) {
        requirements.push({
          requiredLevel: {
            ...competentLevel,
            competency: selectedCompetency,
          },
        });
        addedLevelIds.add(competentLevel.id);
      }
    }

    return requirements;
  }, [selectedCompetency, selectedLevelData]);

  // Get unmet requirements for display
  const unmetRequirements = useMemo(() => {
    if (!selectedCompetency || !selectedLevelData) return [];

    return applicableRequirements.filter((req) => {
      // Filter out requirements that are already met
      const requiredLevelId = req.requiredLevel.id;
      const trainingRequest = trainingRequests.find(
        (tr) => tr.competencyLevelId === requiredLevelId,
      );
      const isRequirementMet = trainingRequest && trainingRequest.status === 8;
      return !isRequirementMet;
    });
  }, [applicableRequirements, trainingRequests, selectedCompetency, selectedLevelData]);

  // Check if all requirements are met
  // A requirement is met if the user has a training request with status = 8 (Training Completed)
  const areRequirementsMet = useMemo(() => {
    if (!selectedCompetency || !selectedLevelData) return true; // No requirements = requirements met
    
    if (applicableRequirements.length === 0) return true; // No requirements = requirements met

    // Check each requirement
    return applicableRequirements.every((req) => {
      const requiredLevelId = req.requiredLevel.id;
      const trainingRequest = trainingRequests.find(
        (tr) => tr.competencyLevelId === requiredLevelId,
      );
      
      // Requirement is met if training request exists and status = 8 (Training Completed)
      return trainingRequest && trainingRequest.status === 8;
    });
  }, [applicableRequirements, trainingRequests, selectedCompetency, selectedLevelData]);

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

  // Check if a level has content (at least one field is filled)
  const hasLevelContent = (level: CompetencyLevel | undefined): boolean => {
    if (!level) return false;
    
    const hasTrainingPlan = !!level.trainingPlanDocument?.trim();
    const hasTeamKnowledge = !!level.teamKnowledge?.trim();
    const hasEligibilityCriteria = !!level.eligibilityCriteria?.trim();
    const hasVerification = !!level.verification?.trim();
    
    return hasTrainingPlan || hasTeamKnowledge || hasEligibilityCriteria || hasVerification;
  };

  const handleCompetencyChange = (competencyId: string) => {
    setSelectedCompetencyId(competencyId);
    
    // Find the first level with content for the new competency, checking in order: basic, competent, advanced
    const newCompetency = competencies.find((c) => c.id === competencyId);
    if (newCompetency) {
      // Check levels in priority order: basic, competent, advanced
      const levelOrder: LevelType[] = ["basic", "competent", "advanced"];
      let firstLevelWithContent: LevelType | null = null;
      
      for (const levelType of levelOrder) {
        const levelData = newCompetency.levels.find(
          (l) => l.name.toLowerCase() === levelType,
        );
        if (levelData && hasLevelContent(levelData)) {
          firstLevelWithContent = levelType;
          break;
        }
      }
      
      if (firstLevelWithContent) {
        setSelectedLevel(firstLevelWithContent);
      } else {
        setSelectedLevel("basic"); // Fallback to basic if no level has content
      }
    } else {
      setSelectedLevel("basic"); // Fallback to basic if competency not found
    }
  };

  const handleLevelChange = (level: LevelType) => {
    setSelectedLevel(level);
  };

  const handleApply = () => {
    if (!selectedLevelData) return;
    setShowConfirmModal(true);
  };

  const handleConfirmApply = () => {
    if (!selectedLevelData) return;

    setError(null);
    setSuccess(null);
    setShowConfirmModal(false);

    startTransition(async () => {
      const result = await createTrainingRequestAction(selectedLevelData.id);
      if (result.success) {
        const competencyName = selectedCompetency?.name || "this competency";
        const levelName = selectedLevelData.name;
        const successMessage = `You successfully applied for ${competencyName} - ${levelName}`;
        setSuccess(successMessage);
        // Store success message in sessionStorage to persist across refresh
        sessionStorage.setItem("trainingRequestSuccess", successMessage);
        // Show training slot selection form popup
        setShowTrainingSlotFormModal(true);
        // Refresh the data to show the new training request
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

  const handleOpenHomeworkModal = async () => {
    if (!currentTrainingRequest || !currentTrainingRequest.id) return;

    setShowHomeworkModal(true);
    setError(null);
    setSuccess(null);

    try {
      // Fetch training batch data for this training request
      const response = await fetch(`/api/training-batches?trainingRequestId=${currentTrainingRequest.id}`);
      if (response.ok) {
        const data = await response.json();
        // Find the batch that contains this training request
        const batch = data.batches?.find((b: any) => 
          b.learners?.some((l: any) => l.trainingRequestId === currentTrainingRequest.id)
        );

        if (batch) {
          // Fetch full batch details with sessions
          const batchResponse = await fetch(`/api/training-batches/${batch.id}`);
          if (batchResponse.ok) {
            const batchData = await batchResponse.json();
            setHomeworkData({
              batchId: batch.id,
              sessions: batchData.batch.sessions || [],
              homework: batchData.homework || [],
            });

            // Initialize homework URLs from existing homework data
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

  const handleCloseHomeworkModal = () => {
    setShowHomeworkModal(false);
    setHomeworkData(null);
    setHomeworkUrls(new Map());
    setSubmittingSessionId(null);
  };

  const handleSubmitHomework = async (sessionId: string, sessionNumber: number) => {
    if (!homeworkData || !currentTrainingRequest) return;

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
        
        // Reload homework data from server to get the latest state
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

              // Update homework URLs from server data
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
    if (!selectedLevelData) return;

    if (isProjectDetailsEmpty) {
      setError("Project details cannot be empty");
      return;
    }

    setSubmittingProject(true);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await submitProjectAction(selectedLevelData.id, projectDetails);
      if (result.success) {
        setSuccess("Project submitted successfully");
        // Refresh the data to show the updated project approval
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

  return (
    <div className="space-y-6">
      {/* Error/Success Messages */}
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {/* Competency Selector */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-800 bg-slate-950/50 px-6 py-4">
          <label htmlFor="competency-select" className="mb-2 block text-sm font-medium text-slate-300">
            Select Competency
          </label>
          <Select
            id="competency-select"
            value={selectedCompetencyId}
            onChange={(e) => handleCompetencyChange(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm font-semibold text-white transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {competencies.map((competency) => (
              <option key={competency.id} value={competency.id}>
                {competency.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {selectedCompetency && (
            <>
              {/* Level Tabs */}
              <div className="mb-6 border-b border-slate-800">
                <nav className="-mb-px flex space-x-6" aria-label="Levels">
                  {["basic", "competent", "advanced"].map((level) => {
                    const levelData = selectedCompetency.levels.find(
                      (l) => l.name.toLowerCase() === level,
                    );
                    if (!levelData) return null;

                    // Only show tab if level has content
                    if (!hasLevelContent(levelData)) return null;

                    const isActive = selectedLevel === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => handleLevelChange(level as LevelType)}
                        className={`border-b-2 px-1 py-3 text-sm font-semibold transition ${
                          isActive
                            ? "border-blue-500 text-blue-200"
                            : "border-transparent text-slate-300 hover:border-slate-600 hover:text-slate-200"
                        }`}
                      >
                        {levelData.name}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Competency Name and Level */}
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="flex items-center gap-3 text-xl font-semibold text-white">
                  <span>{selectedCompetency.name}</span>
                  {selectedLevelData && (
                    <span
                      className={`rounded-md px-2 py-0.5 text-sm font-semibold ${getLevelBadgeClass(
                        selectedLevelData.name,
                      )}`}
                    >
                      {selectedLevelData.name}
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2">
                  {currentTrainingRequest?.status === 8 && currentVSR?.status === 4 ? (
                    <button
                      type="button"
                      onClick={() => {
                        // Scroll to project submission section
                        const projectSection = document.getElementById("project-submission-section");
                        if (projectSection) {
                          projectSection.scrollIntoView({ behavior: "smooth", block: "start" });
                          projectSection.focus();
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      Request Project
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleApply}
                      disabled={isPending || !!currentTrainingRequest || !areRequirementsMet}
                      className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                    >
                      {isPending
                        ? "Applying..."
                        : currentTrainingRequest
                          ? "Applied"
                          : !areRequirementsMet
                            ? "Requirements Not Met"
                            : "Apply"}
                    </button>
                  )}
                </div>
              </div>

              {/* Requirements Section - Only show unmet requirements */}
              {selectedLevelData &&
                unmetRequirements.length > 0 && (
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
                        <h3 className="text-sm font-semibold text-amber-400">
                          Requirements needed
                        </h3>
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

              {/* Training Request and Validation Cards - Side by side */}
              {(currentTrainingRequest || isProjectApproved || currentVSR) && (
                <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Training Request Display - Only show if training request exists */}
                  {currentTrainingRequest && (
                    <Card className="border border-slate-800/80 bg-slate-950/50">
                      <CardContent className="space-y-3 p-6">
                        <h3 className="text-lg font-semibold text-white">Training Request</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-300">Applied at:</span>
                            <span className="text-slate-200">
                              {formatDate(currentTrainingRequest.requestedDate)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-300">Training Status:</span>
                            <span className="text-slate-200">
                              {statusLabels[currentTrainingRequest.status] || "Unknown"}
                            </span>
                          </div>
                          {/* Homework Submit Button - Only show if status is 4 */}
                          {currentTrainingRequest.status === 4 && (
                            <div className="mt-4">
                              <button
                                type="button"
                                onClick={handleOpenHomeworkModal}
                                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                              >
                                Submit Homework
                              </button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Validation Interface - Show when VSR exists (including Fail status) */}
                  {currentVSR && (
                    <Card className="border border-slate-800/80 bg-slate-950/50">
                      <CardContent className="space-y-3 p-6">
                        <h3 className="text-lg font-semibold text-white">Validation</h3>
                        <div className="space-y-2 text-sm">
                          {currentVSR ? (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-300">VSR ID:</span>
                                <span className="text-slate-200">{currentVSR.vsrId}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-300">Validation Status:</span>
                                <span
                                  className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${getVSRStatusBadgeClass(
                                    currentVSR.status,
                                  )}`}
                                >
                                  {vsrStatusLabels[currentVSR.status] || "Unknown"}
                                </span>
                              </div>
                              {currentVSR.requestedDate && (
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-300">Requested Date:</span>
                                  <span className="text-slate-200">
                                    {formatDate(currentVSR.requestedDate)}
                                  </span>
                                </div>
                              )}
                              {currentVSR.scheduledDate && (
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-300">Scheduled Date Time:</span>
                                  <span className="text-slate-200">
                                    {formatDateTime(currentVSR.scheduledDate)} (UK Time)
                                  </span>
                                </div>
                              )}
                              {currentVSR.validatorOpsUser && (
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-300">Validator (Ops):</span>
                                  <span className="text-slate-200">
                                    {currentVSR.validatorOpsUser.name || "-"}
                                  </span>
                                </div>
                              )}
                              {currentVSR.validatorTrainerUser && (
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-300">Validator (Trainer):</span>
                                  <span className="text-slate-200">
                                    {currentVSR.validatorTrainerUser.name || "-"}
                                  </span>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-300">Validation Status:</span>
                              <span className="text-slate-200">Pending Validation</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Project Submission - Show if training request status is 5 (Sessions Completed) or 8 (Training Completed) */}
              {currentTrainingRequest && (currentTrainingRequest.status === 5 || currentTrainingRequest.status === 8) && (
                <div id="project-submission-section">
                <Card className="mb-6 border border-slate-800/80 bg-slate-950/50">
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
                      {/* Status Details - Show when project is submitted */}
                      {isProjectSubmitted && currentProjectApproval && (
                        <div className="text-sm border-t border-slate-800/80 pt-3">
                          <div className="flex gap-6">
                            <div className="space-y-2 flex-1">
                              {currentProjectApproval.requestedDate && (
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-300">Submitted Date:</span>
                                  <span className="text-slate-200">
                                    {formatDate(currentProjectApproval.requestedDate)}
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-300">Status:</span>
                                <span
                                  className={`font-semibold ${
                                    currentProjectApproval.status === 0
                                      ? "text-slate-200"
                                      : currentProjectApproval.status === 1
                                        ? "text-emerald-400"
                                        : currentProjectApproval.status === 2
                                          ? "text-red-400"
                                          : "text-slate-200"
                                  }`}
                                >
                                  {vpaStatusLabels[currentProjectApproval.status] || "Unknown"}
                                </span>
                              </div>
                              {currentProjectApproval.status === 1 && currentProjectApproval.assignedToUser && (
                                <>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-slate-300">Approved by:</span>
                                    <span className="text-slate-200">
                                      {currentProjectApproval.assignedToUser.name || "Unknown"}
                                    </span>
                                  </div>
                                  {currentProjectApproval.responseDate && (
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-slate-300">Approved at:</span>
                                      <span className="text-slate-200">
                                        {formatDate(currentProjectApproval.responseDate)}
                                      </span>
                                    </div>
                                  )}
                                </>
                              )}
                              {currentProjectApproval.status === 2 && (
                                <>
                                  {currentProjectApproval.assignedToUser && (
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-slate-300">Rejected by:</span>
                                      <span className="text-slate-200">
                                        {currentProjectApproval.assignedToUser.name || "Unknown"}
                                      </span>
                                    </div>
                                  )}
                                  {currentProjectApproval.responseDate && (
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-slate-300">Rejected at:</span>
                                      <span className="text-slate-200">
                                        {formatDate(currentProjectApproval.responseDate)}
                                      </span>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                            {currentProjectApproval.status === 2 && currentProjectApproval.rejectionReason && (
                              <div className="flex-1">
                                <div className="flex flex-col gap-2">
                                  <span className="font-medium text-slate-300">Rejection reason:</span>
                                  <span className="text-slate-200">
                                    {currentProjectApproval.rejectionReason}
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
                          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                        >
                          {submittingProject || isPending
                            ? "Submitting..."
                            : currentProjectApproval?.status === 2 || currentProjectApproval?.status === 3
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
              {selectedLevelData && (
                <div className="space-y-6">
                  {/* Training Plan Document */}
                  <Card className="border border-slate-800/80 bg-slate-950/50">
                    <CardContent className="space-y-6 p-6">
                      <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-white">
                          Training Plan Document
                        </h2>
                        <div className="text-sm">
                          <a
                            href={selectedLevelData.trainingPlanDocument}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="!text-blue-400 hover:!text-blue-300 underline"
                          >
                            {selectedLevelData.trainingPlanDocument}
                          </a>
                        </div>
                      </div>
                      <hr className="border-slate-800/80" />
                      <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-white">
                          What team member should know
                        </h2>
                        <div
                          className="text-sm text-slate-100 [&_p]:mb-2 [&_p]:leading-relaxed [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:leading-relaxed [&_a]:!text-blue-500 [&_a]:underline [&_a:hover]:!text-blue-400 [&_a:visited]:!text-blue-500 [&_strong]:font-semibold [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2 [&_h1]:leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:leading-relaxed [&_*]:break-words"
                          dangerouslySetInnerHTML={{
                            __html: selectedLevelData.teamKnowledge,
                          }}
                        />
                      </div>
                      <hr className="border-slate-800/80" />
                      <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-white">
                          Eligibility criteria
                        </h2>
                        <div
                          className="text-sm text-slate-100 [&_p]:mb-2 [&_p]:leading-relaxed [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:leading-relaxed [&_a]:!text-blue-500 [&_a]:underline [&_a:hover]:!text-blue-400 [&_a:visited]:!text-blue-500 [&_strong]:font-semibold [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2 [&_h1]:leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:leading-relaxed [&_*]:break-words"
                          dangerouslySetInnerHTML={{
                            __html: selectedLevelData.eligibilityCriteria,
                          }}
                        />
                      </div>
                      <hr className="border-slate-800/80" />
                      <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-white">Verification</h2>
                        <div
                          className="text-sm text-slate-100 [&_p]:mb-2 [&_p]:leading-relaxed [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:leading-relaxed [&_a]:!text-blue-500 [&_a]:underline [&_a:hover]:!text-blue-400 [&_a:visited]:!text-blue-500 [&_strong]:font-semibold [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2 [&_h1]:leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:leading-relaxed [&_*]:break-words"
                          dangerouslySetInnerHTML={{
                            __html: selectedLevelData.verification,
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Relevant Links */}
                  {selectedCompetency.relevantLinks && (
                    <Card className="border border-slate-800/80 bg-slate-950/50">
                      <CardContent className="space-y-6 p-6">
                        <div className="space-y-4">
                          <h2 className="text-lg font-semibold text-white">
                            Relevant Links
                          </h2>
                          <div
                            className="text-sm text-slate-100 [&_p]:mb-2 [&_p]:leading-relaxed [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:leading-relaxed [&_a]:!text-blue-500 [&_a]:underline [&_a:hover]:!text-blue-400 [&_a:visited]:!text-blue-500 [&_strong]:font-semibold [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2 [&_h1]:leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:leading-relaxed [&_*]:break-words [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-600 [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:border-slate-600 [&_td]:p-2"
                            dangerouslySetInnerHTML={{
                              __html: selectedCompetency.relevantLinks,
                            }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

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
              {selectedCompetency?.name}
            </span>
            {selectedLevelData && (
              <span
                className={`rounded-md px-2 py-0.5 text-sm font-semibold ${getLevelBadgeClass(
                  selectedLevelData.name,
                )}`}
              >
                {selectedLevelData.name}
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
            className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
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

