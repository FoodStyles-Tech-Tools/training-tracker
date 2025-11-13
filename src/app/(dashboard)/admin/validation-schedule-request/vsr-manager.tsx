"use client";

import { useState, useMemo, useTransition, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Pagination } from "@/components/admin/pagination";
import type { ValidationScheduleRequest, Competency, User } from "@/db/schema";
import type { rolesList } from "@/db/schema";
import { getVSRStatusLabel, getVSRStatusBadgeClass, getVSRLevelBadgeClass } from "@/lib/vsr-config";
import { updateVSRAction, getVSRById } from "./actions";
import { VSRModal } from "./vsr-modal";

type UserWithRole = User & {
  role: typeof rolesList.$inferSelect | null;
};

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

// Helper function to format dates with time as "d M Y HH:mm" (e.g., "20 Nov 2025 10:00")
function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  
  const day = d.getDate().toString().padStart(2, "0");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `${day} ${month} ${year} ${hours}:${minutes}`;
}

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

const customFilterLabels = {
  dueIn24h: "Due in 24h",
  dueIn3d: "Due in 3 days",
  overdue: "Overdue",
  followUp: "Follow Up",
} as const;

interface VSRManagerProps {
  vsrs: VSRWithRelations[];
  competencies: Competency[];
  users: UserWithRole[];
  statusLabels: string[];
  currentUserId: string;
  canEdit: boolean;
}

