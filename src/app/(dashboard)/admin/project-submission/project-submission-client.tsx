"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { ValidationProjectApproval, Competency, TrainingRequest } from "@/db/schema";
import { getVPAStatusLabel, getVPAStatusBadgeClass } from "@/lib/vpa-config";
import { getCompetencyLevelBadgeClass } from "@/lib/competency-level-config";
import { getTrainingRequestStatusLabel, getStatusBadgeClass } from "@/lib/training-request-config";

// Helper function to format dates as "d M Y" (e.g., "20 Nov 2025")
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

// Helper function to calculate days between two dates
function calculateDaysCount(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return 0;
  
  const now = new Date();
  const diffTime = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

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
  rejectedDate?: Date | null;
};

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
  trainingBatch: {
    id: string;
    batchFinishDate: Date | null;
  } | null;
};

interface ProjectSubmissionClientProps {
  pendingTrainingRequests: TrainingRequestWithRelations[];
  resubmitVPAs: VPAWithRelations[];
  competencies: Competency[];
  vpaStatusLabels: string[];
  trainingRequestStatusLabels: string[];
}

export function ProjectSubmissionClient({
  pendingTrainingRequests: initialPendingRequests,
  resubmitVPAs: initialResubmitVPAs,
  competencies,
  vpaStatusLabels,
  trainingRequestStatusLabels,
}: ProjectSubmissionClientProps) {
  const [activeTab, setActiveTab] = useState<"pending" | "resubmit">("pending");
  const [filterCompetency, setFilterCompetency] = useState<string>("");
  const [filterLevel, setFilterLevel] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  // Reset status filter when switching tabs if current value is invalid for new tab
  const handleTabChange = (tab: "pending" | "resubmit") => {
    setActiveTab(tab);
    if (tab === "resubmit" && filterStatus !== "" && filterStatus !== "2" && filterStatus !== "3") {
      setFilterStatus("");
    }
  };

  // Get unique levels from all items
  const allLevels = useMemo(() => {
    const levels = new Set<string>();
    initialPendingRequests.forEach((tr) => {
      if (tr.competencyLevel?.name) {
        levels.add(tr.competencyLevel.name);
      }
    });
    initialResubmitVPAs.forEach((vpa) => {
      if (vpa.competencyLevel?.name) {
        levels.add(vpa.competencyLevel.name);
      }
    });
    return Array.from(levels).sort();
  }, [initialPendingRequests, initialResubmitVPAs]);

  // Filter pending Training Requests
  const filteredPendingRequests = useMemo(() => {
    return initialPendingRequests.filter((tr) => {
      if (filterCompetency && tr.competencyLevel.competency.id !== filterCompetency) {
        return false;
      }
      if (filterLevel && tr.competencyLevel.name !== filterLevel) {
        return false;
      }
      if (filterStatus && tr.status.toString() !== filterStatus) {
        return false;
      }
      return true;
    });
  }, [initialPendingRequests, filterCompetency, filterLevel, filterStatus]);

  // Filter resubmit VPAs
  const filteredResubmitVPAs = useMemo(() => {
    return initialResubmitVPAs.filter((vpa) => {
      if (filterCompetency && vpa.competencyLevel.competency.id !== filterCompetency) {
        return false;
      }
      if (filterLevel && vpa.competencyLevel.name !== filterLevel) {
        return false;
      }
      if (filterStatus && vpa.status.toString() !== filterStatus) {
        return false;
      }
      return true;
    });
  }, [initialResubmitVPAs, filterCompetency, filterLevel, filterStatus]);

  const resetFilters = () => {
    setFilterCompetency("");
    setFilterLevel("");
    setFilterStatus("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Project Submission</h1>
        <p className="text-sm text-slate-400">
          View all pending and resubmit projects across competencies with training status and completion details.
        </p>
      </div>

      {/* Filter Forms */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Filters</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 items-end">
            {/* Competency Filter */}
            <div className="space-y-2">
              <label htmlFor="filter-competency" className="block text-sm font-medium text-slate-300">
                Competency
              </label>
              <Select
                id="filter-competency"
                value={filterCompetency}
                onChange={(e) => setFilterCompetency(e.target.value)}
                className="w-full"
              >
                <option value="">All Competencies</option>
                {competencies.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Level Filter */}
            <div className="space-y-2">
              <label htmlFor="filter-level" className="block text-sm font-medium text-slate-300">
                Level
              </label>
              <Select
                id="filter-level"
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="w-full"
              >
                <option value="">All Levels</option>
                {allLevels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </Select>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <label htmlFor="filter-status" className="block text-sm font-medium text-slate-300">
                Status
              </label>
              <Select
                id="filter-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full"
              >
                <option value="">All Statuses</option>
                {activeTab === "pending" ? (
                  trainingRequestStatusLabels.map((label, index) => (
                    <option key={`${label}-${index}`} value={index.toString()}>
                      {label}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="2">{vpaStatusLabels[2] || "Rejected"}</option>
                    <option value="3">{vpaStatusLabels[3] || "Resubmit for Re-validation"}</option>
                  </>
                )}
              </Select>
            </div>

            {/* Filter Actions */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-md border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 whitespace-nowrap"
              >
                Reset
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs and Tables Container */}
      <Card className="overflow-hidden p-0">
        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-slate-800/80 bg-slate-950/50 px-6 pt-4">
          <button
            type="button"
            onClick={() => handleTabChange("pending")}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 ${
              activeTab === "pending"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Pending Project ({filteredPendingRequests.length})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("resubmit")}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 ${
              activeTab === "resubmit"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Resubmit Project ({filteredResubmitVPAs.length})
          </button>
        </div>

        {/* Tables Content */}
        <div className="p-6">
          {/* Pending Project Tab Content */}
          {activeTab === "pending" && (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full min-w-[1000px] border-collapse text-sm">
                <thead className="bg-slate-950/70 text-slate-300">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium whitespace-nowrap">Competency</th>
                    <th className="px-3 py-3 text-left font-medium whitespace-nowrap">Level</th>
                    <th className="px-3 py-3 text-left font-medium whitespace-nowrap">Learner</th>
                    <th className="px-3 py-3 text-left font-medium whitespace-nowrap">Training Status</th>
                    <th className="px-3 py-3 text-left font-medium whitespace-nowrap">Finished Date</th>
                    <th className="px-3 py-3 text-left font-medium whitespace-nowrap">Days Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredPendingRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                        No pending projects found
                      </td>
                    </tr>
                  ) : (
                    filteredPendingRequests.map((tr) => {
                      // Use batch_finish_date if available, otherwise fall back to updatedAt, responseDate, or requestedDate
                      const finishedDate = tr.trainingBatch?.batchFinishDate ?? tr.updatedAt ?? tr.responseDate ?? tr.requestedDate;
                      const daysCount = calculateDaysCount(finishedDate);
                      const levelBadgeClass = getCompetencyLevelBadgeClass(tr.competencyLevel.name);
                      const statusBadgeClass = getStatusBadgeClass(tr.status);

                      return (
                        <tr key={tr.id} className="hover:bg-slate-900/60">
                          <td className="px-3 py-3 text-slate-100 whitespace-nowrap">
                            {tr.competencyLevel.competency.name}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-block rounded-md px-2 py-0.5 text-sm font-semibold whitespace-nowrap ${levelBadgeClass}`}>
                              {tr.competencyLevel.name}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-100 whitespace-nowrap">
                            {tr.learner.name}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-block rounded-md px-2 py-0.5 text-sm font-semibold whitespace-nowrap ${statusBadgeClass}`}>
                              {getTrainingRequestStatusLabel(tr.status, trainingRequestStatusLabels)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-300 whitespace-nowrap">
                            {formatDate(finishedDate)}
                          </td>
                          <td className="px-3 py-3 text-slate-400 whitespace-nowrap">
                            {daysCount}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Resubmit Project Tab Content */}
          {activeTab === "resubmit" && (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full min-w-[1000px] border-collapse text-sm">
                <thead className="bg-slate-950/70 text-slate-300">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium whitespace-nowrap">Competency</th>
                    <th className="px-3 py-3 text-left font-medium whitespace-nowrap">Level</th>
                    <th className="px-3 py-3 text-left font-medium whitespace-nowrap">Learner</th>
                    <th className="px-3 py-3 text-left font-medium whitespace-nowrap">Status</th>
                    <th className="px-3 py-3 text-left font-medium whitespace-nowrap">Rejected Date</th>
                    <th className="px-3 py-3 text-left font-medium whitespace-nowrap">Days Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredResubmitVPAs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                        No resubmit projects found
                      </td>
                    </tr>
                  ) : (
                    filteredResubmitVPAs.map((vpa) => {
                      // Use rejectedDate from log if available, otherwise fall back to responseDate
                      const rejectedDate = vpa.rejectedDate ?? vpa.responseDate;
                      const daysCount = calculateDaysCount(rejectedDate);
                      const levelBadgeClass = getCompetencyLevelBadgeClass(vpa.competencyLevel.name);
                      const statusBadgeClass = getVPAStatusBadgeClass(vpa.status);

                      return (
                        <tr key={vpa.id} className="hover:bg-slate-900/60">
                          <td className="px-3 py-3 text-slate-100 whitespace-nowrap">
                            {vpa.competencyLevel.competency.name}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-block rounded-md px-2 py-0.5 text-sm font-semibold whitespace-nowrap ${levelBadgeClass}`}>
                              {vpa.competencyLevel.name}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-100 whitespace-nowrap">
                            {vpa.learner.name}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-block rounded-md px-2 py-0.5 text-sm font-semibold whitespace-nowrap ${statusBadgeClass}`}>
                              {getVPAStatusLabel(vpa.status, vpaStatusLabels)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-300 whitespace-nowrap">
                            {formatDate(rejectedDate)}
                          </td>
                          <td className="px-3 py-3 text-slate-400 whitespace-nowrap">
                            {daysCount}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

