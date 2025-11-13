"use client";

import { useState, useMemo, useTransition, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Pagination } from "@/components/admin/pagination";
import type { ValidationProjectApproval, Competency, User } from "@/db/schema";
import { getVPAStatusLabel, getVPAStatusBadgeClass, getVPALevelBadgeClass } from "@/lib/vpa-config";
import { updateVPAAction, getVPAById } from "./actions";
import { VPAModal } from "./vpa-modal";

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

const customFilterLabels = {
  dueIn24h: "Due in 24h",
  dueIn3d: "Due in 3 days",
  overdue: "Overdue",
} as const;

interface VPAManagerProps {
  vpas: VPAWithRelations[];
  competencies: Competency[];
  users: User[];
  statusLabels: string[];
  canEdit: boolean;
}

export function VPAManager({
  vpas: initialVPAs,
  competencies,
  users,
  statusLabels,
  canEdit,
}: VPAManagerProps) {
  const [vpas, setVPAs] = useState<VPAWithRelations[]>(initialVPAs);
  const [selectedVPA, setSelectedVPA] = useState<VPAWithRelations | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  
  // Update local state when prop changes
  useEffect(() => {
    setVPAs(initialVPAs);
  }, [initialVPAs]);
  
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
    customFilter: "" as "" | "dueIn24h" | "dueIn3d" | "overdue",
  });
  const activeCustomFilterLabel = filters.customFilter
    ? customFilterLabels[filters.customFilter]
    : null;

  // Helper function to get response due date
  const getResponseDueDate = useCallback((vpa: VPAWithRelations): Date | null => {
    if (vpa.responseDue) {
      return vpa.responseDue instanceof Date ? vpa.responseDue : new Date(vpa.responseDue);
    }
    if (vpa.requestedDate) {
      const requestedDate = vpa.requestedDate instanceof Date 
        ? vpa.requestedDate 
        : new Date(vpa.requestedDate);
      const responseDueDate = new Date(requestedDate);
      responseDueDate.setDate(responseDueDate.getDate() + 1);
      return responseDueDate;
    }
    return null;
  }, []);

  // Calculate filter counts
  // Only count VPAs with status 0 (Pending Validation Project Approval) and no response date
  const filterCounts = useMemo(() => {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    let dueIn24h = 0;
    let dueIn3d = 0;
    let overdue = 0;

    vpas.forEach((vpa) => {
      // Only count if status is 0 (Pending Validation Project Approval) and no response date
      if (vpa.status !== 0 || vpa.responseDate) {
        return;
      }

      const responseDue = getResponseDueDate(vpa);
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

    return { dueIn24h, dueIn3d, overdue };
  }, [vpas, getResponseDueDate]);

  // Filtered and sorted VPAs
  const filteredVPAs = useMemo(() => {
    const filtered = vpas.filter((vpa) => {
      if (filters.name && !vpa.learner.name.toLowerCase().includes(filters.name.toLowerCase())) {
        return false;
      }
      if (filters.competency && vpa.competencyLevel.competency.id !== filters.competency) {
        return false;
      }
      if (filters.level && vpa.competencyLevel.name.toLowerCase() !== filters.level.toLowerCase()) {
        return false;
      }
      if (filters.status && vpa.status.toString() !== filters.status) {
        return false;
      }

      // Custom filters - only for status 0 (Pending Validation Project Approval)
      if (filters.customFilter) {
        if (vpa.status !== 0 || vpa.responseDate) return false;
        
        const responseDue = getResponseDueDate(vpa);
        const now = new Date();
        
        if (filters.customFilter === "dueIn24h") {
          // Only show VPAs with status 0, no response date, and due within 24h
          if (!responseDue) return false;
          const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          if (responseDue > in24h || responseDue <= now) return false;
        } else if (filters.customFilter === "dueIn3d") {
          // Only show VPAs with status 0, no response date, and due within 3 days
          if (!responseDue) return false;
          const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
          if (responseDue > in3d || responseDue <= now) return false;
        } else if (filters.customFilter === "overdue") {
          // Only show VPAs with status 0, no response date, and overdue
          if (!responseDue) return false;
          if (responseDue >= now) return false;
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
          case "vpaId":
            aValue = a.vpaId;
            bValue = b.vpaId;
            break;
          case "submittedDate":
            aValue = a.requestedDate instanceof Date 
              ? a.requestedDate 
              : a.requestedDate 
                ? new Date(a.requestedDate) 
                : null;
            bValue = b.requestedDate instanceof Date 
              ? b.requestedDate 
              : b.requestedDate 
                ? new Date(b.requestedDate) 
                : null;
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
  }, [vpas, filters, getResponseDueDate, sortColumn, sortDirection]);

  // Paginated VPAs
  const paginatedVPAs = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredVPAs.slice(startIndex, endIndex);
  }, [filteredVPAs, currentPage, pageSize]);

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

  const handleOpenModal = (vpa: VPAWithRelations) => {
    setSelectedVPA(vpa);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedVPA(null);
  };

  const handleSave = async (data: Partial<ValidationProjectApproval>) => {
    if (!selectedVPA) return;

    setMessage(null);
    startTransition(async () => {
      const result = await updateVPAAction({
        id: selectedVPA.id,
        ...data,
      });

      if (result.success) {
        const updatedVPA = {
          ...selectedVPA,
          ...data,
          responseDate: data.responseDate !== undefined ? data.responseDate : selectedVPA.responseDate,
          responseDue: data.responseDue !== undefined ? data.responseDue : selectedVPA.responseDue,
          rejectionReason: data.rejectionReason !== undefined ? data.rejectionReason : selectedVPA.rejectionReason,
          updatedAt: new Date(),
        };
        
        setVPAs((prev) =>
          prev.map((vpa) =>
            vpa.id === selectedVPA.id ? updatedVPA : vpa
          )
        );
        
        setSelectedVPA(updatedVPA);
        setMessage({ text: `${selectedVPA.vpaId} Successfully updated`, tone: "success" });
        
        setTimeout(() => {
          setIsModalOpen(false);
          setSelectedVPA(null);
        }, 500);
      } else {
        setMessage({ text: result.error || "Failed to update validation project approval", tone: "error" });
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

  // Get unique levels from VPAs
  const levels = useMemo(() => {
    const levelSet = new Set<string>();
    vpas.forEach((vpa) => {
      levelSet.add(vpa.competencyLevel.name);
    });
    return Array.from(levelSet).sort();
  }, [vpas]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Validation Project Approval</h1>
          <p className="text-sm text-slate-400">
            Manage validation project approval requests under training requests.
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
                  onClick={() => handleHeaderClick("vpaId")}
                >
                  <span className="flex items-center">
                    ID
                    {getSortIndicator("vpaId")}
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
                  onClick={() => handleHeaderClick("submittedDate")}
                >
                  <span className="flex items-center">
                    Submitted Date
                    {getSortIndicator("submittedDate")}
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
              {filteredVPAs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No validation project approvals found
                  </td>
                </tr>
              ) : (
                paginatedVPAs.map((vpa) => {
                  const responseDue = getResponseDueDate(vpa);
                  const now = new Date();
                  const isOverdue = responseDue && responseDue < now && vpa.status === 0 && !vpa.responseDate;
                  const isDueIn24h = responseDue && responseDue <= new Date(now.getTime() + 24 * 60 * 60 * 1000) && responseDue > now && vpa.status === 0 && !vpa.responseDate;
                  const isDueIn3d = responseDue && responseDue <= new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) && responseDue > now && vpa.status === 0 && !vpa.responseDate;
                  
                  let rowColorClass = "";
                  if (isOverdue) {
                    rowColorClass = "bg-red-500/30";
                  } else if (isDueIn24h) {
                    rowColorClass = "bg-yellow-500/30";
                  } else if (isDueIn3d) {
                    rowColorClass = "bg-orange-500/30";
                  }
                  
                  return (
                    <tr key={vpa.id} className={`hover:bg-slate-900/60 ${rowColorClass}`}>
                      <td className="px-4 py-3 text-slate-400">{vpa.vpaId}</td>
                      <td className="px-4 py-3">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => handleOpenModal(vpa)}
                            className="bg-transparent border-0 p-0 text-left text-slate-100 hover:text-blue-400 transition cursor-pointer"
                          >
                            {vpa.learner.name}
                          </button>
                        ) : (
                          <span className="text-slate-100">{vpa.learner.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatDate(vpa.requestedDate)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{vpa.competencyLevel.competency.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block max-w-[140px] rounded-md px-2 py-0.5 text-sm font-semibold ${getVPALevelBadgeClass(vpa.competencyLevel.name)}`}>
                          {vpa.competencyLevel.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block max-w-[140px] rounded-md px-2 py-0.5 text-sm font-semibold ${getVPAStatusBadgeClass(vpa.status)}`}
                        >
                          {getVPAStatusLabel(vpa.status, statusLabels)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {responseDue ? formatDateTime(responseDue) : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {formatDateTime(vpa.updatedAt)}
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
      {filteredVPAs.length > 0 && (
        <Pagination
          totalItems={filteredVPAs.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[25, 50, 100]}
        />
      )}

      {/* Modal */}
      {selectedVPA && (
        <VPAModal
          open={isModalOpen}
          onClose={handleCloseModal}
          vpa={selectedVPA}
          users={users}
          statusLabels={statusLabels}
          onSave={handleSave}
          isPending={isPending}
          onFetch={async () => {
            const result = await getVPAById(selectedVPA.id);
            if (result.success && result.data) {
              return result.data as VPAWithRelations;
            }
            return null;
          }}
        />
      )}
    </div>
  );
}

