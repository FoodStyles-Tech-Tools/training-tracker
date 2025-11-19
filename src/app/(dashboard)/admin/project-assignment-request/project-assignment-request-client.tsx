"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import "flatpickr/dist/themes/dark.css";
import { useRouter } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import type { Competency, ProjectAssignmentRequest } from "@/db/schema";
import {
  getPARStatusBadgeClass,
  getPARStatusLabel,
  getPARLevelBadgeClass,
} from "@/lib/par-config";
import { updateProjectAssignmentRequestAction } from "./actions";

type PARWithRelations = ProjectAssignmentRequest & {
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

export type AssignableUser = {
  id: string;
  name: string;
  roleName: string | null;
};

interface ProjectAssignmentRequestClientProps {
  pars: PARWithRelations[];
  competencies: Competency[];
  statusLabels: string[];
  assignableUsers: AssignableUser[];
}

type FormState = {
  status: string;
  assignedTo: string;
  projectName: string;
  description: string;
  definiteAnswer: string;
  responseDate: string;
  followUpDate: string;
};

const PROJECT_OPTIONS = [
  "Customer Service Excellence",
  "Food Safety Implementation",
  "Hospitality Training Program",
  "Quality Assurance Project",
  "Compliance Review",
];

const initialFormState: FormState = {
  status: "",
  assignedTo: "",
  projectName: "",
  description: "",
  definiteAnswer: "",
  responseDate: "",
  followUpDate: "",
};

// Helper function to format dates as "d M Y" (e.g., "20 Nov 2025")
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";

  const day = d.getDate().toString().padStart(2, "0");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

// Helper function to format dates with time as "d M Y HH:mm:ss"
function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";

  const day = d.getDate().toString().padStart(2, "0");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const seconds = d.getSeconds().toString().padStart(2, "0");
  return `${day} ${month} ${year} ${hours}:${minutes}:${seconds}`;
}

function toDateInputValue(date?: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToDate(
  date?: Date | string | null,
  days: number,
): Date | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : new Date(date);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d;
}

