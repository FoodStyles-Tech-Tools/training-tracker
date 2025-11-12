"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition, useEffect, useRef, useMemo } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import "flatpickr/dist/themes/dark.css";

import type { TrainingBatch, Competency, User, CompetencyLevel } from "@/db/schema";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Search, X, Check } from "lucide-react";
import {
  createTrainingBatchAction,
  updateTrainingBatchAction,
  type TrainingBatchFormInput,
} from "./actions";

// Session Date Input Component
function SessionDateInput({
  sessionNum,
  sessionDateRefs,
  sessionDateFpRefs,
  form,
}: {
  sessionNum: number;
  sessionDateRefs: React.MutableRefObject<Map<number, HTMLInputElement>>;
  sessionDateFpRefs: React.MutableRefObject<Map<number, flatpickr.Instance | null>>;
  form: ReturnType<typeof useForm<FormValues>>;
}) {
  const inputRef = (el: HTMLInputElement | null) => {
    if (el) {
      sessionDateRefs.current.set(sessionNum, el);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`session-${sessionNum}-date`}>Session {sessionNum}</Label>
      <Input
        id={`session-${sessionNum}-date`}
        ref={inputRef}
        type="text"
        placeholder="Select date"
        readOnly
        className="cursor-pointer"
      />
    </div>
  );
}

const trainingBatchSchema = z
  .object({
    batchName: z.string().min(1, "Batch name is required"),
    competencyLevelId: z.string().uuid("Invalid competency level ID"),
    trainerUserId: z.string().uuid("Invalid trainer ID"),
    sessionCount: z.number().int().min(1, "Session count must be at least 1"),
    durationHrs: z.number().min(0).step(0.5).optional().nullable(),
    estimatedStart: z.date().optional().nullable(),
    batchStartDate: z.date().optional().nullable(),
    capacity: z.number().int().min(1, "Capacity must be at least 1"),
    learnerIds: z.array(z.string().uuid()).optional().default([]),
    sessionDates: z.array(z.date().optional().nullable()).optional().default([]),
  })
  .refine(
    (data) => {
      if (data.learnerIds && data.learnerIds.length > data.capacity) {
        return false;
      }
      return true;
    },
    {
      message: "Number of learners cannot exceed capacity",
      path: ["learnerIds"],
    },
  );

type FormValues = z.infer<typeof trainingBatchSchema>;

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
  sessions: Array<{
    id: string;
    sessionNumber: number;
    sessionDate: Date | null;
  }>;
  learners: Array<{
    learnerUserId: string;
    learner: {
      id: string;
      name: string;
      email: string;
    };
  }>;
};

type CompetencyWithLevels = Competency & {
  levels: CompetencyLevel[];
};

type TrainerWithCompetencies = {
  id: string;
  name: string;
  email?: string;
  competencyIds: string[];
};

interface TrainingBatchFormProps {
  batch?: TrainingBatchWithRelations;
  competencies: CompetencyWithLevels[];
  trainers: TrainerWithCompetencies[];
}

