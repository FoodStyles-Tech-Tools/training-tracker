"use client";

import { useState, useMemo, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import type { TrainingRequest, Competency, User } from "@/db/schema";
import { getTrainingRequestStatusLabel, getStatusBadgeClass } from "@/lib/training-request-config";
import { updateTrainingRequestAction } from "./actions";
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
};

interface TrainingRequestManagerProps {
  trainingRequests: TrainingRequestWithRelations[];
  competencies: Competency[];
  users: User[];
  statusLabels: string[];
}

export function TrainingRequestManager({
  trainingRequests,
  competencies,
  users,
  statusLabels,
}: TrainingRequestManagerProps) {
  const [selectedRequest, setSelectedRequest] = useState<TrainingRequestWithRelations | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  // Search/filter state
  const [filters, setFilters] = useState({
    name: "",
    competency: "",
    level: "",
    status: "",
    trainer: "",
    batch: "",
  });

  // Filtered training requests
  const filteredRequests = useMemo(() => {
    return trainingRequests.filter((tr) => {
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
      // Add more filters as needed
      return true;
    });
  }, [trainingRequests, filters]);

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
        // Close modal first
        setIsModalOpen(false);
        setSelectedRequest(null);
        
        // Show success message
        setMessage({ text: `${selectedRequest.trId} Successfully updated`, tone: "success" });
        
        // Reload after showing message for 5 seconds
        setTimeout(() => {
          window.location.reload();
        }, 5000);
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
    });
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
              onClick={handleClearFilters}
              variant="outline"
              className="rounded-md border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-700/50"
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
                <th className="px-4 py-3 text-left font-medium">TR ID</th>
                <th className="px-4 py-3 text-left font-medium">Requested date</th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Competency</th>
                <th className="px-4 py-3 text-left font-medium">Level</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Batch</th>
                <th className="px-4 py-3 text-left font-medium">Trainer</th>
                <th className="px-4 py-3 text-left font-medium">Response Due Date</th>
                <th className="px-4 py-3 text-left font-medium">Last Update</th>
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
                filteredRequests.map((tr) => (
                  <tr key={tr.id} className="hover:bg-slate-900/60">
                    <td className="px-4 py-3 text-slate-400">{tr.trId}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatDate(tr.requestedDate)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleOpenModal(tr)}
                        className="bg-transparent border-0 p-0 text-left text-slate-100 hover:text-blue-400 transition cursor-pointer"
                      >
                        {tr.learner.name}
                      </button>
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
                    <td className="px-4 py-3 text-slate-300">-</td>
                    <td className="px-4 py-3 text-slate-300">-</td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatDate(tr.responseDue)}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatDate(tr.updatedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

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
        />
      )}
    </div>
  );
}

