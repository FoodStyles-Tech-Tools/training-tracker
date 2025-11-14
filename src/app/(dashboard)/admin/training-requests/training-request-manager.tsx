"use client";

import { useState, useMemo, useTransition, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { Pagination } from "@/components/admin/pagination";
import type { TrainingRequest, Competency } from "@/db/schema";
import { getTrainingRequestStatusLabel, getStatusBadgeClass } from "@/lib/training-request-config";
import { updateTrainingRequestAction, getTrainingRequestById } from "./actions";
import { TrainingRequestModal } from "./training-request-modal";

// Helper function to format dates as "d M Y" (e.g., "20 Nov 2025")
// This matches Flatpickr's "d M Y" format exactly
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

const customFilterLabels = {
  dueIn24h: "Due in 24h",
  dueIn3d: "Due in 3 days",
  overdue: "Overdue",
  blocked: "Blocked",
  followUp: "Follow Up",
} as const;

interface TrainingRequestManagerProps {
  trainingRequests: TrainingRequestWithRelations[];
  competencies: Competency[];
  users: Array<{
    id: string;
    name: string;
    role: string | null;
    competencyIds: string[];
  }>;
  statusLabels: string[];
  canEdit: boolean;
}

export function TrainingRequestManager({
  trainingRequests: initialTrainingRequests,
  competencies,
  users,
  statusLabels,
  canEdit,
}: TrainingRequestManagerProps) {
  const [trainingRequests, setTrainingRequests] = useState<TrainingRequestWithRelations[]>(initialTrainingRequests);
  const [selectedRequest, setSelectedRequest] = useState<TrainingRequestWithRelations | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  
  // Update local state when prop changes (e.g., from external refresh)
  useEffect(() => {
    setTrainingRequests(initialTrainingRequests);
  }, [initialTrainingRequests]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Search/filter state
  const [filters, setFilters] = useState({
    name: "",
    competency: "",
    level: "",
    status: "",
    trainer: "",
    batch: "",
    customFilter: "" as "" | "dueIn24h" | "dueIn3d" | "overdue" | "blocked" | "followUp",
  });
  const activeCustomFilterLabel = filters.customFilter
    ? customFilterLabels[filters.customFilter]
    : null;

  // Helper function to get response due date
  const getResponseDueDate = useCallback((tr: TrainingRequestWithRelations): Date | null => {
    if (tr.responseDue) {
      return tr.responseDue instanceof Date ? tr.responseDue : new Date(tr.responseDue);
    }
    if (tr.requestedDate) {
      const requestedDate = tr.requestedDate instanceof Date 
        ? tr.requestedDate 
        : new Date(tr.requestedDate);
      const responseDueDate = new Date(requestedDate);
      responseDueDate.setDate(responseDueDate.getDate() + 1);
      return responseDueDate;
    }
    return null;
  }, []);

  // Calculate filter counts
  // Exclude requests that have a response date (already responded)
  const filterCounts = useMemo(() => {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    let dueIn24h = 0;
    let dueIn3d = 0;
    let overdue = 0;
    let blocked = 0;
    let followUp = 0;

    trainingRequests.forEach((tr) => {
      // Count follow up: definiteAnswer is false and followUpDate is empty (count all, regardless of responseDate)
      if (tr.definiteAnswer === false && !tr.followUpDate) {
        followUp++;
      }
      
      // Skip if already responded (has responseDate)
      if (tr.responseDate) {
        // Still count blocked requests even if responded
        if (tr.isBlocked) {
          blocked++;
        }
        return;
      }

      const responseDue = getResponseDueDate(tr);
      if (responseDue) {
        if (responseDue <= in24h && responseDue > now) {
          dueIn24h++;
        }
        if (responseDue <= in3d && responseDue > now) {
          dueIn3d++;
        }
        if (responseDue < now) {
          overdue++;
        }
      }
      if (tr.isBlocked) {
        blocked++;
      }
    });

    return { dueIn24h, dueIn3d, overdue, blocked, followUp };
  }, [trainingRequests, getResponseDueDate]);

  // Filtered and sorted training requests
  const filteredRequests = useMemo(() => {
    const filtered = trainingRequests.filter((tr) => {
      if (filters.name && !tr.learner.name.toLowerCase().includes(filters.name.toLowerCase())) {
        return false;
      }
      if (filters.competency && tr.competencyLevel.competency.id !== filters.competency) {
        return false;
      }
      if (filters.level && tr.competencyLevel.name.toLowerCase() !== filters.level.toLowerCase()) {
        return false;
      }
      if (filters.status && tr.status.toString() !== filters.status) {
        return false;
      }

      // Custom filters
      // Exclude requests that have a response date (already responded)
      if (filters.customFilter) {
        // Blocked filter still counts blocked requests even if responded
        if (filters.customFilter === "blocked") {
          if (!tr.isBlocked) return false;
        } else if (filters.customFilter === "followUp") {
          // Follow up: definiteAnswer is false and followUpDate is empty
          if (tr.definiteAnswer !== false || tr.followUpDate) return false;
        } else {
          // For due/overdue filters, skip if already responded
          if (tr.responseDate) return false;
          
          const responseDue = getResponseDueDate(tr);
          const now = new Date();
          
          if (filters.customFilter === "dueIn24h") {
            if (!responseDue) return false;
            const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            if (responseDue > in24h || responseDue <= now) return false;
          } else if (filters.customFilter === "dueIn3d") {
            if (!responseDue) return false;
            const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
            if (responseDue > in3d || responseDue <= now) return false;
          } else if (filters.customFilter === "overdue") {
            if (!responseDue) return false;
            if (responseDue >= now) return false;
          }
        }
      }

      return true;
    });

    // Sort by column if specified, otherwise use default sort (response due date)
    return filtered.sort((a, b) => {
      // If sort column is specified, use it
      if (sortColumn) {
        let aValue: any;
        let bValue: any;

        switch (sortColumn) {
          case "trId":
            aValue = a.trId;
            bValue = b.trId;
            break;
          case "requestedDate":
            aValue = a.requestedDate instanceof Date ? a.requestedDate : new Date(a.requestedDate);
            bValue = b.requestedDate instanceof Date ? b.requestedDate : new Date(b.requestedDate);
            break;
          case "name":
            aValue = a.learner.name.toLowerCase();
            bValue = b.learner.name.toLowerCase();
            break;
          case "competency":
            aValue = a.competencyLevel.competency.name.toLowerCase();
            bValue = b.competencyLevel.competency.name.toLowerCase();
            break;
          case "level":
            aValue = a.competencyLevel.name.toLowerCase();
            bValue = b.competencyLevel.name.toLowerCase();
            break;
          case "status":
            aValue = a.status;
            bValue = b.status;
            break;
          case "responseDue":
            aValue = getResponseDueDate(a);
            bValue = getResponseDueDate(b);
            break;
          case "updatedAt":
            aValue = a.updatedAt instanceof Date ? a.updatedAt : new Date(a.updatedAt);
            bValue = b.updatedAt instanceof Date ? b.updatedAt : new Date(b.updatedAt);
            break;
          default:
            aValue = null;
            bValue = null;
        }

        // Handle null/undefined values
        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return 1;
        if (bValue == null) return -1;

        // Compare values
        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
        return 0;
      }

      // Default sort: by response due date
      // Items without response date (pending) come first, sorted by response due date
      // Items with response date (responded) come after, sorted by response due date
      const aHasResponse = !!a.responseDate;
      const bHasResponse = !!b.responseDate;

      // If one has response date and the other doesn't, pending (no response) comes first
      if (aHasResponse !== bHasResponse) {
        return aHasResponse ? 1 : -1;
      }

      // Both have same response status, sort by response due date
      const aResponseDue = getResponseDueDate(a);
      const bResponseDue = getResponseDueDate(b);

      if (!aResponseDue && !bResponseDue) return 0;
      if (!aResponseDue) return 1;
      if (!bResponseDue) return -1;

      // Sort by response due date (ascending - earliest due first)
      return aResponseDue.getTime() - bResponseDue.getTime();
    });
  }, [trainingRequests, filters, getResponseDueDate, sortColumn, sortDirection]);

  // Paginated training requests
  const paginatedRequests = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredRequests.slice(startIndex, endIndex);
  }, [filteredRequests, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Handle header click for sorting
  const handleHeaderClick = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new column and default to ascending
      setSortColumn(column);
      setSortDirection("asc");
    }
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  // Get sort indicator for a column
  const getSortIndicator = (column: string) => {
    if (sortColumn !== column) {
      return <span className="ml-2 text-slate-500 inline-block">↕</span>;
    }
    return (
      <span className="ml-2 text-blue-400 inline-block">
        {sortDirection === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  const handleOpenModal = (request: TrainingRequestWithRelations) => {
    setSelectedRequest(request);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRequest(null);
  };

  const handleSave = async (data: Partial<TrainingRequest>) => {
    if (!selectedRequest) return;

    setMessage(null);
    startTransition(async () => {
      const result = await updateTrainingRequestAction({
        id: selectedRequest.id,
        ...data,
      });

      if (result.success) {
        // Update the local state with the new data
        // Preserve all date fields if not explicitly changed
        const updatedRequest = {
          ...selectedRequest,
          ...data,
          // Preserve dates if not explicitly changed
          responseDate: data.responseDate !== undefined ? data.responseDate : selectedRequest.responseDate,
          responseDue: data.responseDue !== undefined ? data.responseDue : selectedRequest.responseDue,
          expectedUnblockedDate: data.expectedUnblockedDate !== undefined ? data.expectedUnblockedDate : selectedRequest.expectedUnblockedDate,
          noFollowUpDate: data.noFollowUpDate !== undefined ? data.noFollowUpDate : selectedRequest.noFollowUpDate,
          followUpDate: data.followUpDate !== undefined ? data.followUpDate : selectedRequest.followUpDate,
          updatedAt: new Date(),
        };
        
        setTrainingRequests((prev) =>
          prev.map((tr) =>
            tr.id === selectedRequest.id ? updatedRequest : tr
          )
        );
        
        // Update selectedRequest so modal shows updated data if still open
        setSelectedRequest(updatedRequest);
        
        // Show success message
        setMessage({ text: `${selectedRequest.trId} Successfully updated`, tone: "success" });
        
        // Close modal after a short delay to show the success message
        setTimeout(() => {
          setIsModalOpen(false);
          setSelectedRequest(null);
        }, 500);
      } else {
        setMessage({ text: result.error || "Failed to update training request", tone: "error" });
      }
    });
  };

  const handleClearFilters = () => {
    setFilters({
      name: "",
      competency: "",
      level: "",
      status: "",
      trainer: "",
      batch: "",
      customFilter: "",
    });
  };

  // Helper function to get row background color class
  // Color rows purely based on response due date
  // Only if it has response due date AND empty response date
  const getRowColorClass = (tr: TrainingRequestWithRelations): string => {
    const responseDue = getResponseDueDate(tr);
    const now = new Date();
    
    // Only color if response due exists and response date is empty
    if (!responseDue || tr.responseDate) {
      return "";
    }
    
    // Check if overdue
    if (responseDue < now) {
      return "bg-red-500/30"; // Red for overdue
    }
    
    // Check if near due (within 3 days)
    const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    if (responseDue <= in3d) {
      return "bg-yellow-500/30"; // Yellow for near due
    }
    
    // Default - no special color
    return "";
  };

  // Get unique levels from competencies
  const levels = useMemo(() => {
    const levelSet = new Set<string>();
    trainingRequests.forEach((tr) => {
      levelSet.add(tr.competencyLevel.name);
    });
    return Array.from(levelSet).sort();
  }, [trainingRequests]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Training Requests</h1>
          <p className="text-sm text-slate-400">
            Manage training requests, track status, and assign to batches.
          </p>
        </div>
      </div>

      {message && (
        <Alert variant={message.tone === "success" ? "success" : "error"}>
          {message.text}
        </Alert>
      )}

      {/* Search Form */}
      <Card className="p-4">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-nowrap sm:gap-3">
            <div className="flex-1 min-w-0 sm:min-w-[140px]">
              <label htmlFor="search-name" className="mb-1.5 block text-xs font-medium text-slate-300">
                Name
              </label>
              <Input
                id="search-name"
                type="text"
                placeholder="Search by name..."
                value={filters.name}
                onChange={(e) => setFilters({ ...filters, name: e.target.value })}
              />
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[140px]">
              <label htmlFor="search-competency" className="mb-1.5 block text-xs font-medium text-slate-300">
                Competency
              </label>
              <Select
                id="search-competency"
                value={filters.competency}
                onChange={(e) => setFilters({ ...filters, competency: e.target.value })}
              >
                <option value="">All Competencies</option>
                {competencies.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[120px]">
              <label htmlFor="search-level" className="mb-1.5 block text-xs font-medium text-slate-300">
                Level
              </label>
              <Select
                id="search-level"
                value={filters.level}
                onChange={(e) => setFilters({ ...filters, level: e.target.value })}
              >
                <option value="">All Levels</option>
                {levels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[140px]">
              <label htmlFor="search-status" className="mb-1.5 block text-xs font-medium text-slate-300">
                Status
              </label>
              <Select
                id="search-status"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">All Status</option>
                {statusLabels.map((status, index) => (
                  <option key={index} value={index.toString()}>
                    {status}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFilters({ ...filters, customFilter: filters.customFilter === "dueIn24h" ? "" : "dueIn24h" })}
              className={`tr-filter-btn tr-filter-btn--due-24h ${filters.customFilter === "dueIn24h" ? "active" : ""}`}
            >
              Due in 24h ({filterCounts.dueIn24h})
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFilters({ ...filters, customFilter: filters.customFilter === "dueIn3d" ? "" : "dueIn3d" })}
              className={`tr-filter-btn tr-filter-btn--due-3d ${filters.customFilter === "dueIn3d" ? "active" : ""}`}
            >
              Due in 3d ({filterCounts.dueIn3d})
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFilters({ ...filters, customFilter: filters.customFilter === "overdue" ? "" : "overdue" })}
              className={`tr-filter-btn tr-filter-btn--overdue ${filters.customFilter === "overdue" ? "active" : ""}`}
            >
              Overdue ({filterCounts.overdue})
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFilters({ ...filters, customFilter: filters.customFilter === "blocked" ? "" : "blocked" })}
              className={`tr-filter-btn tr-filter-btn--blocked ${filters.customFilter === "blocked" ? "active" : ""}`}
            >
              Blocked ({filterCounts.blocked})
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFilters({ ...filters, customFilter: filters.customFilter === "followUp" ? "" : "followUp" })}
              className={`tr-filter-btn tr-filter-btn--follow-up ${filters.customFilter === "followUp" ? "active" : ""}`}
            >
              Follow Up ({filterCounts.followUp})
            </Button>
            <div className="flex-1"></div>
            <Button
              type="button"
              onClick={handleClearFilters}
              variant="outline"
              className="rounded-md border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-700/50"
            >
              Clear
            </Button>
          </div>
          {activeCustomFilterLabel && (
            <div className="pt-2">
              <span className="inline-flex items-center gap-2 rounded-full border-2 border-amber-500 bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-md">
                Custom filter active: {activeCustomFilterLabel}
              </span>
            </div>
          )}
        </form>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-950/70 text-slate-300">
              <tr>
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                  onClick={() => handleHeaderClick("trId")}
                >
                  <span className="flex items-center">
                    TR ID
                    {getSortIndicator("trId")}
                  </span>
                </th>
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                  onClick={() => handleHeaderClick("requestedDate")}
                >
                  <span className="flex items-center">
                    Requested date
                    {getSortIndicator("requestedDate")}
                  </span>
                </th>
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                  onClick={() => handleHeaderClick("name")}
                >
                  <span className="flex items-center">
                    Name
                    {getSortIndicator("name")}
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
                  onClick={() => handleHeaderClick("status")}
                >
                  <span className="flex items-center">
                    Status
                    {getSortIndicator("status")}
                  </span>
                </th>
                <th className="px-4 py-3 text-left font-medium">Batch</th>
                <th className="px-4 py-3 text-left font-medium">Trainer</th>
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                  onClick={() => handleHeaderClick("responseDue")}
                >
                  <span className="flex items-center">
                    Response Due Date
                    {getSortIndicator("responseDue")}
                  </span>
                </th>
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                  onClick={() => handleHeaderClick("updatedAt")}
                >
                  <span className="flex items-center">
                    Last Update
                    {getSortIndicator("updatedAt")}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    No training requests found
                  </td>
                </tr>
              ) : (
                paginatedRequests.map((tr) => {
                  const rowColorClass = getRowColorClass(tr);
                  return (
                  <tr key={tr.id} className={`hover:bg-slate-900/60 ${rowColorClass}`}>
                    <td className="px-4 py-3 text-slate-400">{tr.trId}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatDate(tr.requestedDate)}
                    </td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => handleOpenModal(tr)}
                          className="bg-transparent border-0 p-0 text-left text-slate-100 hover:text-blue-400 transition cursor-pointer"
                        >
                          {tr.learner.name}
                        </button>
                      ) : (
                        <span className="text-slate-100">{tr.learner.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{tr.competencyLevel.competency.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block max-w-[140px] rounded-md bg-blue-500/20 px-2 py-0.5 text-sm font-semibold text-blue-200">
                        {tr.competencyLevel.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block max-w-[140px] rounded-md px-2 py-0.5 text-sm font-semibold ${getStatusBadgeClass(tr.status)}`}
                      >
                        {getTrainingRequestStatusLabel(tr.status, statusLabels)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {tr.trainingBatch?.batchName || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {tr.trainingBatch?.trainer.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatDate(
                        tr.responseDue || (tr.requestedDate
                          ? (() => {
                              const requestedDate = tr.requestedDate instanceof Date 
                                ? tr.requestedDate 
                                : new Date(tr.requestedDate);
                              const responseDueDate = new Date(requestedDate);
                              responseDueDate.setDate(responseDueDate.getDate() + 1);
                              return responseDueDate;
                            })()
                          : null)
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatDate(tr.updatedAt)}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination */}
      {filteredRequests.length > 0 && (
        <Pagination
          totalItems={filteredRequests.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[25, 50, 100]}
        />
      )}

      {/* Modal */}
      {selectedRequest && (
        <TrainingRequestModal
          open={isModalOpen}
          onClose={handleCloseModal}
          trainingRequest={selectedRequest}
          users={users}
          statusLabels={statusLabels}
          onSave={handleSave}
          isPending={isPending}
          onFetch={async () => {
            const result = await getTrainingRequestById(selectedRequest.id);
            if (result.success && result.data) {
              return result.data as TrainingRequestWithRelations;
            }
            return null;
          }}
        />
      )}
    </div>
  );
}