export function ProjectAssignmentRequestClient({
  pars: initialPARs,
  competencies,
  statusLabels,
  assignableUsers,
}: ProjectAssignmentRequestClientProps) {
  const [searchName, setSearchName] = useState("");
  const [filterCompetency, setFilterCompetency] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [selectedPar, setSelectedPar] = useState<PARWithRelations | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [serverError, setServerError] = useState<string | null>(null);
  const responseDateRef = useRef<HTMLInputElement | null>(null);
  const followUpDateRef = useRef<HTMLInputElement | null>(null);
  const responseDatePicker = useRef<flatpickr.Instance | null>(null);
  const followUpDatePicker = useRef<flatpickr.Instance | null>(null);

  const filteredPARs = useMemo(() => {
    return initialPARs.filter((par) => {
      if (searchName) {
        const nameMatch = par.learner.name
          .toLowerCase()
          .includes(searchName.toLowerCase());
        if (!nameMatch) return false;
      }

      if (filterCompetency) {
        if (par.competencyLevel.competency.id !== filterCompetency) return false;
      }

      if (filterLevel) {
        if (par.competencyLevel.name.toLowerCase() !== filterLevel.toLowerCase())
          return false;
      }

      if (filterStatus !== "") {
        if (par.status !== parseInt(filterStatus, 10)) return false;
      }

      return true;
    });
  }, [initialPARs, searchName, filterCompetency, filterLevel, filterStatus]);

  const showResponseSection = formState.status === "0";
  const showFollowUpSection = formState.definiteAnswer === "no";

  const computedResponseDueDate = selectedPar
    ? selectedPar.responseDue ?? addDaysToDate(selectedPar.requestedDate, 1)
    : null;
  const computedNoAnswerFollowDate = selectedPar
    ? addDaysToDate(selectedPar.requestedDate, 3)
    : null;

  const handleRowClick = (par: PARWithRelations) => {
    setSelectedPar(par);
    setFormState({
      status: par.status.toString(),
      assignedTo: par.assignedUser?.id ?? "",
      projectName: par.projectName ?? "",
      description: par.description ?? "",
      definiteAnswer:
        par.definiteAnswer === true
          ? "yes"
          : par.definiteAnswer === false
            ? "no"
            : "",
      responseDate: toDateInputValue(par.responseDate),
      followUpDate: toDateInputValue(par.followUpDate),
    });
    setServerError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedPar(null);
    setFormState(initialFormState);
    setServerError(null);
  };
  const updateFormField = useCallback((field: keyof FormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
    setServerError(null);
  }, []);

  useEffect(() => {
    if (!modalOpen) {
      responseDatePicker.current?.destroy();
      responseDatePicker.current = null;
      return;
    }

    if (responseDateRef.current && !responseDatePicker.current) {
      responseDatePicker.current = flatpickr(responseDateRef.current, {
        dateFormat: "Y-m-d",
        allowInput: false,
        clickOpens: true,
        onChange: (selectedDates) => {
          updateFormField(
            "responseDate",
            selectedDates.length ? toDateInputValue(selectedDates[0]) : "",
          );
        },
      });
    }
  }, [modalOpen, updateFormField]);

  useEffect(() => {
    if (!modalOpen || !showFollowUpSection) {
      followUpDatePicker.current?.destroy();
      followUpDatePicker.current = null;
      return;
    }

    if (followUpDateRef.current && !followUpDatePicker.current) {
      followUpDatePicker.current = flatpickr(followUpDateRef.current, {
        dateFormat: "Y-m-d",
        allowInput: false,
        clickOpens: true,
        onChange: (selectedDates) => {
          updateFormField(
            "followUpDate",
            selectedDates.length ? toDateInputValue(selectedDates[0]) : "",
          );
        },
      });
    }
  }, [modalOpen, showFollowUpSection, updateFormField]);

  useEffect(() => {
    if (responseDatePicker.current) {
      if (formState.responseDate) {
        responseDatePicker.current.setDate(formState.responseDate, false);
      } else {
        responseDatePicker.current.clear(false);
      }
    }
  }, [formState.responseDate]);

  useEffect(() => {
    if (followUpDatePicker.current) {
      if (formState.followUpDate) {
        followUpDatePicker.current.setDate(formState.followUpDate, false);
      } else {
        followUpDatePicker.current.clear(false);
      }
    }
  }, [formState.followUpDate]);

  const handleSave = () => {
    if (!selectedPar) return;
    const parsedStatus = Number(formState.status);
    const responseDateValue =
      formState.responseDate !== "" ? new Date(formState.responseDate) : null;
    const followUpDateValue =
      formState.followUpDate !== "" ? new Date(formState.followUpDate) : null;
    const noFollowUpDateValue =
      showFollowUpSection && computedNoAnswerFollowDate
        ? computedNoAnswerFollowDate
        : null;

    startTransition(async () => {
      const result = await updateProjectAssignmentRequestAction({
        id: selectedPar.id,
        status: Number.isNaN(parsedStatus) ? selectedPar.status : parsedStatus,
        assignedTo: formState.assignedTo || null,
        responseDate: responseDateValue,
        projectName: formState.projectName || null,
        description: formState.description || null,
        definiteAnswer:
          formState.definiteAnswer === "yes"
            ? true
            : formState.definiteAnswer === "no"
              ? false
              : undefined,
        followUpDate: followUpDateValue,
        noFollowUpDate: noFollowUpDateValue,
      });

      if (result.success) {
        closeModal();
        router.refresh();
      } else {
        setServerError(result.error ?? "Failed to update project assignment request");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Project Assignment Request</h1>
        <p className="text-sm text-slate-400">
          Manage project assignment requests under validation project approval.
        </p>
      </div>

      {/* Search Form */}
      <Card>
        <CardContent className="p-4">
          <form className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <Label
                htmlFor="search-name"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                Name
              </Label>
              <Input
                id="search-name"
                type="text"
                placeholder="Search by name..."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <Label
                htmlFor="search-competency"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                Competency
              </Label>
              <Select
                id="search-competency"
                value={filterCompetency}
                onChange={(e) => setFilterCompetency(e.target.value)}
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
              <Label
                htmlFor="search-level"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                Level
              </Label>
              <Select
                id="search-level"
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
              >
                <option value="">All Levels</option>
                <option value="Basic">Basic</option>
                <option value="Competent">Competent</option>
                <option value="Advanced">Advanced</option>
              </Select>
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <Label
                htmlFor="search-status"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                Status
              </Label>
              <Select
                id="search-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">All Status</option>
                {statusLabels.map((label, index) => (
                  <option key={index} value={index.toString()}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex w-full sm:w-auto items-end gap-2">
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                }}
              >
                Search
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearchName("");
                  setFilterCompetency("");
                  setFilterLevel("");
                  setFilterStatus("");
                }}
              >
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Project Assignment Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-950/70 text-left text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Requested Date</th>
                  <th className="px-4 py-3 font-medium">Competencies</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last Update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredPARs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No project assignment requests found.
                    </td>
                  </tr>
                ) : (
                  filteredPARs.map((par) => (
                    <tr
                      key={par.id}
                      className="hover:bg-slate-900/60 cursor-pointer"
                      onClick={() => handleRowClick(par)}
                    >
                      <td className="px-4 py-3 text-slate-400">{par.parId}</td>
                      <td className="px-4 py-3 text-slate-100">{par.learner.name}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatDate(par.requestedDate)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {par.competencyLevel.competency.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className={getPARLevelBadgeClass(par.competencyLevel.name)}>
                          {par.competencyLevel.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={getPARStatusBadgeClass(par.status)}>
                          {getPARStatusLabel(par.status, statusLabels)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{formatDateTime(par.updatedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Modal open={modalOpen} onClose={closeModal}>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Project Assignment Request Details
              </h2>
              <p className="text-sm text-slate-400">
                Update request information and assignment details.
              </p>
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <span className="sr-only">Close modal</span>
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

          {serverError && (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-100">
              {serverError}
            </p>
          )}

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="modal-par-id" className="text-sm font-medium text-slate-300">
                  ID
                </Label>
                <Input
                  id="modal-par-id"
                  value={selectedPar?.parId ?? ""}
                  readOnly
                  className="bg-slate-900"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="modal-requested-date"
                  className="text-sm font-medium text-slate-300"
                >
                  Requested Date
                </Label>
                <Input
                  id="modal-requested-date"
                  value={selectedPar ? formatDate(selectedPar.requestedDate) : ""}
                  readOnly
                  className="bg-slate-900"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label
                  htmlFor="modal-competency"
                  className="text-sm font-medium text-slate-300"
                >
                  Competency
                </Label>
                <Input
                  id="modal-competency"
                  value={selectedPar?.competencyLevel.competency.name ?? ""}
                  readOnly
                  className="bg-slate-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modal-level" className="text-sm font-medium text-slate-300">
                  Level
                </Label>
                <Input
                  id="modal-level"
                  value={selectedPar?.competencyLevel.name ?? ""}
                  readOnly
                  className="bg-slate-900"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="modal-status" className="text-sm font-medium text-slate-300">
                  Status
                </Label>
                <Select
                  id="modal-status"
                  value={formState.status}
                  onChange={(event) => updateFormField("status", event.target.value)}
                >
                  {statusLabels.map((label, index) => (
                    <option key={index} value={index.toString()}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="modal-assigned-to"
                  className="text-sm font-medium text-slate-300"
                >
                  Assigned To
                </Label>
                <Select
                  id="modal-assigned-to"
                  value={formState.assignedTo}
                  onChange={(event) => updateFormField("assignedTo", event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} {user.roleName ? `(${user.roleName})` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {showResponseSection && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="modal-response-due"
                    className="text-sm font-medium text-slate-300"
                  >
                    Response Due
                  </Label>
                  <Input
                    id="modal-response-due"
                    value={computedResponseDueDate ? formatDate(computedResponseDueDate) : "-"}
                    readOnly
                    className="bg-slate-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="modal-response-date"
                    className="text-sm font-medium text-slate-300"
                  >
                    Response Date
                  </Label>
                  <Input
                    id="modal-response-date"
                    type="text"
                    ref={responseDateRef}
                    value={formState.responseDate}
                    placeholder="Select date"
                    onChange={(event) => updateFormField("responseDate", event.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2 border-t border-slate-800/80 pt-4">
              <Label
                htmlFor="modal-project-name"
                className="text-sm font-medium text-slate-300"
              >
                Project Name
              </Label>
              <Select
                id="modal-project-name"
                value={formState.projectName}
                onChange={(event) => updateFormField("projectName", event.target.value)}
              >
                <option value="">Select project...</option>
                {PROJECT_OPTIONS.map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2 border-t border-slate-800/80 pt-4">
              <Label
                htmlFor="modal-description"
                className="text-sm font-medium text-slate-300"
              >
                Description
              </Label>
              <Textarea
                id="modal-description"
                rows={4}
                value={formState.description}
                placeholder="Enter description..."
                onChange={(event) => updateFormField("description", event.target.value)}
              />
            </div>

            <div className="space-y-4 border-t border-slate-800/80 pt-4">
              <div className="space-y-2">
                <Label
                  htmlFor="modal-definite-answer"
                  className="text-sm font-medium text-slate-300"
                >
                  Definite Answer?
                </Label>
                <Select
                  id="modal-definite-answer"
                  value={formState.definiteAnswer}
                  onChange={(event) => updateFormField("definiteAnswer", event.target.value)}
                >
                  <option value="">Select...</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </div>

              {showFollowUpSection && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="modal-follow-date"
                      className="text-sm font-medium text-slate-300"
                    >
                      If no, Follow date (+3 days)
                    </Label>
                    <Input
                      id="modal-follow-date"
                      value={
                        computedNoAnswerFollowDate
                          ? formatDate(computedNoAnswerFollowDate)
                          : "-"
                      }
                      readOnly
                      className="bg-slate-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="modal-followup-date"
                      className="text-sm font-medium text-slate-300"
                    >
                      Follow up Date
                    </Label>
                    <Input
                      id="modal-followup-date"
                      type="text"
                      ref={followUpDateRef}
                      value={formState.followUpDate}
                      placeholder="Select date"
                      onChange={(event) => updateFormField("followUpDate", event.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-800/80 pt-4">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