export function VSRManager({
  vsrs: initialVSRs,
  competencies,
  users,
  statusLabels,
  currentUserId,
  canEdit,
}: VSRManagerProps) {
  const [vsrs, setVSRs] = useState<VSRWithRelations[]>(initialVSRs);
  const [selectedVSR, setSelectedVSR] = useState<VSRWithRelations | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  
  // Update local state when prop changes
  useEffect(() => {
    setVSRs(initialVSRs);
  }, [initialVSRs]);
  
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
    customFilter: "" as "" | "dueIn24h" | "dueIn3d" | "overdue" | "followUp",
  });
  const activeCustomFilterLabel = filters.customFilter
    ? customFilterLabels[filters.customFilter]
    : null;

  // Helper function to get response due date
  const getResponseDueDate = useCallback((vsr: VSRWithRelations): Date | null => {
    if (vsr.responseDue) {
      return vsr.responseDue instanceof Date ? vsr.responseDue : new Date(vsr.responseDue);
    }
    if (vsr.requestedDate) {
      const requestedDate = vsr.requestedDate instanceof Date 
        ? vsr.requestedDate 
        : new Date(vsr.requestedDate);
      const responseDueDate = new Date(requestedDate);
      responseDueDate.setDate(responseDueDate.getDate() + 1);
      return responseDueDate;
    }
    return null;
  }, []);

  // Calculate filter counts
  // Only count VSRs with status 0 or 1 (Pending Validation or Pending Re-validation) and no response date
  const filterCounts = useMemo(() => {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    let dueIn24h = 0;
    let dueIn3d = 0;
    let overdue = 0;
    let followUp = 0;

    vsrs.forEach((vsr) => {
      // Count follow up: definiteAnswer is false and followUpDate is empty (count all, regardless of responseDate)
      if (vsr.definiteAnswer === false && !vsr.followUpDate) {
        followUp++;
      }

      // Only count if status is 0 or 1 (Pending Validation or Pending Re-validation) and no response date
      if ((vsr.status !== 0 && vsr.status !== 1) || vsr.responseDate) {
        return;
      }

      const responseDue = getResponseDueDate(vsr);
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
    });

    return { dueIn24h, dueIn3d, overdue, followUp };
  }, [vsrs, getResponseDueDate]);

  // Filtered and sorted VSRs
  const filteredVSRs = useMemo(() => {
    const filtered = vsrs.filter((vsr) => {
      if (filters.name && !vsr.learner.name.toLowerCase().includes(filters.name.toLowerCase())) {
        return false;
      }
      if (filters.competency && vsr.competencyLevel.competency.id !== filters.competency) {
        return false;
      }
      if (filters.level && vsr.competencyLevel.name.toLowerCase() !== filters.level.toLowerCase()) {
        return false;
      }
      if (filters.status && vsr.status.toString() !== filters.status) {
        return false;
      }

      // Custom filters
      if (filters.customFilter) {
        if (filters.customFilter === "followUp") {
          // Follow up: definiteAnswer is false and followUpDate is empty
          if (vsr.definiteAnswer !== false || vsr.followUpDate) return false;
        } else {
          // For due/overdue filters, only for status 0 or 1 (Pending Validation or Pending Re-validation)
          if ((vsr.status !== 0 && vsr.status !== 1) || vsr.responseDate) return false;
          
          const responseDue = getResponseDueDate(vsr);
          const now = new Date();
          
          if (filters.customFilter === "dueIn24h") {
            // Only show VSRs with status 0 or 1, no response date, and due within 24h
            if (!responseDue) return false;
            const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            if (responseDue > in24h || responseDue <= now) return false;
          } else if (filters.customFilter === "dueIn3d") {
            // Only show VSRs with status 0 or 1, no response date, and due within 3 days
            if (!responseDue) return false;
            const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
            if (responseDue > in3d || responseDue <= now) return false;
          } else if (filters.customFilter === "overdue") {
            // Only show VSRs with status 0 or 1, no response date, and overdue
            if (!responseDue) return false;
            if (responseDue >= now) return false;
          }
        }
      }

      return true;
    });

    // Sort by column if specified
    return filtered.sort((a, b) => {
      if (sortColumn) {
        let aValue: any;
        let bValue: any;

        switch (sortColumn) {
          case "vsrId":
            aValue = a.vsrId;
            bValue = b.vsrId;
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

        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return 1;
        if (bValue == null) return -1;

        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
        return 0;
      }

      // Default sort: by response due date for pending items
      const aHasResponse = !!a.responseDate;
      const bHasResponse = !!b.responseDate;

      if (aHasResponse !== bHasResponse) {
        return aHasResponse ? 1 : -1;
      }

      const aResponseDue = getResponseDueDate(a);
      const bResponseDue = getResponseDueDate(b);

      if (!aResponseDue && !bResponseDue) return 0;
      if (!aResponseDue) return 1;
      if (!bResponseDue) return -1;

      return aResponseDue.getTime() - bResponseDue.getTime();
    });
  }, [vsrs, filters, getResponseDueDate, sortColumn, sortDirection]);

  // Paginated VSRs
  const paginatedVSRs = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredVSRs.slice(startIndex, endIndex);
  }, [filteredVSRs, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Handle header click for sorting
  const handleHeaderClick = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
    setCurrentPage(1);
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

  const handleOpenModal = (vsr: VSRWithRelations) => {
    setSelectedVSR(vsr);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedVSR(null);
  };

  const handleSave = async (data: Partial<ValidationScheduleRequest>) => {
    if (!selectedVSR) return;

    setMessage(null);
    startTransition(async () => {
      const result = await updateVSRAction({
        id: selectedVSR.id,
        ...data,
      });

      if (result.success) {
        const updatedVSR = {
          ...selectedVSR,
          ...data,
          responseDate: data.responseDate !== undefined ? data.responseDate : selectedVSR.responseDate,
          responseDue: data.responseDue !== undefined ? data.responseDue : selectedVSR.responseDue,
          updatedAt: new Date(),
        };
        
        setVSRs((prev) =>
          prev.map((vsr) =>
            vsr.id === selectedVSR.id ? updatedVSR : vsr
          )
        );
        
        setSelectedVSR(updatedVSR);
        setMessage({ text: `${selectedVSR.vsrId} Successfully updated`, tone: "success" });
        
        setTimeout(() => {
          setIsModalOpen(false);
          setSelectedVSR(null);
        }, 500);
      } else {
        setMessage({ text: result.error || "Failed to update validation schedule request", tone: "error" });
      }
    });
  };

  const handleClearFilters = () => {
    setFilters({
      name: "",
      competency: "",
      level: "",
      status: "",
      customFilter: "",
    });
  };

  // Get unique levels from VSRs
  const levels = useMemo(() => {
    const levelSet = new Set<string>();
    vsrs.forEach((vsr) => {
      levelSet.add(vsr.competencyLevel.name);
    });
    return Array.from(levelSet).sort();
  }, [vsrs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Validation Schedule Request</h1>
          <p className="text-sm text-slate-400">
            Manage validation schedule requests under validation project approval.
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
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
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
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
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
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
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
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
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
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200">
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
                  onClick={() => handleHeaderClick("vsrId")}
                >
                  <span className="flex items-center">
                    ID
                    {getSortIndicator("vsrId")}
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
                  onClick={() => handleHeaderClick("requestedDate")}
                >
                  <span className="flex items-center">
                    Requested Date
                    {getSortIndicator("requestedDate")}
                  </span>
                </th>
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                  onClick={() => handleHeaderClick("competency")}
                >
                  <span className="flex items-center">
                    Competencies
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
              {filteredVSRs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No validation schedule requests found
                  </td>
                </tr>
              ) : (
                paginatedVSRs.map((vsr) => {
                  const responseDue = getResponseDueDate(vsr);
                  const now = new Date();
                  const isOverdue = responseDue && responseDue < now && (vsr.status === 0 || vsr.status === 1) && !vsr.responseDate;
                  const isDueIn24h = responseDue && responseDue <= new Date(now.getTime() + 24 * 60 * 60 * 1000) && responseDue > now && (vsr.status === 0 || vsr.status === 1) && !vsr.responseDate;
                  const isDueIn3d = responseDue && responseDue <= new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) && responseDue > now && (vsr.status === 0 || vsr.status === 1) && !vsr.responseDate;
                  
                  let rowColorClass = "";
                  if (isOverdue) {
                    rowColorClass = "bg-red-500/30";
                  } else if (isDueIn24h) {
                    rowColorClass = "bg-orange-500/30";
                  } else if (isDueIn3d || (vsr.status === 0 || vsr.status === 1)) {
                    rowColorClass = "bg-amber-500/30";
                  }
                  
                  return (
                    <tr key={vsr.id} className={`hover:bg-slate-900/60 ${rowColorClass}`}>
                      <td className="px-4 py-3 text-slate-400">{vsr.vsrId}</td>
                      <td className="px-4 py-3">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => handleOpenModal(vsr)}
                            className="bg-transparent border-0 p-0 text-left text-slate-100 hover:text-blue-400 transition cursor-pointer"
                          >
                            {vsr.learner.name}
                          </button>
                        ) : (
                          <span className="text-slate-100">{vsr.learner.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatDate(vsr.requestedDate)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{vsr.competencyLevel.competency.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block max-w-[140px] rounded-md px-2 py-0.5 text-sm font-semibold ${getVSRLevelBadgeClass(vsr.competencyLevel.name)}`}>
                          {vsr.competencyLevel.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block max-w-[140px] rounded-md px-2 py-0.5 text-sm font-semibold ${getVSRStatusBadgeClass(vsr.status)}`}
                        >
                          {getVSRStatusLabel(vsr.status, statusLabels)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {responseDue ? formatDate(responseDue) : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {formatDateTime(vsr.updatedAt)}
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
      {filteredVSRs.length > 0 && (
        <Pagination
          totalItems={filteredVSRs.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[25, 50, 100]}
        />
      )}

      {/* Modal */}
      {selectedVSR && (
        <VSRModal
          open={isModalOpen}
          onClose={handleCloseModal}
          vsr={selectedVSR}
          users={users}
          statusLabels={statusLabels}
          onSave={handleSave}
          isPending={isPending}
          currentUserId={currentUserId}
          onFetch={async () => {
            const result = await getVSRById(selectedVSR.id);
            if (result.success && result.data) {
              return result.data as VSRWithRelations;
            }
            return null;
          }}
        />
      )}
    </div>
  );
}

