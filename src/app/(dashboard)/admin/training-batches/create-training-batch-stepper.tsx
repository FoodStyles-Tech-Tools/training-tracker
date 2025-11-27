"use client";

import { useState, useTransition, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import "flatpickr/dist/themes/dark.css";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Check, ChevronRight, ChevronLeft, X, Search } from "lucide-react";
import { createTrainingBatchAction, type TrainingBatchFormInput } from "./actions";
import type { Competency, CompetencyLevel, User } from "@/db/schema";

const trainingBatchSchema = z
  .object({
    competencyLevelId: z.string().uuid("Invalid competency level ID"),
    trainerUserId: z.string().uuid("Invalid trainer ID"),
    sessionCount: z.number().int().min(1, "Session count must be at least 1").max(6, "Session count cannot exceed 6"),
    estimatedStart: z.date().optional().nullable(),
    capacity: z.number().int().min(1, "Capacity must be at least 1"),
    learnerIds: z.array(z.string().uuid()),
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

type CompetencyWithLevels = Competency & {
  levels: CompetencyLevel[];
};

type TrainerWithCompetencies = {
  id: string;
  name: string;
  email?: string;
  competencyIds: string[];
};

interface CreateTrainingBatchStepperProps {
  competencies: CompetencyWithLevels[];
  trainers: TrainerWithCompetencies[];
}

const STEPS = [
  { id: 1, title: "Competency", description: "Select the competency and level" },
  { id: 2, title: "Trainer", description: "Choose the trainer for this batch" },
  { id: 3, title: "Sessions", description: "Set the number of sessions" },
  { id: 4, title: "Start Date", description: "Estimated start date" },
  { id: 5, title: "Capacity", description: "Set the batch capacity" },
  { id: 6, title: "Learners", description: "Select learners for this batch" },
];

export function CreateTrainingBatchStepper({
  competencies,
  trainers,
}: CreateTrainingBatchStepperProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [availableLearners, setAvailableLearners] = useState<
    Array<{ id: string; name: string; email: string; trainingRequestId: string }>
  >([]);
  const [filteredLearners, setFilteredLearners] = useState<
    Array<{ id: string; name: string; email: string; trainingRequestId: string }>
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoadingLearners, setIsLoadingLearners] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const estimatedStartRef = useRef<HTMLInputElement>(null);
  const estimatedStartFpRef = useRef<flatpickr.Instance | null>(null);
  const learnerDropdownRef = useRef<HTMLDivElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(trainingBatchSchema),
    defaultValues: {
      competencyLevelId: "",
      trainerUserId: "",
      sessionCount: 6,
      estimatedStart: null,
      capacity: 5,
      learnerIds: [],
    },
  });

  const watchedCompetencyLevelId = useWatch({
    control: form.control,
    name: "competencyLevelId",
  });

  const watchedTrainerUserId = useWatch({
    control: form.control,
    name: "trainerUserId",
  });

  const watchedCapacity = useWatch({
    control: form.control,
    name: "capacity",
  });

  const watchedLearnerIds = useWatch({
    control: form.control,
    name: "learnerIds",
  });

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
      return trainers;
    }
    return trainers.filter((trainer) =>
      trainer.competencyIds.includes(selectedCompetency.competency.id),
    );
  }, [selectedCompetency, trainers]);

  // Fetch available learners when competency level changes
  useEffect(() => {
    if (watchedCompetencyLevelId) {
      fetchAvailableLearners(watchedCompetencyLevelId);
    } else {
      setAvailableLearners([]);
      setFilteredLearners([]);
      setIsLoadingLearners(false);
    }
  }, [watchedCompetencyLevelId]);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        learnerDropdownRef.current &&
        !learnerDropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  // Track form changes
  useEffect(() => {
    const subscription = form.watch(() => {
      const values = form.getValues();
      // Check if any field has been filled (not just default values)
      const hasChanges = 
        values.competencyLevelId !== "" ||
        values.trainerUserId !== "" ||
        values.sessionCount !== 6 ||
        values.estimatedStart !== null ||
        values.capacity !== 5 ||
        (values.learnerIds && values.learnerIds.length > 0);
      setHasUnsavedChanges(hasChanges);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Warn on page refresh/close
  useEffect(() => {
    if (!hasUnsavedChanges || isSubmitting) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges, isSubmitting]);

  // Initialize flatpickr for estimated start date
  useEffect(() => {
    if (currentStep === 4 && estimatedStartRef.current) {
      const initFlatpickr = () => {
        if (!estimatedStartRef.current) return;

        if (estimatedStartRef.current.dataset.flatpickr) {
          const existingFp = estimatedStartFpRef.current;
          if (existingFp) {
            try {
              existingFp.destroy();
            } catch (error) {
              // Instance might already be destroyed
            }
          }
          delete estimatedStartRef.current.dataset.flatpickr;
        }

        try {
          const fp = flatpickr(estimatedStartRef.current as any, {
            dateFormat: "d M Y",
            theme: "dark",
            disableMobile: false,
            animate: true,
            allowInput: false,
            clickOpens: true,
            defaultDate: form.getValues("estimatedStart") || undefined,
            onChange: (selectedDates: Date[], dateStr: string, instance: flatpickr.Instance) => {
              if (selectedDates.length > 0) {
                form.setValue("estimatedStart", selectedDates[0]);
              }
            },
          } as any);
          estimatedStartRef.current.dataset.flatpickr = "true";
          estimatedStartFpRef.current = fp;
        } catch (error) {
          console.error("Error initializing flatpickr:", error);
        }
      };

      const timeoutId = setTimeout(initFlatpickr, 100);
      return () => {
        clearTimeout(timeoutId);
        const fp = estimatedStartFpRef.current;
        if (fp) {
          try {
            fp.destroy();
          } catch (error) {
            // Ignore
          }
        }
      };
    }
  }, [currentStep, form]);

  const fetchAvailableLearners = async (competencyLevelId: string) => {
    setIsLoadingLearners(true);
    try {
      const url = `/api/training-batches/available-learners?competencyLevelId=${competencyLevelId}`;
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        setAvailableLearners(data.learners || []);
        setFilteredLearners(data.learners || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Error fetching available learners:", response.status, errorData);
        setAvailableLearners([]);
        setFilteredLearners([]);
      }
    } catch (error) {
      console.error("Error fetching available learners:", error);
      setAvailableLearners([]);
      setFilteredLearners([]);
    } finally {
      setIsLoadingLearners(false);
    }
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
        setMessage({ text: `Cannot select more than ${capacity} learners. Capacity limit reached.`, tone: "error" });
        setTimeout(() => setMessage(null), 3000);
        return;
      }
      form.setValue("learnerIds", [...currentLearnerIds, learner.id]);
    }
  };

  const handleNext = async () => {
    let isValid = true;
    let errorField = "";

    // Validate current step
    if (currentStep === 1) {
      const competencyLevelId = form.getValues("competencyLevelId");
      if (!competencyLevelId) {
        isValid = false;
        errorField = "Competency";
      }
    } else if (currentStep === 2) {
      const trainerUserId = form.getValues("trainerUserId");
      if (!trainerUserId) {
        isValid = false;
        errorField = "Trainer";
      }
    } else if (currentStep === 3) {
      const sessionCount = form.getValues("sessionCount");
      if (!sessionCount || sessionCount < 1 || sessionCount > 6) {
        isValid = false;
        errorField = "Session Count";
      }
    }

    if (!isValid) {
      setMessage({ text: `Please select ${errorField} to continue.`, tone: "error" });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (hasUnsavedChanges && !isSubmitting) {
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to go back? Your changes will be lost."
      );
      if (!confirmed) return;
    }
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCancel = () => {
    if (hasUnsavedChanges && !isSubmitting) {
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to cancel? Your changes will be lost."
      );
      if (!confirmed) return;
    }
    router.push("/admin/training-batches");
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setMessage(null);
    const values = form.getValues();
    
    // Generate batch name
    let batchName = "Batch 1";
    if (values.competencyLevelId) {
      try {
        // Fetch existing batches for this competency level
        const response = await fetch(`/api/training-batches?competencyLevelId=${values.competencyLevelId}&pageSize=1000`);
        
        if (response.ok) {
          const data = await response.json();
          const existingBatches = data.batches || [];
          
          // Extract batch numbers from batch names (e.g., "Batch 1" -> 1, "Batch 2" -> 2)
          const batchNumbers = existingBatches
            .map((b: { batchName: string }) => {
              const match = b.batchName.match(/^Batch\s+(\d+)$/i);
              return match ? parseInt(match[1], 10) : null;
            })
            .filter((num: number | null): num is number => num !== null)
            .sort((a: number, b: number) => a - b);
          
          // Find the next available batch number
          let nextBatchNumber = 1;
          for (const num of batchNumbers) {
            if (num === nextBatchNumber) {
              nextBatchNumber++;
            } else {
              break;
            }
          }
          
          batchName = `Batch ${nextBatchNumber}`;
        }
      } catch (error) {
        console.error("Error generating batch name:", error);
        batchName = "Batch 1";
      }
    }

    const payload: TrainingBatchFormInput = {
      batchName,
      competencyLevelId: values.competencyLevelId,
      trainerUserId: values.trainerUserId,
      sessionCount: values.sessionCount,
      durationHrs: null,
      estimatedStart: values.estimatedStart || null,
      batchStartDate: null,
      capacity: values.capacity,
      learnerIds: values.learnerIds || [],
      sessionDates: [],
    };

    startTransition(async () => {
      try {
        const result = await createTrainingBatchAction(payload);
        if (result.success) {
          setHasUnsavedChanges(false);
          router.push(`/admin/training-batches?action=created&name=${encodeURIComponent(batchName)}`);
        } else {
          setIsSubmitting(false);
          setMessage({
            text: result.error || "Failed to create training batch",
            tone: "error",
          });
        }
      } catch (error) {
        console.error(error);
        setIsSubmitting(false);
        setMessage({
          text: error instanceof Error ? error.message : "Unable to create training batch.",
          tone: "error",
        });
      }
    });
  };

  // Get all levels from all competencies for the level dropdown
  const allLevels = useMemo(() => {
    const levels: Array<{ id: string; name: string; competencyId: string; competencyName: string }> = [];
    competencies.forEach((comp) => {
      comp.levels.forEach((level) => {
        const hasTrainingPlan = level.trainingPlanDocument && level.trainingPlanDocument.trim() !== "";
        const hasTeamKnowledge = level.teamKnowledge && level.teamKnowledge.trim() !== "";
        if (hasTrainingPlan && hasTeamKnowledge) {
          levels.push({
            id: level.id,
            name: level.name,
            competencyId: comp.id,
            competencyName: comp.name,
          });
        }
      });
    });
    return levels;
  }, [competencies]);

  const currentParticipant = (form.getValues("learnerIds") || []).length;
  const spotLeft = Math.max(0, watchedCapacity - currentParticipant);

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.tone === "success" ? "success" : "error"}>
          {message.text}
        </Alert>
      )}

      {/* Progress Stepper */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            const isLast = index === STEPS.length - 1;

            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className="relative flex items-center justify-center w-full">
                    {/* Step Circle */}
                    <div
                      className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300 ${
                        isCompleted
                          ? "bg-blue-600 border-blue-600"
                          : isActive
                            ? "bg-blue-600 border-blue-600 scale-110"
                            : "bg-slate-800 border-slate-600"
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="h-5 w-5 text-white" />
                      ) : (
                        <span
                          className={`text-sm font-semibold ${
                            isActive ? "text-white" : "text-slate-400"
                          }`}
                        >
                          {step.id}
                        </span>
                      )}
                    </div>
                    {/* Connector Line */}
                    {!isLast && (
                      <div
                        className={`absolute left-1/2 top-1/2 h-0.5 w-full transition-all duration-300 ${
                          isCompleted ? "bg-blue-600" : "bg-slate-700"
                        }`}
                        style={{ transform: "translateY(-50%)" }}
                      />
                    )}
                  </div>
                  {/* Step Title */}
                  <div className="mt-3 text-center max-w-[120px]">
                    <p
                      className={`text-xs font-medium transition-colors ${
                        isActive ? "text-blue-400" : isCompleted ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      {step.title}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Step Content */}
      <Card className="p-8 min-h-[400px]">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white mb-2">
              {STEPS[currentStep - 1].title}
            </h2>
            <p className="text-sm text-slate-400">
              {STEPS[currentStep - 1].description}
            </p>
          </div>

          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Step 1: Competency */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="competency">
                    Which competency? <span className="text-red-400">*</span>
                  </Label>
                  <Controller
                    name="competencyLevelId"
                    control={form.control}
                    render={({ field }) => (
                      <Select
                        id="competency"
                        value={field.value}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                          form.setValue("trainerUserId", "");
                          form.setValue("learnerIds", []);
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
              </div>
            )}

            {/* Step 2: Trainer */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="trainer">
                    Who will be the Trainer? <span className="text-red-400">*</span>
                  </Label>
                  <Controller
                    name="trainerUserId"
                    control={form.control}
                    render={({ field }) => (
                      <Select
                        id="trainer"
                        value={field.value}
                        onChange={field.onChange}
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
            )}

            {/* Step 3: Session Count */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="session-count">
                    How many sessions available? <span className="text-red-400">*</span>
                  </Label>
                  <Controller
                    name="sessionCount"
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        id="session-count"
                        type="number"
                        min={1}
                        max={6}
                        value={field.value || ""}
                        onChange={(e) => {
                          const value = e.target.value === "" ? "" : parseInt(e.target.value, 10);
                          if (value === "" || isNaN(value)) {
                            field.onChange(1);
                          } else if (value < 1) {
                            field.onChange(1);
                          } else if (value > 6) {
                            field.onChange(6);
                          } else {
                            field.onChange(value);
                          }
                        }}
                        onBlur={field.onBlur}
                        placeholder="Enter session count (1-6)"
                      />
                    )}
                  />
                  {form.formState.errors.sessionCount && (
                    <p className="text-xs text-red-400">
                      {form.formState.errors.sessionCount.message}
                    </p>
                  )}
                  <p className="text-xs text-slate-400">
                    Minimum: 1 session, Maximum: 6 sessions
                  </p>
                </div>
              </div>
            )}

            {/* Step 4: Estimated Start Date */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="estimated-start-date">
                    What is the Estimated Start Date?
                  </Label>
                  <Input
                    id="estimated-start-date"
                    ref={estimatedStartRef}
                    type="text"
                    placeholder="Select date"
                    readOnly
                    className="cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Step 5: Capacity */}
            {currentStep === 5 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="capacity">
                    How large is the capacity?
                  </Label>
                  <Controller
                    name="capacity"
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        type="number"
                        id="capacity"
                        min="1"
                        value={field.value || ""}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 1;
                          const currentLearnerIds = form.getValues("learnerIds") || [];
                          if (value < currentLearnerIds.length && value > 0) {
                            setMessage({
                              text: `Cannot set capacity below ${currentLearnerIds.length}. Please remove learners first.`,
                              tone: "error",
                            });
                            setTimeout(() => setMessage(null), 3000);
                            form.setValue("capacity", currentLearnerIds.length);
                          } else {
                            field.onChange(value);
                          }
                        }}
                        onBlur={field.onBlur}
                        placeholder="Enter capacity"
                      />
                    )}
                  />
                  {form.formState.errors.capacity && (
                    <p className="text-xs text-red-400">
                      {form.formState.errors.capacity.message}
                    </p>
                  )}
                  <div className="flex gap-4 text-sm text-slate-400">
                    <span>Current Participant: {currentParticipant}</span>
                    <span>Spot Left: {spotLeft}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 6: Learners */}
            {currentStep === 6 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>
                    Do you have learners to be part of this batch?
                  </Label>
                  {watchedCompetencyLevelId ? (
                    <div className="relative" ref={learnerDropdownRef} data-learner-dropdown>
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
                      {watchedLearnerIds.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2 min-h-[2.5rem]">
                          {availableLearners
                            .filter((l) => watchedLearnerIds.includes(l.id))
                            .map((learner) => (
                              <div
                                key={learner.id}
                                className="inline-flex items-center gap-2 rounded-md border border-blue-500 bg-blue-900/30 px-3 py-1.5 text-sm text-slate-100"
                              >
                                <span>{learner.name}</span>
                                <button
                                  type="button"
                                  onClick={() => handleLearnerToggle(learner)}
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
                            {isLoadingLearners ? (
                              <div className="px-3 py-2 text-sm text-slate-400">
                                Loading learners...
                              </div>
                            ) : filteredLearners.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-slate-400">
                                No learners available
                              </div>
                            ) : (
                              filteredLearners.map((learner) => {
                                const isSelected = watchedLearnerIds.includes(learner.id);
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
                      Please select a competency and level first.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {currentStep === 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isPending || isSubmitting}
              className="flex items-center gap-2"
            >
              Cancel
            </Button>
          )}
          {currentStep > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={isPending || isSubmitting}
              className="flex items-center gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}
        </div>

        {currentStep < STEPS.length ? (
          <Button
            type="button"
            onClick={handleNext}
            disabled={isPending}
            className="flex items-center gap-2"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="flex items-center gap-2"
          >
            {isPending ? "Creating..." : "Confirm"}
          </Button>
        )}
      </div>
    </div>
  );
}

