"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { TrainingRequest, ValidationProjectApproval, ValidationScheduleRequest } from "@/db/schema";
import { getTrainingRequestStatusLabel, getStatusBadgeClass } from "@/lib/training-request-config";
import { getVPAStatusLabel, getVPAStatusBadgeClass } from "@/lib/vpa-config";
import { getVSRStatusLabel, getVSRStatusBadgeClass } from "@/lib/vsr-config";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
};

interface WaitlistClientProps {
  trainingRequests: TrainingRequestWithRelations[];
  vpas: VPAWithRelations[];
  vsrs: VSRWithRelations[];
  statusLabels: string[];
  vpaStatusLabels: string[];
  vsrStatusLabels: string[];
}

export function WaitlistClient({
  trainingRequests: initialTrainingRequests,
  vpas: initialVPAs,
  vsrs: initialVSRs,
  statusLabels,
  vpaStatusLabels,
  vsrStatusLabels,
}: WaitlistClientProps) {
  const [activeTab, setActiveTab] = useState<"training-request" | "validation-project" | "validation-schedule" | "project-assignment">("training-request");
  const [sortColumn, setSortColumn] = useState<string | null>("requestedDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [vpaSortColumn, setVpaSortColumn] = useState<string | null>("requestedDate");
  const [vpaSortDirection, setVpaSortDirection] = useState<"asc" | "desc">("asc");
  const [vsrSortColumn, setVsrSortColumn] = useState<string | null>("requestedDate");
  const [vsrSortDirection, setVsrSortDirection] = useState<"asc" | "desc">("asc");
  const [competencyDropdownOpen, setCompetencyDropdownOpen] = useState(false);
  const [selectedCompetencies, setSelectedCompetencies] = useState<string[]>([]);
  const competencyDropdownRef = useRef<HTMLDivElement>(null);

  const competencyOptions = useMemo(() => {
    const map = new Map<string, string>();
    initialTrainingRequests.forEach((tr) => {
      map.set(tr.competencyLevel.competency.id, tr.competencyLevel.competency.name);
    });
    initialVPAs.forEach((vpa) => {
      map.set(vpa.competencyLevel.competency.id, vpa.competencyLevel.competency.name);
    });
    initialVSRs.forEach((vsr) => {
      map.set(vsr.competencyLevel.competency.id, vsr.competencyLevel.competency.name);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [initialTrainingRequests, initialVPAs, initialVSRs]);

  useEffect(() => {
    setSelectedCompetencies((prev) => {
      if (prev.length === 0) return prev;
      const validIds = new Set(competencyOptions.map((option) => option.id));
      const filtered = prev.filter((id) => validIds.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [competencyOptions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (competencyDropdownRef.current && !competencyDropdownRef.current.contains(event.target as Node)) {
        setCompetencyDropdownOpen(false);
      }
    };

    if (competencyDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [competencyDropdownOpen]);

  const competencyNameMap = useMemo(() => {
    return new Map(competencyOptions.map((option) => [option.id, option.name]));
  }, [competencyOptions]);

  const toggleCompetencySelection = (id: string) => {
    setSelectedCompetencies((prev) =>
      prev.includes(id) ? prev.filter((competencyId) => competencyId !== id) : [...prev, id],
    );
  };

  const clearCompetencyFilters = () => {
    setSelectedCompetencies([]);
  };

  const isCompetencySelected = (id: string) => selectedCompetencies.includes(id);

  const competencyFilterLabel =
    selectedCompetencies.length === 0
      ? "All competencies"
      : selectedCompetencies.length === 1
        ? competencyNameMap.get(selectedCompetencies[0]) || "1 selected"
        : `${selectedCompetencies.length} selected`;

  // Handle header click for sorting
  const handleHeaderClick = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction if clicking the same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new column and default to ascending
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Handle VPA header click for sorting
  const handleVPAHeaderClick = (column: string) => {
    if (vpaSortColumn === column) {
      // Toggle direction if clicking the same column
      setVpaSortDirection(vpaSortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new column and default to ascending
      setVpaSortColumn(column);
      setVpaSortDirection("asc");
    }
  };

  // Get sort indicator for header
  const getSortIndicator = (column: string) => {
    if (sortColumn !== column) {
      return <span className="ml-2 text-slate-500">↕</span>;
    }
    return (
      <span className="ml-2 text-blue-400">
        {sortDirection === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  // Get VPA sort indicator for header
  const getVPASortIndicator = (column: string) => {
    if (vpaSortColumn !== column) {
      return <span className="ml-2 text-slate-500">↕</span>;
    }
    return (
      <span className="ml-2 text-blue-400">
        {vpaSortDirection === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  // Handle VSR header click for sorting
  const handleVSRHeaderClick = (column: string) => {
    if (vsrSortColumn === column) {
      // Toggle direction if clicking the same column
      setVsrSortDirection(vsrSortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new column and default to ascending
      setVsrSortColumn(column);
      setVsrSortDirection("asc");
    }
  };

  // Get VSR sort indicator for header
  const getVSRSortIndicator = (column: string) => {
    if (vsrSortColumn !== column) {
      return <span className="ml-2 text-slate-500">↕</span>;
    }
    return (
      <span className="ml-2 text-blue-400">
        {vsrSortDirection === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  // Filter and sort training requests
  const sortedTrainingRequests = useMemo(() => {
    const filtered =
      selectedCompetencies.length === 0
        ? initialTrainingRequests
        : initialTrainingRequests.filter((tr) =>
            selectedCompetencies.includes(tr.competencyLevel.competency.id),
          );

    const data = [...filtered];

    // Sort by column if specified
    return data.sort((a, b) => {
      if (!sortColumn) return 0;

      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case "requestedDate":
          aValue = a.requestedDate instanceof Date ? a.requestedDate : new Date(a.requestedDate);
          bValue = b.requestedDate instanceof Date ? b.requestedDate : new Date(b.requestedDate);
          break;
        case "competency":
          aValue = a.competencyLevel.competency.name.toLowerCase();
          bValue = b.competencyLevel.competency.name.toLowerCase();
          break;
        case "level":
          aValue = a.competencyLevel.name.toLowerCase();
          bValue = b.competencyLevel.name.toLowerCase();
          break;
        case "learner":
          aValue = a.learner.name.toLowerCase();
          bValue = b.learner.name.toLowerCase();
          break;
        case "status":
          aValue = a.status;
          bValue = b.status;
          break;
        default:
          return 0;
      }

      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // Compare values
      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [initialTrainingRequests, selectedCompetencies, sortColumn, sortDirection]);

  // Filter and sort VPAs
  const sortedVPAs = useMemo(() => {
    const filtered =
      selectedCompetencies.length === 0
        ? initialVPAs
        : initialVPAs.filter((vpa) => selectedCompetencies.includes(vpa.competencyLevel.competency.id));

    const data = [...filtered];

    // Sort by column if specified
    return data.sort((a, b) => {
      if (!vpaSortColumn) return 0;

      let aValue: any;
      let bValue: any;

      switch (vpaSortColumn) {
        case "requestedDate":
          aValue = a.requestedDate instanceof Date ? a.requestedDate : (a.requestedDate ? new Date(a.requestedDate) : null);
          bValue = b.requestedDate instanceof Date ? b.requestedDate : (b.requestedDate ? new Date(b.requestedDate) : null);
          break;
        case "competency":
          aValue = a.competencyLevel.competency.name.toLowerCase();
          bValue = b.competencyLevel.competency.name.toLowerCase();
          break;
        case "level":
          aValue = a.competencyLevel.name.toLowerCase();
          bValue = b.competencyLevel.name.toLowerCase();
          break;
        case "learner":
          aValue = a.learner.name.toLowerCase();
          bValue = b.learner.name.toLowerCase();
          break;
        case "status":
          aValue = a.status;
          bValue = b.status;
          break;
        default:
          return 0;
      }

      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // Compare values
      if (aValue < bValue) return vpaSortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return vpaSortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [initialVPAs, selectedCompetencies, vpaSortColumn, vpaSortDirection]);

  // Filter and sort VSRs
  const sortedVSRs = useMemo(() => {
    const filtered =
      selectedCompetencies.length === 0
        ? initialVSRs
        : initialVSRs.filter((vsr) => selectedCompetencies.includes(vsr.competencyLevel.competency.id));

    const data = [...filtered];

    // Sort by column if specified
    return data.sort((a, b) => {
      if (!vsrSortColumn) return 0;

      let aValue: any;
      let bValue: any;

      switch (vsrSortColumn) {
        case "requestedDate":
          aValue = a.requestedDate instanceof Date ? a.requestedDate : (a.requestedDate ? new Date(a.requestedDate) : null);
          bValue = b.requestedDate instanceof Date ? b.requestedDate : (b.requestedDate ? new Date(b.requestedDate) : null);
          break;
        case "competency":
          aValue = a.competencyLevel.competency.name.toLowerCase();
          bValue = b.competencyLevel.competency.name.toLowerCase();
          break;
        case "level":
          aValue = a.competencyLevel.name.toLowerCase();
          bValue = b.competencyLevel.name.toLowerCase();
          break;
        case "learner":
          aValue = a.learner.name.toLowerCase();
          bValue = b.learner.name.toLowerCase();
          break;
        case "status":
          aValue = a.status;
          bValue = b.status;
          break;
        default:
          return 0;
      }

      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // Compare values
      if (aValue < bValue) return vsrSortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return vsrSortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [initialVSRs, selectedCompetencies, vsrSortColumn, vsrSortDirection]);

  // Get level badge class
  const getLevelBadgeClass = (level: string): string => {
    const levelLower = level.toLowerCase();
    if (levelLower.includes("basic")) {
      return "bg-blue-500/20 text-blue-200";
    } else if (levelLower.includes("competent")) {
      return "bg-emerald-500/20 text-emerald-200";
    } else if (levelLower.includes("advanced")) {
      return "bg-purple-500/20 text-purple-200";
    }
    return "bg-slate-500/20 text-slate-200";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Waitlist</h1>
        <p className="text-sm text-slate-400">
          View all pending requests across competencies organized by request type.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Competencies</label>
            <div className="relative" ref={competencyDropdownRef}>
              <button
                type="button"
                onClick={() => setCompetencyDropdownOpen((open) => !open)}
                className={cn(
                  "flex h-10 w-full items-center justify-between rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900",
                  selectedCompetencies.length > 0 && "border-blue-500",
                )}
              >
                <span className="truncate">{competencyFilterLabel}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-slate-400 transition-transform",
                    competencyDropdownOpen && "rotate-180",
                  )}
                />
              </button>

              {selectedCompetencies.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedCompetencies.map((id) => {
                    const name = competencyNameMap.get(id);
                    if (!name) return null;
                    return (
                      <div
                        key={id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-blue-500 bg-blue-900/30 px-2 py-1 text-xs text-slate-100"
                      >
                        <span>{name}</span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleCompetencySelection(id);
                          }}
                          className="text-slate-400 transition hover:text-slate-100"
                          aria-label={`Remove ${name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {competencyDropdownOpen && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-700 bg-slate-900 shadow-lg">
                  {competencyOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-400">No competencies found</div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          clearCompetencyFilters();
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-sm text-blue-300 transition hover:bg-slate-800"
                      >
                        Clear filter
                        {selectedCompetencies.length > 0 && (
                          <span className="text-xs text-slate-400">
                            {selectedCompetencies.length} selected
                          </span>
                        )}
                      </button>
                      <div className="border-t border-slate-800/60" />
                      {competencyOptions.map((option) => (
                        <label
                          key={option.id}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
                        >
                          <input
                            type="checkbox"
                            checked={isCompetencySelected(option.id)}
                            onChange={() => toggleCompetencySelection(option.id)}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                          />
                          <span>{option.name}</span>
                        </label>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden p-0">
          {/* Tab Navigation */}
          <div className="flex gap-2 border-b border-slate-800/80 bg-slate-950/50 px-6 pt-4">
            <button
              type="button"
              onClick={() => setActiveTab("training-request")}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 ${
                activeTab === "training-request"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              Training Request ({sortedTrainingRequests.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("validation-project")}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 ${
                activeTab === "validation-project"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              Validation Project Approval ({sortedVPAs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("validation-schedule")}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 ${
                activeTab === "validation-schedule"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              Validation Schedule Request ({sortedVSRs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("project-assignment")}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 ${
                activeTab === "project-assignment"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              Project Assignment Request (0)
            </button>
          </div>

          {/* Tables Content */}
          <div className="p-6">
            {/* Training Request Tab Content */}
            {activeTab === "training-request" && (
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-950/70 text-slate-300">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">No</th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleHeaderClick("requestedDate")}
                      >
                        <span className="flex items-center">
                          Request Date
                          {getSortIndicator("requestedDate")}
                        </span>
                      </th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleHeaderClick("competency")}
                      >
                        <span className="flex items-center">
                          Competency
                          {getSortIndicator("competency")}
                        </span>
                      </th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleHeaderClick("level")}
                      >
                        <span className="flex items-center">
                          Level
                          {getSortIndicator("level")}
                        </span>
                      </th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleHeaderClick("learner")}
                      >
                        <span className="flex items-center">
                          Learner
                          {getSortIndicator("learner")}
                        </span>
                      </th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleHeaderClick("status")}
                      >
                        <span className="flex items-center">
                          Status
                          {getSortIndicator("status")}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {sortedTrainingRequests.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          No training requests found
                        </td>
                      </tr>
                    ) : (
                      sortedTrainingRequests.map((tr, index) => {
                        const statusLabel = getTrainingRequestStatusLabel(tr.status, statusLabels);
                        const statusBadgeClass = getStatusBadgeClass(tr.status);

                        return (
                          <tr key={tr.id} className="hover:bg-slate-900/60">
                            <td className="px-4 py-3 text-slate-400">{index + 1}</td>
                            <td className="px-4 py-3 text-slate-300">
                              {formatDate(tr.requestedDate)}
                            </td>
                            <td className="px-4 py-3 text-slate-100">
                              {tr.competencyLevel.competency.name}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block max-w-[140px] rounded-md px-2 py-0.5 text-sm font-semibold ${getLevelBadgeClass(tr.competencyLevel.name)}`}
                              >
                                {tr.competencyLevel.name}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-100">{tr.learner.name}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-semibold border ${statusBadgeClass}`}
                              >
                                {statusLabel}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Validation Project Approval Tab Content */}
            {activeTab === "validation-project" && (
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-950/70 text-slate-300">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">No</th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleVPAHeaderClick("requestedDate")}
                      >
                        <span className="flex items-center">
                          Request Date
                          {getVPASortIndicator("requestedDate")}
                        </span>
                      </th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleVPAHeaderClick("competency")}
                      >
                        <span className="flex items-center">
                          Competency
                          {getVPASortIndicator("competency")}
                        </span>
                      </th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleVPAHeaderClick("level")}
                      >
                        <span className="flex items-center">
                          Level
                          {getVPASortIndicator("level")}
                        </span>
                      </th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleVPAHeaderClick("learner")}
                      >
                        <span className="flex items-center">
                          Learner
                          {getVPASortIndicator("learner")}
                        </span>
                      </th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleVPAHeaderClick("status")}
                      >
                        <span className="flex items-center">
                          Status
                          {getVPASortIndicator("status")}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {sortedVPAs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          No validation project approvals found
                        </td>
                      </tr>
                    ) : (
                      sortedVPAs.map((vpa, index) => {
                        const statusLabel = getVPAStatusLabel(vpa.status, vpaStatusLabels);
                        const statusBadgeClass = getVPAStatusBadgeClass(vpa.status);

                        return (
                          <tr key={vpa.id} className="hover:bg-slate-900/60">
                            <td className="px-4 py-3 text-slate-400">{index + 1}</td>
                            <td className="px-4 py-3 text-slate-300">
                              {formatDate(vpa.requestedDate)}
                            </td>
                            <td className="px-4 py-3 text-slate-100">
                              {vpa.competencyLevel.competency.name}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block max-w-[140px] rounded-md px-2 py-0.5 text-sm font-semibold ${getLevelBadgeClass(vpa.competencyLevel.name)}`}
                              >
                                {vpa.competencyLevel.name}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-100">{vpa.learner.name}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-semibold border ${statusBadgeClass}`}
                              >
                                {statusLabel}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Validation Schedule Request Tab Content */}
            {activeTab === "validation-schedule" && (
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-950/70 text-slate-300">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">No</th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleVSRHeaderClick("requestedDate")}
                      >
                        <span className="flex items-center">
                          Request Date
                          {getVSRSortIndicator("requestedDate")}
                        </span>
                      </th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleVSRHeaderClick("competency")}
                      >
                        <span className="flex items-center">
                          Competency
                          {getVSRSortIndicator("competency")}
                        </span>
                      </th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleVSRHeaderClick("level")}
                      >
                        <span className="flex items-center">
                          Level
                          {getVSRSortIndicator("level")}
                        </span>
                      </th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleVSRHeaderClick("learner")}
                      >
                        <span className="flex items-center">
                          Learner
                          {getVSRSortIndicator("learner")}
                        </span>
                      </th>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                        onClick={() => handleVSRHeaderClick("status")}
                      >
                        <span className="flex items-center">
                          Status
                          {getVSRSortIndicator("status")}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {sortedVSRs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          No validation schedule requests found
                        </td>
                      </tr>
                    ) : (
                      sortedVSRs.map((vsr, index) => {
                        const statusLabel = getVSRStatusLabel(vsr.status, vsrStatusLabels);
                        const statusBadgeClass = getVSRStatusBadgeClass(vsr.status);

                        return (
                          <tr key={vsr.id} className="hover:bg-slate-900/60">
                            <td className="px-4 py-3 text-slate-400">{index + 1}</td>
                            <td className="px-4 py-3 text-slate-300">
                              {formatDate(vsr.requestedDate)}
                            </td>
                            <td className="px-4 py-3 text-slate-100">
                              {vsr.competencyLevel.competency.name}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block max-w-[140px] rounded-md px-2 py-0.5 text-sm font-semibold ${getLevelBadgeClass(vsr.competencyLevel.name)}`}
                              >
                                {vsr.competencyLevel.name}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-100">{vsr.learner.name}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-semibold border ${statusBadgeClass}`}
                              >
                                {statusLabel}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Project Assignment Request Tab Content */}
            {activeTab === "project-assignment" && (
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-950/70 text-slate-300">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">No</th>
                      <th className="px-4 py-3 text-left font-medium">Request Date</th>
                      <th className="px-4 py-3 text-left font-medium">Competency</th>
                      <th className="px-4 py-3 text-left font-medium">Level</th>
                      <th className="px-4 py-3 text-left font-medium">Learner</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        No data available
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
    </div>
  );
}