export function TrainingBatchForm({
  batch,
  competencies,
  trainers,
}: TrainingBatchFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [availableLearners, setAvailableLearners] = useState<
    Array<{ id: string; name: string; email: string; trainingRequestId: string }>
  >([]);
  const [selectedLearners, setSelectedLearners] = useState<
    Array<{ id: string; name: string; email: string; trainingRequestId: string }>
  >([]);
  const [filteredLearners, setFilteredLearners] = useState<
    Array<{ id: string; name: string; email: string; trainingRequestId: string }>
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");

  // Refs for flatpickr instances
  const estimatedStartRef = useRef<HTMLInputElement>(null);
  const batchStartDateRef = useRef<HTMLInputElement>(null);
  const sessionDateRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const estimatedStartFpRef = useRef<flatpickr.Instance | null>(null);
  const batchStartDateFpRef = useRef<flatpickr.Instance | null>(null);
  const sessionDateFpRefs = useRef<Map<number, flatpickr.Instance | null>>(new Map());

  const isEditing = Boolean(batch);

  // Initialize form with default values or existing batch data
  const defaultValues: FormValues = batch
    ? {
        batchName: batch.batchName,
        competencyLevelId: batch.competencyLevelId,
        trainerUserId: batch.trainerUserId,
        sessionCount: batch.sessionCount,
        durationHrs: batch.durationHrs ? parseFloat(batch.durationHrs) : null,
        estimatedStart: batch.estimatedStart ? new Date(batch.estimatedStart) : null,
        batchStartDate: batch.batchStartDate ? new Date(batch.batchStartDate) : null,
        capacity: batch.capacity,
        learnerIds: batch.learners.map((l) => l.learnerUserId),
        sessionDates: batch.sessions.map((s) => (s.sessionDate ? new Date(s.sessionDate) : null)),
      }
    : {
        batchName: "",
        competencyLevelId: "",
        trainerUserId: "",
        sessionCount: 6,
        durationHrs: null,
        estimatedStart: null,
        batchStartDate: null,
        capacity: 5,
        learnerIds: [],
        sessionDates: [],
      };

  const form = useForm<FormValues>({
    resolver: zodResolver(trainingBatchSchema),
    defaultValues,
  });

  const watchedCompetencyLevelId = useWatch({
    control: form.control,
    name: "competencyLevelId",
  });

  const watchedCapacity = useWatch({
    control: form.control,
    name: "capacity",
  });

  const watchedSessionCount = useWatch({
    control: form.control,
    name: "sessionCount",
  });

  const watchedLearnerIds = useWatch({
    control: form.control,
    name: "learnerIds",
  });

  // Fetch available learners when competency level changes
  useEffect(() => {
    if (watchedCompetencyLevelId) {
      fetchAvailableLearners(watchedCompetencyLevelId);
    } else {
      setAvailableLearners([]);
      setFilteredLearners([]);
    }
  }, [watchedCompetencyLevelId]);

  // Update selected learners when learnerIds change
  useEffect(() => {
    if (watchedLearnerIds) {
      const selected = availableLearners.filter((l) => watchedLearnerIds.includes(l.id));
      setSelectedLearners(selected);
    }
  }, [watchedLearnerIds, availableLearners]);

  // Filter learners based on search term
  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredLearners(availableLearners);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredLearners(
        availableLearners.filter(
          (learner) =>
            learner.name.toLowerCase().includes(term) ||
            learner.email.toLowerCase().includes(term),
        ),
      );
    }
  }, [searchTerm, availableLearners]);

  // Update session dates array when session count changes
  useEffect(() => {
    const currentSessionDates = form.getValues("sessionDates") || [];
    const newSessionDates = Array.from({ length: watchedSessionCount }, (_, i) =>
      i < currentSessionDates.length ? currentSessionDates[i] : null,
    );
    form.setValue("sessionDates", newSessionDates);
  }, [watchedSessionCount, form]);

  // Initialize flatpickr for estimated start and batch start date
  useEffect(() => {
    const flatpickrInstances: flatpickr.Instance[] = [];

    const initFlatpickr = (
      ref: React.RefObject<HTMLInputElement>,
      fpRef: React.RefObject<flatpickr.Instance | null>,
      initialValue: Date | null,
      onChange: (date: Date) => void,
    ) => {
      if (!ref.current) return;

      // Destroy existing instance if it exists
      if (ref.current.dataset.flatpickr) {
        const existingFp = fpRef.current;
        if (existingFp) {
          try {
            existingFp.destroy();
          } catch (error) {
            // Instance might already be destroyed
          }
        }
        delete ref.current.dataset.flatpickr;
      }

      try {
        const fp = flatpickr(ref.current, {
          dateFormat: "d M Y",
          theme: "dark",
          disableMobile: false,
          animate: true,
          allowInput: false,
          clickOpens: true,
          defaultDate: initialValue || undefined,
          onChange: (selectedDates) => {
            if (selectedDates.length > 0) {
              onChange(selectedDates[0]);
            }
          },
          onReady: (selectedDates, dateStr, instance) => {
            instance.input.addEventListener("mousedown", (e) => {
              if (document.activeElement === instance.input) {
                e.preventDefault();
              }
            });
          },
        });
        ref.current.dataset.flatpickr = "true";
        flatpickrInstances.push(fp);
        fpRef.current = fp;
      } catch (error) {
        console.error("Error initializing flatpickr:", error);
      }
    };

    // Use setTimeout to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      // Initialize estimated start date picker
      const estimatedStartValue = form.getValues("estimatedStart");
      if (estimatedStartRef.current) {
        initFlatpickr(
          estimatedStartRef,
          estimatedStartFpRef,
          estimatedStartValue,
          (date) => form.setValue("estimatedStart", date),
        );
      }

      // Initialize batch start date picker
      const batchStartDateValue = form.getValues("batchStartDate");
      if (batchStartDateRef.current) {
        initFlatpickr(
          batchStartDateRef,
          batchStartDateFpRef,
          batchStartDateValue,
          (date) => form.setValue("batchStartDate", date),
        );
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      flatpickrInstances.forEach((fp) => {
        try {
          fp.destroy();
        } catch (error) {
          // Instance might already be destroyed
        }
      });
    };
  }, [form]);

  // Re-initialize session date pickers when session count changes
  useEffect(() => {
    const sessionCount = form.getValues("sessionCount");
    const sessionDates = form.getValues("sessionDates") || [];

    // Clean up old instances
    sessionDateFpRefs.current.forEach((fp, index) => {
      if (index > sessionCount && fp) {
        try {
          fp.destroy();
        } catch (error) {
          // Instance might already be destroyed
        }
        sessionDateFpRefs.current.delete(index);
      }
    });

    // Initialize new session date pickers - use a longer timeout to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      const initializeSessionPickers = () => {
        let allInitialized = true;
        for (let i = 1; i <= sessionCount; i++) {
          const sessionDateRef = sessionDateRefs.current.get(i);
          if (sessionDateRef) {
            // Destroy existing instance if it exists
            if (sessionDateRef.dataset.flatpickr) {
              const existingFp = sessionDateFpRefs.current.get(i);
              if (existingFp) {
                try {
                  existingFp.destroy();
                } catch (error) {
                  // Instance might already be destroyed
                }
              }
              delete sessionDateRef.dataset.flatpickr;
            }

            const initialDate = sessionDates[i - 1] || null;
            try {
              const fp = flatpickr(sessionDateRef, {
                dateFormat: "d M Y",
                theme: "dark",
                disableMobile: false,
                animate: true,
                allowInput: false,
                clickOpens: true,
                defaultDate: initialDate || undefined,
                onChange: (selectedDates) => {
                  if (selectedDates.length > 0) {
                    const date = selectedDates[0];
                    const currentSessionDates = form.getValues("sessionDates") || [];
                    const newSessionDates = [...currentSessionDates];
                    // Ensure array is long enough
                    while (newSessionDates.length < i) {
                      newSessionDates.push(null);
                    }
                    newSessionDates[i - 1] = date;
                    form.setValue("sessionDates", newSessionDates);
                  }
                },
                onReady: (selectedDates, dateStr, instance) => {
                  instance.input.addEventListener("mousedown", (e) => {
                    if (document.activeElement === instance.input) {
                      e.preventDefault();
                    }
                  });
                },
              });
              sessionDateRef.dataset.flatpickr = "true";
              sessionDateFpRefs.current.set(i, fp);
            } catch (error) {
              console.error(`Error initializing flatpickr for session ${i}:`, error);
              allInitialized = false;
            }
          } else {
            allInitialized = false;
          }
        }
        return allInitialized;
      };

      // Try to initialize, retry if not all refs are ready
      if (!initializeSessionPickers()) {
        // Retry after a short delay if some refs weren't ready
        setTimeout(() => {
          initializeSessionPickers();
        }, 100);
      }
    }, 200);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [watchedSessionCount, form]);

  const fetchAvailableLearners = async (competencyLevelId: string) => {
    try {
      const response = await fetch(
        `/api/training-batches/available-learners?competencyLevelId=${competencyLevelId}${isEditing && batch ? `&batchId=${batch.id}` : ""}`,
      );
      if (response.ok) {
        const data = await response.json();
        setAvailableLearners(data.learners || []);
        setFilteredLearners(data.learners || []);
      } else {
        setAvailableLearners([]);
        setFilteredLearners([]);
      }
    } catch (error) {
      console.error("Error fetching available learners:", error);
      setAvailableLearners([]);
      setFilteredLearners([]);
    }
  };

  const showAlert = (message: string) => {
    setAlertMessage(message);
    setAlertOpen(true);
  };

  const closeAlert = () => {
    setAlertOpen(false);
    setAlertMessage("");
  };

  const handleLearnerToggle = (learner: { id: string; name: string; email: string; trainingRequestId: string }) => {
    const currentLearnerIds = form.getValues("learnerIds") || [];
    const capacity = form.getValues("capacity");

    if (currentLearnerIds.includes(learner.id)) {
      // Remove learner
      const newLearnerIds = currentLearnerIds.filter((id) => id !== learner.id);
      form.setValue("learnerIds", newLearnerIds);
    } else {
      // Add learner - check capacity
      if (currentLearnerIds.length >= capacity) {
        showAlert(`Cannot select more than ${capacity} learners. Capacity limit reached.`);
        return;
      }
      form.setValue("learnerIds", [...currentLearnerIds, learner.id]);
    }
  };

  const handleRemoveLearner = (learnerId: string) => {
    const currentLearnerIds = form.getValues("learnerIds") || [];
    form.setValue("learnerIds", currentLearnerIds.filter((id) => id !== learnerId));
  };

  const onSubmit = (values: FormValues) => {
    setMessage(null);

    const payload: TrainingBatchFormInput = {
      batchName: values.batchName,
      competencyLevelId: values.competencyLevelId,
      trainerUserId: values.trainerUserId,
      sessionCount: values.sessionCount,
      durationHrs: values.durationHrs || null,
      estimatedStart: values.estimatedStart || null,
      batchStartDate: values.batchStartDate || null,
      capacity: values.capacity,
      learnerIds: values.learnerIds || [],
      sessionDates: values.sessionDates || [],
    };

    startTransition(async () => {
      try {
        if (isEditing && batch) {
          const result = await updateTrainingBatchAction({
            id: batch.id,
            ...payload,
          });
          if (result.success) {
            router.push(`/admin/training-batches?action=updated&name=${encodeURIComponent(values.batchName)}`);
          } else {
            setMessage({
              text: result.error || "Failed to update training batch",
              tone: "error",
            });
          }
        } else {
          const result = await createTrainingBatchAction(payload);
          if (result.success) {
            router.push(`/admin/training-batches?action=created&name=${encodeURIComponent(values.batchName)}`);
          } else {
            setMessage({
              text: result.error || "Failed to create training batch",
              tone: "error",
            });
          }
        }
      } catch (error) {
        console.error(error);
        setMessage({
          text: error instanceof Error ? error.message : "Unable to save training batch.",
          tone: "error",
        });
      }
    });
  };

  // Get selected competency levels
  const selectedCompetency = useMemo(() => {
    if (!watchedCompetencyLevelId) return null;
    for (const comp of competencies) {
      const level = comp.levels.find((l) => l.id === watchedCompetencyLevelId);
      if (level) {
        return { competency: comp, level };
      }
    }
    return null;
  }, [watchedCompetencyLevelId, competencies]);

  // Filter trainers based on selected competency
  const availableTrainers = useMemo(() => {
    if (!selectedCompetency) {
      // If no competency is selected, show all trainers
      return trainers;
    }
    // Filter trainers to only those assigned to the selected competency
    return trainers.filter((trainer) =>
      trainer.competencyIds.includes(selectedCompetency.competency.id),
    );
  }, [selectedCompetency, trainers]);

  // Reset trainer selection if current trainer is not available for selected competency
  useEffect(() => {
    const currentTrainerId = form.getValues("trainerUserId");
    if (currentTrainerId && selectedCompetency) {
      const isTrainerAvailable = availableTrainers.some(
        (trainer) => trainer.id === currentTrainerId,
      );
      if (!isTrainerAvailable) {
        form.setValue("trainerUserId", "");
      }
    }
  }, [selectedCompetency, availableTrainers, form]);

  // Calculate current participant and spot left
  const currentParticipant = (form.getValues("learnerIds") || []).length;
  const spotLeft = Math.max(0, watchedCapacity - currentParticipant);

  // Get all levels from all competencies for the level dropdown
  const allLevels = useMemo(() => {
    const levels: Array<{ id: string; name: string; competencyId: string; competencyName: string }> = [];
    competencies.forEach((comp) => {
      comp.levels.forEach((level) => {
        levels.push({
          id: level.id,
          name: level.name,
          competencyId: comp.id,
          competencyName: comp.name,
        });
      });
    });
    return levels;
  }, [competencies]);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {message && (
        <Alert variant={message.tone === "success" ? "success" : "error"}>
          {message.text}
        </Alert>
      )}

      {/* Batch details form */}
      <Card className="space-y-6 p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left column */}
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="batch-name">Batch Name</Label>
              <Input
                id="batch-name"
                {...form.register("batchName")}
                placeholder="e.g. Batch-2025-001"
              />
              {form.formState.errors.batchName && (
                <p className="text-xs text-red-400">{form.formState.errors.batchName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="competency">Competency</Label>
              <Controller
                name="competencyLevelId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    id="competency"
                    value={field.value}
                    onChange={(e) => {
                      field.onChange(e.target.value);
                      // Reset learners and trainer when competency changes
                      form.setValue("learnerIds", []);
                      form.setValue("trainerUserId", "");
                    }}
                  >
                    <option value="">Select a competency and level</option>
                    {allLevels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.competencyName} - {level.name}
                      </option>
                    ))}
                  </Select>
                )}
              />
              {form.formState.errors.competencyLevelId && (
                <p className="text-xs text-red-400">
                  {form.formState.errors.competencyLevelId.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="trainer">Trainer</Label>
              <Controller
                name="trainerUserId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    id="trainer"
                    value={field.value}
                    onChange={(e) => {
                      field.onChange(e.target.value);
                    }}
                    disabled={!selectedCompetency}
                  >
                    <option value="">
                      {selectedCompetency
                        ? "Select a trainer"
                        : "Select a competency first"}
                    </option>
                    {availableTrainers.map((trainer) => (
                      <option key={trainer.id} value={trainer.id}>
                        {trainer.name}
                      </option>
                    ))}
                  </Select>
                )}
              />
              {form.formState.errors.trainerUserId && (
                <p className="text-xs text-red-400">
                  {form.formState.errors.trainerUserId.message}
                </p>
              )}
              {selectedCompetency && availableTrainers.length === 0 && (
                <p className="text-xs text-yellow-400">
                  No trainers assigned to this competency. Please assign trainers in the competency settings.
                </p>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="session-count">Session Count</Label>
              <Input
                id="session-count"
                type="number"
                min="1"
                {...form.register("sessionCount", { valueAsNumber: true })}
                placeholder="Enter session count"
              />
              {form.formState.errors.sessionCount && (
                <p className="text-xs text-red-400">
                  {form.formState.errors.sessionCount.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration-hrs">Duration hrs</Label>
              <Input
                id="duration-hrs"
                type="number"
                min="0"
                step="0.5"
                {...form.register("durationHrs", { valueAsNumber: true })}
                placeholder="Enter duration in hours"
              />
              {form.formState.errors.durationHrs && (
                <p className="text-xs text-red-400">
                  {form.formState.errors.durationHrs.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimated-start-date">Estimated Start</Label>
              <Input
                id="estimated-start-date"
                ref={estimatedStartRef}
                type="text"
                placeholder="Select date"
                readOnly
                className="cursor-pointer"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="batch-start-date">Batch Start Date</Label>
              <Input
                id="batch-start-date"
                ref={batchStartDateRef}
                type="text"
                placeholder="Select date"
                readOnly
                className="cursor-pointer"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Learners section */}
      <Card className="space-y-5 p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-100">Learners</h2>
          <p className="text-sm text-slate-400">
            Select learners to assign to this training batch.
          </p>
        </div>

        <div className="space-y-4">
          {/* Capacity, Current Participant, and Spot Left in one row */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[120px] space-y-2">
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                type="number"
                id="capacity"
                min="1"
                {...form.register("capacity", {
                  valueAsNumber: true,
                  onChange: (e) => {
                    const newCapacity = parseInt(e.target.value) || 0;
                    const currentLearnerIds = form.getValues("learnerIds") || [];
                    if (newCapacity < currentLearnerIds.length && newCapacity > 0) {
                      showAlert(
                        `Cannot set capacity below ${currentLearnerIds.length}. Please remove learners first.`,
                      );
                      form.setValue("capacity", currentLearnerIds.length);
                    }
                  },
                })}
              />
              {form.formState.errors.capacity && (
                <p className="text-xs text-red-400">{form.formState.errors.capacity.message}</p>
              )}
            </div>
            <div className="flex-1 min-w-[120px] space-y-2">
              <Label>Current Participant</Label>
              <p className="text-sm text-slate-100">{currentParticipant}</p>
            </div>
            <div className="flex-1 min-w-[120px] space-y-2">
              <Label>Spot Left</Label>
              <p className="text-sm text-slate-100">{spotLeft}</p>
            </div>
          </div>

          {/* Search and selection dropdown */}
          {watchedCompetencyLevelId ? (
            <div className="relative">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search learners..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => setDropdownOpen(true)}
                  className="pr-10"
                />
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>

              {/* Selected learners display */}
              {selectedLearners.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 min-h-[2.5rem]">
                  {selectedLearners.map((learner) => (
                    <div
                      key={learner.id}
                      className="inline-flex items-center gap-2 rounded-md border border-blue-500 bg-blue-900/30 px-3 py-1.5 text-sm text-slate-100"
                    >
                      <span>{learner.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveLearner(learner.id)}
                        className="text-slate-400 hover:text-slate-100 transition"
                        aria-label={`Remove ${learner.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Dropdown options */}
              {dropdownOpen && (
                <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border border-slate-700 bg-slate-900 shadow-lg">
                  <div className="py-1">
                    {filteredLearners.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-slate-400">
                        No learners available
                      </div>
                    ) : (
                      filteredLearners.map((learner) => {
                        const isSelected = selectedLearners.some((s) => s.id === learner.id);
                        const isDisabled =
                          !isSelected && currentParticipant >= watchedCapacity;

                        return (
                          <div
                            key={learner.id}
                            onClick={() => {
                              if (!isDisabled) {
                                handleLearnerToggle(learner);
                              }
                            }}
                            className={`px-3 py-2 cursor-pointer transition ${
                              isSelected
                                ? "bg-blue-900/50"
                                : isDisabled
                                  ? "opacity-50 cursor-not-allowed"
                                  : "hover:bg-slate-800"
                            }`}
                            title={isDisabled ? "Capacity limit reached" : ""}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-slate-100">{learner.name}</p>
                                <p className="text-xs text-slate-400">{learner.email}</p>
                              </div>
                              {isSelected && (
                                <Check className="h-4 w-4 text-blue-400" />
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Please select a competency and level to see available learners.
            </p>
          )}
        </div>
      </Card>

      {/* Sessions Date Section */}
      <Card className="space-y-5 p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-100">Sessions Date</h2>
          <p className="text-sm text-slate-400">Set the dates for each training session.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: watchedSessionCount }, (_, i) => i + 1).map((sessionNum) => (
            <SessionDateInput
              key={sessionNum}
              sessionNum={sessionNum}
              sessionDateRefs={sessionDateRefs}
              sessionDateFpRefs={sessionDateFpRefs}
              form={form}
            />
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link
          href="/admin/training-batches"
          className="inline-flex items-center justify-center rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-500 hover:text-blue-200"
        >
          Cancel
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Alert Modal */}
      <Modal
        open={alertOpen}
        onClose={closeAlert}
        contentClassName="max-w-md w-full mx-4"
        overlayClassName="bg-black/60 backdrop-blur-sm"
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">Alert</h3>
          <button
            type="button"
            onClick={closeAlert}
            className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            aria-label="Close alert"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-300">{alertMessage}</p>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-800/80 px-6 py-4">
          <Button onClick={closeAlert}>OK</Button>
        </div>
      </Modal>
    </form>
  );
}

