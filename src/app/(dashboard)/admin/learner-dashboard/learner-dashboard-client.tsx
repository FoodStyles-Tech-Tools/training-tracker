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
import { QuillEditor } from "@/components/ui/quill-editor";
import type { Competency, CompetencyLevel } from "@/db/schema";
import { createTrainingRequestAction, submitHomeworkAction, submitProjectAction } from "./actions";
import { X } from "lucide-react";

type CompetencyWithLevels = Competency & {
  levels: CompetencyLevel[];
  requirements: Array<{
    requiredLevel: {
      id: string;
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

interface LearnerDashboardClientProps {
  competencies: CompetencyWithLevels[];
  userId: string;
  trainingRequests?: TrainingRequest[];
  projectApprovals?: ProjectApproval[];
  statusLabels: string[];
  vpaStatusLabels: string[];
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

export function LearnerDashboardClient({
  competencies,
  userId,
  trainingRequests = [],
  projectApprovals = [],
  statusLabels,
  vpaStatusLabels,
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

  // Initialize project details from current project approval
  useEffect(() => {
    if (currentProjectApproval?.projectDetails) {
      setProjectDetails(currentProjectApproval.projectDetails);
    } else {
      setProjectDetails("");
    }
  }, [currentProjectApproval]);

  // Helper to check if QuillJS content is empty
  const isProjectDetailsEmpty = useMemo(() => {
    if (!projectDetails || projectDetails.trim() === "" || projectDetails === "<p><br></p>") {
      return true;
    }
    // Remove HTML tags and check if there's actual text content
    const textOnly = projectDetails.replace(/<[^>]*>/g, "").trim();
    return textOnly === "";
  }, [projectDetails]);

  // VPA Status mapping:
  // Status 0 = Pending Validation Project Approval (read-only after submission)
  // Status 1 = Approved (read-only)
  // Status 2 = Rejected (editable, can resubmit)
  // Status 3 = Resubmit for Re-validation (read-only)
  const isProjectSubmitted = !!currentProjectApproval; // Project is submitted if approval exists
  const isProjectEditable = !currentProjectApproval || currentProjectApproval.status === 2; // Only editable when rejected (status 2) or not yet submitted
  const isProjectApproved = currentProjectApproval && currentProjectApproval.status === 1;

  // Check if all requirements are met
  // A requirement is met if the user has a training request with status = 8 (Training Completed)
  const areRequirementsMet = useMemo(() => {
    if (!selectedCompetency || !selectedLevelData) return true; // No requirements = requirements met
    
    if (selectedCompetency.requirements.length === 0) return true; // No requirements = requirements met

    // Check each requirement
    return selectedCompetency.requirements.every((req) => {
      const requiredLevelId = req.requiredLevel.id;
      const trainingRequest = trainingRequests.find(
        (tr) => tr.competencyLevelId === requiredLevelId,
      );
      
      // Requirement is met if training request exists and status = 8 (Training Completed)
      return trainingRequest && trainingRequest.status === 8;
    });
  }, [selectedCompetency, trainingRequests, selectedLevelData]);

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
    
    const hasTrainingPlan = level.trainingPlanDocument && level.trainingPlanDocument.trim() !== "";
    const hasTeamKnowledge = level.teamKnowledge && level.teamKnowledge.trim() !== "";
    const hasEligibilityCriteria = level.eligibilityCriteria && level.eligibilityCriteria.trim() !== "";
    const hasVerification = level.verification && level.verification.trim() !== "";
    
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
        setSuccess(`Homework ${sessionNumber} submitted successfully`);
        // Update homework data
        setHomeworkData((prev) => {
          if (!prev) return null;
          const updatedHomework = [...prev.homework];
          const existingIndex = updatedHomework.findIndex((h) => h.sessionId === sessionId);
          if (existingIndex >= 0) {
            updatedHomework[existingIndex] = {
              sessionId,
              homeworkUrl,
              completed: true,
            };
          } else {
            updatedHomework.push({
              sessionId,
              homeworkUrl,
              completed: true,
            });
          }
          return { ...prev, homework: updatedHomework };
        });
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
                </div>
              </div>

              {/* Requirements Section */}
              {selectedLevelData &&
                selectedCompetency.requirements.length > 0 && (
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
                        To apply for this competency, you need to complete the following:
                      </p>
                      <div className="space-y-2">
                        {selectedCompetency.requirements.map((req, index) => {
                          const requiredLevelId = req.requiredLevel.id;
                          const trainingRequest = trainingRequests.find(
                            (tr) => tr.competencyLevelId === requiredLevelId,
                          );
                          const isRequirementMet = trainingRequest && trainingRequest.status >= 5;

                          return (
                            <div
                              key={`${req.requiredLevel.competency.id}-${req.requiredLevel.name}-${index}`}
                              className="flex items-center gap-2 text-sm"
                            >
                              {isRequirementMet ? (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4 text-emerald-400"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                </svg>
                              ) : (
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
                              )}
                              <span className={isRequirementMet ? "text-emerald-200" : "text-slate-200"}>
                                {req.requiredLevel.competency.name} - {req.requiredLevel.name}
                                {isRequirementMet && (
                                  <span className="ml-2 text-xs text-emerald-400">(Completed)</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

              {/* Training Request and Validation Cards - Side by side */}
              {(currentTrainingRequest || isProjectApproved) && (
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

                  {/* Validation Interface - Only show after project is approved */}
                  {isProjectApproved && (
                    <Card className="border border-slate-800/80 bg-slate-950/50">
                      <CardContent className="space-y-3 p-6">
                        <h3 className="text-lg font-semibold text-white">Validation</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-300">Validation Status:</span>
                            <span className="text-slate-200">Pending Validation</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Project Submission - Show if training request status is 5 (Sessions Completed) or 8 (Training Completed) */}
              {currentTrainingRequest && (currentTrainingRequest.status === 5 || currentTrainingRequest.status === 8) && (
                <Card className="mb-6 border border-slate-800/80 bg-slate-950/50">
                  <CardContent className="space-y-4 p-6">
                    <h3 className="text-lg font-semibold text-white">Submit Project</h3>
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-slate-200">Project details</label>
                      <QuillEditor
                        value={projectDetails}
                        onChange={(value) => setProjectDetails(value)}
                        placeholder={isProjectDetailsEmpty ? "Enter project details..." : undefined}
                        disabled={submittingProject || isPending || !isProjectEditable}
                        className="min-h-[200px]"
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
                            : currentProjectApproval?.status === 2
                              ? "Resubmit"
                              : isProjectSubmitted
                                ? "Submitted"
                                : "Submit"}
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}


              {/* Level Content */}
              {selectedLevelData && (
                <div className="space-y-6">
                  {/* Training Plan Document */}
                  <Card className="border border-slate-800/80 bg-slate-950/50">
                    <CardContent className="space-y-3 p-6">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-200">
                          Training Plan Document
                        </label>
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
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-200">
                          What team member should know
                        </label>
                        <div
                          className="rounded-md border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-100 [&_p]:mb-2 [&_p]:leading-relaxed [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:leading-relaxed [&_a]:!text-blue-500 [&_a]:underline [&_a:hover]:!text-blue-400 [&_a:visited]:!text-blue-500 [&_strong]:font-semibold [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2 [&_h1]:leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:leading-relaxed [&_*]:break-words"
                          dangerouslySetInnerHTML={{
                            __html: selectedLevelData.teamKnowledge,
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-200">
                          Eligibility criteria
                        </label>
                        <div
                          className="rounded-md border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-100 [&_p]:mb-2 [&_p]:leading-relaxed [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:leading-relaxed [&_a]:!text-blue-500 [&_a]:underline [&_a:hover]:!text-blue-400 [&_a:visited]:!text-blue-500 [&_strong]:font-semibold [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2 [&_h1]:leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:leading-relaxed [&_*]:break-words"
                          dangerouslySetInnerHTML={{
                            __html: selectedLevelData.eligibilityCriteria,
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-200">Verification</label>
                        <div
                          className="rounded-md border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-100 [&_p]:mb-2 [&_p]:leading-relaxed [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:leading-relaxed [&_a]:!text-blue-500 [&_a]:underline [&_a:hover]:!text-blue-400 [&_a:visited]:!text-blue-500 [&_strong]:font-semibold [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2 [&_h1]:leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:leading-relaxed [&_*]:break-words"
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
                      <CardContent className="space-y-3 p-6">
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-slate-200">
                            Relevant Links
                          </label>
                          <div
                            className="rounded-md border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-100 [&_p]:mb-2 [&_p]:leading-relaxed [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:leading-relaxed [&_a]:!text-blue-500 [&_a]:underline [&_a:hover]:!text-blue-400 [&_a:visited]:!text-blue-500 [&_strong]:font-semibold [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2 [&_h1]:leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:leading-relaxed [&_*]:break-words [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-600 [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:border-slate-600 [&_td]:p-2"
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
                const isSubmitted = existingHomework?.completed || false;

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
                        disabled={isSubmitted || submittingSessionId === session.id}
                        className="flex-1 min-w-[400px]"
                      />
                      <Button
                        type="button"
                        onClick={() => handleSubmitHomework(session.id, session.sessionNumber)}
                        disabled={isSubmitted || submittingSessionId === session.id || !homeworkUrl.trim()}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submittingSessionId === session.id
                          ? "Submitting..."
                          : isSubmitted
                            ? "Submitted"
                            : "Submit"}
                      </Button>
                    </div>
                    {isSubmitted && homeworkUrl && (
                      <p className="text-xs text-slate-400">
                        Submitted: <a href={homeworkUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">{homeworkUrl}</a>
                      </p>
                    )}
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

