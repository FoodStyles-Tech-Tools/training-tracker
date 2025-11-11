"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

import type { Competency } from "@/db/schema";
import { TableControls, SortOption } from "@/components/admin/table-controls";
import { Pagination } from "@/components/admin/pagination";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { deleteCompetencyAction } from "./actions";

type CompetencyWithTrainers = Competency & {
  trainers: Array<{ id: string; name: string }>;
};

type PermissionAbility = {
  canList: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

interface CompetencyManagerProps {
  competencies: CompetencyWithTrainers[];
  users: Array<{ id: string; name: string }>;
  competencyLevels: Array<{
    id: string;
    competencyId: string;
    name: string;
    competencyName: string;
  }>;
  ability: PermissionAbility;
}

const COMPETENCY_SORT_OPTIONS: SortOption[] = [
  { value: "updated-desc", label: "Last Update (Newest)" },
  { value: "updated-asc", label: "Last Update (Oldest)" },
  { value: "name-asc", label: "Name A → Z" },
  { value: "name-desc", label: "Name Z → A" },
];

export function CompetencyManager({
  competencies,
  users,
  competencyLevels,
  ability,
}: CompetencyManagerProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingDeleteCompetency, setPendingDeleteCompetency] =
    useState<CompetencyWithTrainers | null>(null);
  const [searchName, setSearchName] = useState("");
  const [searchTrainer, setSearchTrainer] = useState("");
  const [searchStatus, setSearchStatus] = useState<string>("");
  const [sortOption, setSortOption] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Check for success message from URL params
  useEffect(() => {
    const action = searchParams.get("action");
    const name = searchParams.get("name");
    
    if (action && name) {
      const competencyName = decodeURIComponent(name);
      if (action === "created") {
        setMessage({
          text: `${competencyName} successfully created`,
          tone: "success",
        });
      } else if (action === "updated") {
        setMessage({
          text: `${competencyName} successfully updated`,
          tone: "success",
        });
      }
      
      // Clear URL params
      router.replace("/admin/competencies", { scroll: false });
    }
  }, [searchParams, router]);

  const requestDeleteCompetency = (competency: CompetencyWithTrainers) => {
    setMessage(null);
    setPendingDeleteCompetency(competency);
  };

  const cancelDeleteRequest = () => {
    if (!isPending) {
      setPendingDeleteCompetency(null);
    }
  };

  const confirmDeleteCompetency = () => {
    if (!pendingDeleteCompetency) {
      return;
    }
    const competencyToDelete = pendingDeleteCompetency;
    setMessage(null);
    startTransition(async () => {
      try {
        await deleteCompetencyAction(competencyToDelete.id);
        setMessage({
          text: `Competency ${competencyToDelete.name} successfully deleted.`,
          tone: "success",
        });
      } catch (error) {
        console.error(error);
        setMessage({
          text: error instanceof Error ? error.message : "Unable to delete competency.",
          tone: "error",
        });
      } finally {
        setPendingDeleteCompetency(null);
      }
    });
  };

  const { filteredAndSortedCompetencies, totalFilteredCompetencies } = useMemo(() => {
    let filtered = competencies.filter((comp) => {
      const nameMatch = !searchName || comp.name.toLowerCase().includes(searchName.toLowerCase());
      const trainerMatch =
        !searchTrainer ||
        comp.trainers.some((t) => t.name.toLowerCase().includes(searchTrainer.toLowerCase()));
      const statusMatch =
        !searchStatus ||
        (searchStatus === "draft" && comp.status === 0) ||
        (searchStatus === "published" && comp.status === 1);
      return nameMatch && trainerMatch && statusMatch;
    });

    const toTime = (value: Date | string | null | undefined) =>
      value ? new Date(value).getTime() : 0;

    const sorted = filtered.sort((a, b) => {
      if (!sortOption) {
        // No sort - maintain original order
        return 0;
      }
      
      switch (sortOption) {
        case "name-asc":
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        case "name-desc":
          return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
        case "trainer-asc": {
          const aTrainers = a.trainers.map((t) => t.name).join(", ") || "—";
          const bTrainers = b.trainers.map((t) => t.name).join(", ") || "—";
          return aTrainers.localeCompare(bTrainers, undefined, { sensitivity: "base" });
        }
        case "trainer-desc": {
          const aTrainers = a.trainers.map((t) => t.name).join(", ") || "—";
          const bTrainers = b.trainers.map((t) => t.name).join(", ") || "—";
          return bTrainers.localeCompare(aTrainers, undefined, { sensitivity: "base" });
        }
        case "status-asc":
          return a.status - b.status;
        case "status-desc":
          return b.status - a.status;
        case "updated-asc":
          return toTime(a.updatedAt) - toTime(b.updatedAt);
        case "updated-desc":
          return toTime(b.updatedAt) - toTime(a.updatedAt);
        default:
          return 0;
      }
    });

    return { filteredAndSortedCompetencies: sorted, totalFilteredCompetencies: sorted.length };
  }, [competencies, searchName, searchTrainer, searchStatus, sortOption]);

  // Helper function to get sort indicator
  const getSortIndicator = (column: string) => {
    const isAsc = sortOption === `${column}-asc`;
    const isDesc = sortOption === `${column}-desc`;
    
    if (isAsc) {
      return <span className="ml-1 text-blue-400">↑</span>;
    }
    if (isDesc) {
      return <span className="ml-1 text-blue-400">↓</span>;
    }
    return <span className="ml-1 text-slate-500">↕</span>;
  };

  // Handle header click for sorting
  const handleHeaderClick = (column: string) => {
    const currentSort = sortOption;
    let newSort: string;
    
    if (currentSort.startsWith(column)) {
      // Toggle between asc and desc
      newSort = currentSort.endsWith("-asc") ? `${column}-desc` : `${column}-asc`;
    } else {
      // Set to ascending by default
      newSort = `${column}-asc`;
    }
    
    setSortOption(newSort);
    setCurrentPage(1);
  };

  // Paginate the filtered and sorted competencies
  const visibleCompetencies = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredAndSortedCompetencies.slice(startIndex, endIndex);
  }, [filteredAndSortedCompetencies, currentPage, pageSize]);

  // Reset to page 1 when search or sort changes
  const handleSearchChange = () => {
    setCurrentPage(1);
  };

  const handleSortChange = (value: string) => {
    setSortOption(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Competencies</h1>
        </div>
        {ability.canAdd && (
          <Link href="/admin/competencies/new">
            <Button type="button" disabled={isPending}>
              + Add Competency
            </Button>
          </Link>
        )}
      </div>

      {/* Search Form */}
      <Card>
        <CardContent className="p-4">
          <form
            className="flex flex-col gap-4 sm:flex-row sm:flex-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchChange();
            }}
          >
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <label htmlFor="search-competency-name" className="mb-1.5 block text-xs font-medium text-slate-300">
                Competency Name
              </label>
              <Input
                type="text"
                id="search-competency-name"
                name="competency-name"
                placeholder="Search by competency name..."
                value={searchName}
                onChange={(e) => {
                  setSearchName(e.target.value);
                  handleSearchChange();
                }}
              />
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <label htmlFor="search-trainer" className="mb-1.5 block text-xs font-medium text-slate-300">
                Trainer
              </label>
              <Input
                type="text"
                id="search-trainer"
                name="trainer"
                placeholder="Search by trainer..."
                value={searchTrainer}
                onChange={(e) => {
                  setSearchTrainer(e.target.value);
                  handleSearchChange();
                }}
              />
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <label htmlFor="search-status" className="mb-1.5 block text-xs font-medium text-slate-300">
                Status
              </label>
              <Select
                id="search-status"
                name="status"
                value={searchStatus}
                onChange={(e) => {
                  setSearchStatus(e.target.value);
                  handleSearchChange();
                }}
              >
                <option value="">All Status</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </Select>
            </div>
            <div className="flex w-full sm:w-auto items-end gap-2">
              <Button type="submit" disabled={isPending}>
                Search
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearchName("");
                  setSearchTrainer("");
                  setSearchStatus("");
                  handleSearchChange();
                }}
                disabled={isPending}
              >
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {message ? <Alert variant={message.tone}>{message.text}</Alert> : null}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-950/70 text-slate-300">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">No</th>
                  <th
                    className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                    onClick={() => handleHeaderClick("name")}
                  >
                    <span className="flex items-center">
                      Competency Name
                      {getSortIndicator("name")}
                    </span>
                  </th>
                  <th
                    className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-900/50 transition-colors select-none"
                    onClick={() => handleHeaderClick("trainer")}
                  >
                    <span className="flex items-center">
                      Trainers
                      {getSortIndicator("trainer")}
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
                    onClick={() => handleHeaderClick("updated")}
                  >
                    <span className="flex items-center">
                      Last Update
                      {getSortIndicator("updated")}
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {visibleCompetencies.length ? (
                  visibleCompetencies.map((competency, index) => (
                    <tr key={competency.id} className="hover:bg-slate-900/60">
                      <td className="px-4 py-3 text-slate-400">{(currentPage - 1) * pageSize + index + 1}</td>
                      <td className="px-4 py-3 text-slate-100">{competency.name}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {competency.trainers.length > 0
                          ? competency.trainers.map((t) => t.name).join(", ")
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block max-w-[140px] rounded-md px-2 py-0.5 text-sm font-semibold ${
                            competency.status === 1
                              ? "bg-emerald-500/20 text-emerald-200"
                              : "bg-amber-500/20 text-amber-200"
                          }`}
                        >
                          {competency.status === 1 ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {new Date(competency.updatedAt).toLocaleString("en-US", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {ability.canEdit && (
                            <Link href={`/admin/competencies/${competency.id}`}>
                              <Button type="button" variant="secondary" size="sm" disabled={isPending}>
                                Edit
                              </Button>
                            </Link>
                          )}
                          {ability.canDelete && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => requestDeleteCompetency(competency)}
                              disabled={isPending}
                              className="border-red-500 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                      No competencies found for the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <Pagination
        totalItems={totalFilteredCompetencies}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(newPageSize) => {
          setPageSize(newPageSize);
          setCurrentPage(1);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteCompetency)}
        title="Confirm deletion"
        description={
          pendingDeleteCompetency ? (
            <>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-slate-100">{pendingDeleteCompetency.name}</span>? This
              action cannot be undone.
            </>
          ) : undefined
        }
        onCancel={cancelDeleteRequest}
        onConfirm={confirmDeleteCompetency}
        cancelLabel="Cancel"
        confirmLabel="Delete"
        cancelProps={{ disabled: isPending }}
        confirmProps={{
          disabled: isPending,
          variant: "outline",
          className: "border-red-500 text-red-300 hover:bg-red-500/10 hover:text-red-200",
        }}
      />
    </div>
  );
}

