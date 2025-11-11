"use client";

import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/admin/pagination";
import type { TrainingBatch, Competency, User } from "@/db/schema";
import { deleteTrainingBatchAction, removeLearnerFromBatchAction, dropOffLearnerAction } from "./actions";
import { Users as UsersIcon } from "lucide-react";

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

// Helper function to get level badge color
function getLevelBadgeClass(level: string): string {
  switch (level.toLowerCase()) {
    case "basic":
      return "bg-blue-500/20 text-blue-200";
    case "competent":
      return "bg-emerald-500/20 text-emerald-200";
    case "advanced":
      return "bg-purple-500/20 text-purple-200";
    default:
      return "bg-slate-500/20 text-slate-200";
  }
}

type TrainingBatchWithRelations = TrainingBatch & {
  competencyLevel: {
    id: string;
    name: string;
    competency: {
      id: string;
      name: string;
    };
  };
  trainer: {
    id: string;
    name: string;
  };
  learners: Array<{
    learnerUserId: string;
    learner: {
      id: string;
      name: string;
      email: string;
    };
  }>;
};

interface TrainingBatchManagerProps {
  trainingBatches: TrainingBatchWithRelations[];
  competencies: Competency[];
  trainers: User[];
}

export function TrainingBatchManager({
  trainingBatches,
  competencies,
  trainers,
}: TrainingBatchManagerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedBatchForDelete, setSelectedBatchForDelete] = useState<string | null>(null);
  const [learnersModalOpen, setLearnersModalOpen] = useState(false);
  const [selectedBatchForLearners, setSelectedBatchForLearners] = useState<TrainingBatchWithRelations | null>(null);
  const [learnersData, setLearnersData] = useState<Array<{ id: string; name: string; email: string; status: string }>>([]);
  const [removeLearnerConfirm, setRemoveLearnerConfirm] = useState<{ learnerId: string; learnerName: string } | null>(null);
  const [dropOffLearnerConfirm, setDropOffLearnerConfirm] = useState<{ learnerId: string; learnerName: string } | null>(null);
  const processedParamsRef = useRef<string>("");

  // Check for success messages from query parameters
  useEffect(() => {
    const action = searchParams.get("action");
    const name = searchParams.get("name");
    const paramsKey = `${action}-${name}`;

    // Only process if we haven't processed these params yet
    if (action && name && paramsKey !== processedParamsRef.current) {
      processedParamsRef.current = paramsKey;
      const decodedName = decodeURIComponent(name);
      
      if (action === "created") {
        setMessage({ text: `Training batch "${decodedName}" created successfully.`, tone: "success" });
        // Refresh page data
        router.refresh();
        // Clear query parameters after message is set
        setTimeout(() => {
          router.replace("/admin/training-batches", { scroll: false });
          processedParamsRef.current = ""; // Reset after clearing
        }, 200);
        // Auto-dismiss after 5 seconds
        setTimeout(() => setMessage(null), 5000);
      } else if (action === "updated") {
        setMessage({ text: `Training batch "${decodedName}" updated successfully.`, tone: "success" });
        // Refresh page data
        router.refresh();
        // Clear query parameters after message is set
        setTimeout(() => {
          router.replace("/admin/training-batches", { scroll: false });
          processedParamsRef.current = ""; // Reset after clearing
        }, 200);
        // Auto-dismiss after 5 seconds
        setTimeout(() => setMessage(null), 5000);
      }
    }
  }, [searchParams, router]);

  // Search/filter state
  const [filters, setFilters] = useState({
    competency: "",
    level: "",
    batchName: "",
    trainer: "",
  });

  // Get unique levels from batches
  const levels = useMemo(() => {
    const levelSet = new Set<string>();
    trainingBatches.forEach((batch) => {
      levelSet.add(batch.competencyLevel.name);
    });
    return Array.from(levelSet).sort();
  }, [trainingBatches]);

  // Filtered batches
  const filteredBatches = useMemo(() => {
    let filtered = [...trainingBatches];

    // Apply filters
    if (filters.competency) {
      filtered = filtered.filter(
        (batch) => batch.competencyLevel.competency.id === filters.competency,
      );
    }

    if (filters.level) {
      filtered = filtered.filter(
        (batch) => batch.competencyLevel.name === filters.level,
      );
    }

    if (filters.batchName) {
      filtered = filtered.filter((batch) =>
        batch.batchName.toLowerCase().includes(filters.batchName.toLowerCase()),
      );
    }

    if (filters.trainer) {
      filtered = filtered.filter((batch) =>
        batch.trainer.name.toLowerCase().includes(filters.trainer.toLowerCase()),
      );
    }

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortColumn) {
          case "competency":
            aValue = a.competencyLevel.competency.name.toLowerCase();
            bValue = b.competencyLevel.competency.name.toLowerCase();
            break;
          case "level":
            aValue = a.competencyLevel.name.toLowerCase();
            bValue = b.competencyLevel.name.toLowerCase();
            break;
          case "batchName":
            aValue = a.batchName.toLowerCase();
            bValue = b.batchName.toLowerCase();
            break;
          case "trainer":
            aValue = a.trainer.name.toLowerCase();
            bValue = b.trainer.name.toLowerCase();
            break;
          case "learners":
            aValue = a.learners.length;
            bValue = b.learners.length;
            break;
          case "estimatedStart":
            aValue = a.estimatedStart instanceof Date ? a.estimatedStart : (a.estimatedStart ? new Date(a.estimatedStart) : null);
            bValue = b.estimatedStart instanceof Date ? b.estimatedStart : (b.estimatedStart ? new Date(b.estimatedStart) : null);
            break;
          case "createdAt":
            aValue = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
            bValue = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
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
      });
    }

    return filtered;
  }, [trainingBatches, filters, sortColumn, sortDirection]);

  // Paginated batches
  const paginatedBatches = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredBatches.slice(startIndex, endIndex);
  }, [filteredBatches, currentPage, pageSize]);

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

  const handleDelete = async (batchId: string) => {
    setMessage(null);
    const batch = trainingBatches.find(b => b.id === batchId);
    const batchName = batch?.batchName || "";
    startTransition(async () => {
      const result = await deleteTrainingBatchAction(batchId);
      if (result.success) {
        setSelectedBatchForDelete(null);
        setMessage({ 
          text: batchName 
            ? `Training batch "${batchName}" deleted successfully.` 
            : "Training batch deleted successfully.", 
          tone: "success" 
        });
        setTimeout(() => {
          router.refresh();
        }, 1000);
        // Auto-dismiss after 5 seconds
        setTimeout(() => setMessage(null), 5000);
      } else {
        setMessage({ text: result.error || "Failed to delete training batch.", tone: "error" });
        // Auto-dismiss error after 5 seconds
        setTimeout(() => setMessage(null), 5000);
      }
    });
  };

  const handleOpenLearnersModal = async (batch: TrainingBatchWithRelations) => {
    setSelectedBatchForLearners(batch);
    setLearnersModalOpen(true);
    
    // Fetch learners data
    try {
      const response = await fetch(`/api/training-batches/${batch.id}/learners`);
      if (response.ok) {
        const data = await response.json();
        setLearnersData(data.learners || []);
      } else {
        setLearnersData([]);
      }
    } catch (error) {
      console.error("Error fetching learners:", error);
      setLearnersData([]);
    }
  };

  const handleCloseLearnersModal = () => {
    setLearnersModalOpen(false);
    setSelectedBatchForLearners(null);
    setLearnersData([]);
  };

  const handleRemoveLearner = async (learnerId: string) => {
    if (!selectedBatchForLearners) return;
    
    setMessage(null);
    setRemoveLearnerConfirm(null);
    startTransition(async () => {
      const result = await removeLearnerFromBatchAction(selectedBatchForLearners.id, learnerId);
      if (result.success) {
        setMessage({ text: "Learner removed successfully.", tone: "success" });
        // Refresh learners data
        const response = await fetch(`/api/training-batches/${selectedBatchForLearners.id}/learners`);
        if (response.ok) {
          const data = await response.json();
          setLearnersData(data.learners || []);
        }
        setTimeout(() => {
          router.refresh();
        }, 1000);
        // Auto-dismiss after 5 seconds
        setTimeout(() => setMessage(null), 5000);
      } else {
        setMessage({ text: result.error || "Failed to remove learner.", tone: "error" });
        // Auto-dismiss error after 5 seconds
        setTimeout(() => setMessage(null), 5000);
      }
    });
  };

  const handleDropOffLearner = async (learnerId: string) => {
    if (!selectedBatchForLearners) return;
    
    setMessage(null);
    setDropOffLearnerConfirm(null);
    startTransition(async () => {
      const result = await dropOffLearnerAction(selectedBatchForLearners.id, learnerId);
      if (result.success) {
        setMessage({ text: "Learner dropped off successfully.", tone: "success" });
        // Refresh learners data
        const response = await fetch(`/api/training-batches/${selectedBatchForLearners.id}/learners`);
        if (response.ok) {
          const data = await response.json();
          setLearnersData(data.learners || []);
        }
        setTimeout(() => {
          router.refresh();
        }, 1000);
        // Auto-dismiss after 5 seconds
        setTimeout(() => setMessage(null), 5000);
      } else {
        setMessage({ text: result.error || "Failed to drop off learner.", tone: "error" });
        // Auto-dismiss error after 5 seconds
        setTimeout(() => setMessage(null), 5000);
      }
    });
  };

  const handleClearFilters = () => {
    setFilters({
      competency: "",
      level: "",
      batchName: "",
      trainer: "",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Training Batches</h1>
          <p className="text-sm text-slate-400">
            Manage training batches, trainers, and learners.
          </p>
        </div>
        <Link
          href="/admin/training-batches/create"
          className="self-start inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          + Create Batch
        </Link>
      </div>

      {message && (
        <Alert variant={message.tone === "success" ? "success" : "error"}>
          {message.text}
        </Alert>
      )}

      {/* Search Form */}
      <Card className="p-4">
        <form
          className="flex flex-col gap-4 sm:flex-row sm:flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <div className="flex-1 min-w-0 sm:min-w-[200px]">
            <label htmlFor="search-competency" className="mb-1.5 block text-xs font-medium text-slate-300">
              Competency
            </label>
            <Input
              id="search-competency"
              type="text"
              placeholder="Search by competency..."
              value={filters.competency}
              onChange={(e) => setFilters({ ...filters, competency: e.target.value })}
            />
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
            <label htmlFor="search-batch" className="mb-1.5 block text-xs font-medium text-slate-300">
              Batch Name
            </label>
            <Input
              id="search-batch"
              type="text"
              placeholder="Search by batch name..."
              value={filters.batchName}
              onChange={(e) => setFilters({ ...filters, batchName: e.target.value })}
            />
          </div>
          <div className="flex-1 min-w-0 sm:min-w-[200px]">
            <label htmlFor="search-trainer" className="mb-1.5 block text-xs font-medium text-slate-300">
              Trainer
            </label>
            <Input
              id="search-trainer"
              type="text"
              placeholder="Search by trainer..."
              value={filters.trainer}
              onChange={(e) => setFilters({ ...filters, trainer: e.target.value })}
            />
          </div>
          <div className="flex w-full sm:w-auto items-end gap-2">
            <Button
              type="button"
              onClick={handleClearFilters}
              variant="outline"
              className="flex-1 sm:flex-none rounded-md border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-700/50"
            >
              Clear
            </Button>
          </div>
        </form>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-950/70 text-slate-300">
              <tr>
                <th className="px-4 py-3 text-left font-medium">No</th>
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
                  onClick={() => handleHeaderClick("batchName")}
                >
                  <span className="flex items-center">
                    Batch Name
                    {getSortIndicator("batchName")}
                  </span>
                </th>
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                  onClick={() => handleHeaderClick("trainer")}
                >
                  <span className="flex items-center">
                    Trainer
                    {getSortIndicator("trainer")}
                  </span>
                </th>
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                  onClick={() => handleHeaderClick("learners")}
                >
                  <span className="flex items-center">
                    Learners
                    {getSortIndicator("learners")}
                  </span>
                </th>
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                  onClick={() => handleHeaderClick("estimatedStart")}
                >
                  <span className="flex items-center">
                    Estimate start date
                    {getSortIndicator("estimatedStart")}
                  </span>
                </th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No training batches found
                  </td>
                </tr>
              ) : (
                paginatedBatches.map((batch, index) => {
                  const learnersCount = batch.learners.length;
                  const spotLeft = batch.capacity - learnersCount;
                  
                  return (
                    <tr key={batch.id} className="hover:bg-slate-900/60">
                      <td className="px-4 py-3 text-slate-400">
                        {(currentPage - 1) * pageSize + index + 1}
                      </td>
                      <td className="px-4 py-3 text-slate-100">
                        {batch.competencyLevel.competency.name}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block max-w-[140px] rounded-md px-2 py-0.5 text-sm font-semibold ${getLevelBadgeClass(
                            batch.competencyLevel.name,
                          )}`}
                        >
                          {batch.competencyLevel.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-100">{batch.batchName}</td>
                      <td className="px-4 py-3 text-slate-300">{batch.trainer.name}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenLearnersModal(batch)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/50 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-blue-500/50 hover:bg-slate-700/50 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                          >
                            <UsersIcon className="h-3.5 w-3.5" />
                            {learnersCount}
                          </button>
                          <span className="text-xs text-slate-500">
                            Spot left {spotLeft}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatDate(batch.estimatedStart)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/training-batches/${batch.id}/edit`}
                            className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            onClick={() => setSelectedBatchForDelete(batch.id)}
                            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                          >
                            Delete
                          </button>
                        </div>
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
      {filteredBatches.length > 0 && (
        <Pagination
          totalItems={filteredBatches.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[25, 50, 100]}
        />
      )}

      {/* Learners Modal */}
      <Modal
        open={learnersModalOpen}
        onClose={handleCloseLearnersModal}
        contentClassName="max-w-2xl max-h-[80vh] overflow-hidden"
        overlayClassName="bg-black/60 backdrop-blur-sm"
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {selectedBatchForLearners ? `${selectedBatchForLearners.batchName} - Learners` : "Batch Learners"}
            </h2>
            <p className="text-sm text-slate-400">
              {selectedBatchForLearners
                ? `${selectedBatchForLearners.learners.length} learner${selectedBatchForLearners.learners.length !== 1 ? "s" : ""} in this batch`
                : "Viewing learners in this batch"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCloseLearnersModal}
            className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            aria-label="Close modal"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-6">
          <div className="space-y-3">
            {learnersData.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No learners in this batch</p>
            ) : (
              learnersData.map((learner) => (
                <div
                  key={learner.id}
                  className="flex items-center justify-between rounded-md border border-slate-800/80 bg-slate-900/50 p-4 hover:bg-slate-800/50 transition"
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-100">{learner.name}</p>
                    <p className="text-sm text-slate-400">{learner.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRemoveLearnerConfirm({ learnerId: learner.id, learnerName: learner.name })}
                      disabled={isPending}
                      className="rounded-md border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-50"
                    >
                      Remove from Batch
                    </button>
                    <button
                      type="button"
                      onClick={() => setDropOffLearnerConfirm({ learnerId: learner.id, learnerName: learner.name })}
                      disabled={isPending}
                      className="rounded-md border border-red-700 bg-red-800/50 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
                    >
                      Drop-off
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!selectedBatchForDelete}
        title="Delete Training Batch"
        description="Are you sure you want to delete this training batch? This action cannot be undone. All learners will be moved back to 'In Queue' status."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (selectedBatchForDelete) {
            handleDelete(selectedBatchForDelete);
          }
        }}
        onCancel={() => setSelectedBatchForDelete(null)}
        confirmProps={{
          className: "bg-red-600 hover:bg-red-700",
        }}
      />

      {/* Remove Learner Confirmation Dialog */}
      <ConfirmDialog
        open={!!removeLearnerConfirm}
        title="Remove Learner from Batch"
        description={`Are you sure you want to remove "${removeLearnerConfirm?.learnerName}" from this training batch? The learner's training request will be moved back to 'In Queue' status.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (removeLearnerConfirm) {
            handleRemoveLearner(removeLearnerConfirm.learnerId);
          }
        }}
        onCancel={() => setRemoveLearnerConfirm(null)}
        confirmProps={{
          disabled: isPending,
        }}
        cancelProps={{
          disabled: isPending,
        }}
      />

      {/* Drop Off Learner Confirmation Dialog */}
      <ConfirmDialog
        open={!!dropOffLearnerConfirm}
        title="Drop Off Learner"
        description={`Are you sure you want to drop off "${dropOffLearnerConfirm?.learnerName}" from this training batch? This action will mark the learner as dropped off.`}
        confirmLabel="Drop Off"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (dropOffLearnerConfirm) {
            handleDropOffLearner(dropOffLearnerConfirm.learnerId);
          }
        }}
        onCancel={() => setDropOffLearnerConfirm(null)}
        confirmProps={{
          className: "bg-red-600 hover:bg-red-700",
          disabled: isPending,
        }}
        cancelProps={{
          disabled: isPending,
        }}
      />
    </div>
  );
}

