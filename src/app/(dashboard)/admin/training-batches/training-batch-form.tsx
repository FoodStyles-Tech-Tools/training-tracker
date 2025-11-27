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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, X, Check, Info } from "lucide-react";
import {
  createTrainingBatchAction,
  updateTrainingBatchAction,
  finishBatchAction,
  type TrainingBatchFormInput,
} from "./actions";

// Format date for display
function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  
  const day = d.getDate().toString().padStart(2, "0");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

const trainingBatchSchema = z
  .object({
    batchName: z.string().min(1, "Batch name is required"),
    competencyLevelId: z.string().uuid("Invalid competency level ID"),
    trainerUserId: z.string().uuid("Invalid trainer ID"),
    sessionCount: z.number().int().min(1, "Session count must be at least 1").max(6, "Session count cannot exceed 6"),
    durationHrs: z.number().min(0).step(0.5).optional().nullable(),
    estimatedStart: z.date().optional().nullable(),
    batchStartDate: z.date().optional().nullable(),
    capacity: z.number().int().min(1, "Capacity must be at least 1"),
    learnerIds: z.array(z.string().uuid()),
    sessionDates: z.array(z.date().optional().nullable()),
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
  const [isFinishingBatch, setIsFinishingBatch] = useState(false);
  const [showFinishBatchConfirm, setShowFinishBatchConfirm] = useState(false);
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
  const [isLoadingLearners, setIsLoadingLearners] = useState(false);
  
  // Attendance assignment modal state
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [selectedSessionForAttendance, setSelectedSessionForAttendance] = useState<number | null>(null);
  const [attendanceSelections, setAttendanceSelections] = useState<Record<string, boolean>>({});
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  // Attendance data: Map<sessionId, Map<learnerId, attended>>
  const [attendanceData, setAttendanceData] = useState<Map<string, Map<string, boolean>>>(new Map());
  
  // Ref to store alert functions for use in flatpickr callbacks
  const alertFunctionsRef = useRef({ setAlertMessage, setAlertOpen });
  useEffect(() => {
    alertFunctionsRef.current = { setAlertMessage, setAlertOpen };
  }, [setAlertMessage, setAlertOpen]);

  // Refs for flatpickr instances
  const estimatedStartRef = useRef<HTMLInputElement>(null);
  const batchStartDateRef = useRef<HTMLInputElement>(null);
  const sessionDateRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const estimatedStartFpRef = useRef<flatpickr.Instance | null>(null);
  const batchStartDateFpRef = useRef<flatpickr.Instance | null>(null);
  const sessionDateFpRefs = useRef<Map<number, flatpickr.Instance | null>>(new Map());

  const isEditing = Boolean(batch);
  const isFinished = Boolean(batch?.batchFinishDate);
  
  // Check if any session has been started (has a date)
  const hasSessionStarted = useMemo(() => {
    if (!batch?.sessions) return false;
    return batch.sessions.some((session) => session.sessionDate !== null && session.sessionDate !== undefined);
  }, [batch?.sessions]);

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

  // Ensure sessionCount is always a valid number
  const sessionCount = watchedSessionCount || 6;

  const watchedLearnerIds = useWatch({
    control: form.control,
    name: "learnerIds",
  });

  // Generate batch name when competency level changes (only for new batches)
  useEffect(() => {
    if (!isEditing && watchedCompetencyLevelId) {
      generateBatchName(watchedCompetencyLevelId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCompetencyLevelId, isEditing]);

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
    const newSessionDates = Array.from({ length: sessionCount }, (_, i) =>
      i < currentSessionDates.length ? currentSessionDates[i] : null,
    );
    form.setValue("sessionDates", newSessionDates);
  }, [sessionCount, form]);

  // Fetch attendance data when editing
  useEffect(() => {
    if (isEditing && batch?.id) {
      fetch(`/api/training-batches/${batch.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.attendance) {
            const attendanceMap = new Map<string, Map<string, boolean>>();
            data.attendance.forEach((att: { sessionId: string; learnerUserId: string; attended: boolean }) => {
              if (!attendanceMap.has(att.sessionId)) {
                attendanceMap.set(att.sessionId, new Map());
              }
              attendanceMap.get(att.sessionId)!.set(att.learnerUserId, att.attended);
            });
            setAttendanceData(attendanceMap);
          }
        })
        .catch((error) => {
          console.error("Error fetching attendance:", error);
        });
    }
  }, [isEditing, batch?.id]);

  // Initialize flatpickr for estimated start and batch start date
  useEffect(() => {
    const flatpickrInstances: flatpickr.Instance[] = [];

    const initFlatpickr = (
      ref: React.RefObject<HTMLInputElement | null>,
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
        const fp = flatpickr(ref.current as any, {
          dateFormat: "d M Y",
          theme: "dark",
          disableMobile: false,
          animate: true,
          allowInput: false,
          clickOpens: !isFinished,
          disabled: isFinished,
          defaultDate: initialValue || undefined,
          onChange: (selectedDates: Date[], dateStr: string, instance: flatpickr.Instance) => {
            if (selectedDates.length > 0 && !isFinished) {
              onChange(selectedDates[0]);
            }
          },
          onReady: (selectedDates: Date[], dateStr: string, instance: flatpickr.Instance) => {
            instance.input.addEventListener("mousedown", (e) => {
              if (document.activeElement === instance.input) {
                e.preventDefault();
              }
            });
          },
        } as any);
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
          estimatedStartValue ?? null,
          (date) => form.setValue("estimatedStart", date),
        );
      }

      // Initialize batch start date picker
      const batchStartDateValue = form.getValues("batchStartDate");
      if (batchStartDateRef.current) {
        initFlatpickr(
          batchStartDateRef,
          batchStartDateFpRef,
          batchStartDateValue ?? null,
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
              const fp = flatpickr(sessionDateRef as any, {
                dateFormat: "d M Y",
                theme: "dark",
                disableMobile: false,
                animate: true,
                allowInput: false,
                clickOpens: !isFinished,
                disabled: isFinished,
                defaultDate: initialDate || undefined,
                onChange: (selectedDates: Date[], dateStr: string, instance: flatpickr.Instance) => {
                  if (selectedDates.length > 0 && !isFinished) {
                    const date = selectedDates[0];
                    const currentSessionDates = form.getValues("sessionDates") || [];
                    
                    // Validation: Check if lower session has a higher date
                    let hasError = false;
                    let errorMessage = "";
                    
                    // Check previous sessions (lower session numbers should have earlier or equal dates)
                    for (let j = 0; j < i - 1; j++) {
                      const prevDate = currentSessionDates[j];
                      if (prevDate && date < prevDate) {
                        hasError = true;
                        errorMessage = "You can't have a higher session date";
                        break;
                      }
                    }
                    
                    // Check next sessions (higher session numbers should have later or equal dates)
                    if (!hasError) {
                      for (let j = i; j < currentSessionDates.length; j++) {
                        const nextDate = currentSessionDates[j];
                        if (nextDate && date > nextDate) {
                          hasError = true;
                          errorMessage = "You can't have a higher session date";
                          break;
                        }
                      }
                    }
                    
                    if (hasError) {
                      // Show warning and revert to previous date
                      alertFunctionsRef.current.setAlertMessage(errorMessage);
                      alertFunctionsRef.current.setAlertOpen(true);
                      instance.setDate(initialDate || undefined, false);
                      return;
                    }
                    
                    const newSessionDates = [...currentSessionDates];
                    // Ensure array is long enough
                    while (newSessionDates.length < i) {
                      newSessionDates.push(null);
                    }
                    newSessionDates[i - 1] = date;
                    form.setValue("sessionDates", newSessionDates);

                    // Save to backend immediately if editing
                    if (isEditing && batch) {
                      fetch(`/api/training-batches/${batch.id}/session-date`, {
                        method: "PATCH",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          sessionNumber: i,
                          sessionDate: date.toISOString(),
                        }),
                      }).catch((error) => {
                        console.error("Error saving session date:", error);
                      });
                    }
                  }
                },
                onReady: (selectedDates: Date[], dateStr: string, instance: flatpickr.Instance) => {
                  instance.input.addEventListener("mousedown", (e) => {
                    if (document.activeElement === instance.input) {
                      e.preventDefault();
                    }
                  });
                },
              } as any);
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
  }, [sessionCount, form]);

  // Close flatpickr calendars and learner dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Check if click is outside any flatpickr calendar
      const isFlatpickrCalendar = target.closest('.flatpickr-calendar');
      const isFlatpickrInput = target.closest('input[data-flatpickr]');
      
      // Check if click is outside learner dropdown
      const isLearnerDropdown = target.closest('[data-learner-dropdown]');
      
      if (!isFlatpickrCalendar && !isFlatpickrInput) {
        // Close all flatpickr instances
        if (estimatedStartFpRef.current) {
          estimatedStartFpRef.current.close();
        }
        if (batchStartDateFpRef.current) {
          batchStartDateFpRef.current.close();
        }
        sessionDateFpRefs.current.forEach((fp) => {
          if (fp) {
            fp.close();
          }
        });
      }
      
      if (!isLearnerDropdown) {
        // Close learner dropdown
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const generateBatchName = async (competencyLevelId: string) => {
    try {
      // Fetch existing batches for this competency level
      const response = await fetch(`/api/training-batches?competencyLevelId=${competencyLevelId}&pageSize=1000`);
      
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
        
        // Set the generated batch name
        form.setValue("batchName", `Batch ${nextBatchNumber}`);
      } else {
        // If fetch fails, default to Batch 1
        form.setValue("batchName", "Batch 1");
      }
    } catch (error) {
      console.error("Error generating batch name:", error);
      // Default to Batch 1 on error
      form.setValue("batchName", "Batch 1");
    }
  };

  const fetchAvailableLearners = async (competencyLevelId: string) => {
    setIsLoadingLearners(true);
    try {
      const url = `/api/training-batches/available-learners?competencyLevelId=${competencyLevelId}${isEditing && batch ? `&batchId=${batch.id}` : ""}`;
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

  // Check if all session dates are filled
  const watchedSessionDates = useWatch({
    control: form.control,
    name: "sessionDates",
  });
  const allSessionDatesFilled = useMemo(() => {
    const sessionDates = watchedSessionDates || [];
    if (sessionDates.length !== sessionCount) return false;
    return sessionDates.every((date) => date !== null && date !== undefined);
  }, [watchedSessionDates, sessionCount]);

  // Check if all learners have attendance marked for all sessions
  const allLearnersAttendedAllSessions = useMemo(() => {
    if (!isEditing || !batch) return false;
    
    const learners = batch.learners || [];
    const sessions = batch.sessions || [];
    
    // If no learners or no sessions, return false
    if (learners.length === 0 || sessions.length === 0) return false;
    
    // Check if all session dates are filled first
    if (!allSessionDatesFilled) return false;
    
    // Check that every learner has attended every session
    for (const learner of learners) {
      for (const session of sessions) {
        const sessionId = session.id;
        const learnerId = learner.learnerUserId;
        
        // Check if this learner attended this session
        const attended = attendanceData.has(sessionId)
          ? attendanceData.get(sessionId)?.get(learnerId) ?? false
          : false;
        
        if (!attended) {
          return false; // Found a learner who hasn't attended a session
        }
      }
    }
    
    return true; // All learners attended all sessions
  }, [isEditing, batch, attendanceData, allSessionDatesFilled]);

  // Handle finish batch - show confirmation
  const handleFinishBatch = () => {
    if (!batch) return;
    setShowFinishBatchConfirm(true);
  };

  // Confirm and finish batch
  const handleConfirmFinishBatch = async () => {
    if (!batch) return;
    
    setIsFinishingBatch(true);
    setShowFinishBatchConfirm(false);
    setMessage(null);
    
    try {
      const result = await finishBatchAction(batch.id);
      if (result.success) {
        setMessage({ text: "Batch finished successfully. All learners' statuses updated to 'Sessions Complete'.", tone: "success" });
        // Scroll to top to show success message
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => {
          router.refresh();
        }, 1000);
        setTimeout(() => setMessage(null), 5000);
      } else {
        setMessage({ text: result.error || "Failed to finish batch", tone: "error" });
        // Scroll to top to show error message
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => setMessage(null), 5000);
      }
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Failed to finish batch",
        tone: "error",
      });
      // Scroll to top to show error message
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setIsFinishingBatch(false);
    }
  };

  // Get all levels from all competencies for the level dropdown
  // Only show levels that have both training plan document and team knowledge not empty
  // Exception: if editing a batch, always include the currently selected level
  const allLevels = useMemo(() => {
    const levels: Array<{ id: string; name: string; competencyId: string; competencyName: string }> = [];
    const currentLevelId = batch?.competencyLevelId;
    
    competencies.forEach((comp) => {
      comp.levels.forEach((level) => {
        // Filter: only include levels where both trainingPlanDocument and teamKnowledge are not empty
        // Exception: always include the currently selected level when editing
        const hasTrainingPlan = level.trainingPlanDocument && level.trainingPlanDocument.trim() !== "";
        const hasTeamKnowledge = level.teamKnowledge && level.teamKnowledge.trim() !== "";
        const isCurrentLevel = batch && level.id === currentLevelId;
        
        if ((hasTrainingPlan && hasTeamKnowledge) || isCurrentLevel) {
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
  }, [competencies, batch]);

  return (
    <form id={isEditing ? "training-batch-edit-form" : undefined} onSubmit={isFinished ? (e) => e.preventDefault() : form.handleSubmit(onSubmit)} className="space-y-6">
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
                placeholder="e.g. Batch 1"
                disabled={true}
                className="bg-slate-800/50 cursor-not-allowed"
                title="Batch name is automatically generated based on competency and level"
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
                    disabled={isEditing || isFinished}
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
                    disabled={isFinished || !selectedCompetency}
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
                placeholder="Enter session count"
                    disabled={isFinished || hasSessionStarted}
                    className={hasSessionStarted ? "bg-slate-800/50 cursor-not-allowed" : ""}
                  />
                )}
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
                disabled={isFinished || hasSessionStarted}
                className={hasSessionStarted ? "bg-slate-800/50 cursor-not-allowed" : ""}
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
                className={isFinished ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
                disabled={isFinished}
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
                className={isFinished ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
                disabled={isFinished}
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
                disabled={isFinished}
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
            <div className="relative" data-learner-dropdown>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search learners..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => setDropdownOpen(true)}
                  className="pr-10"
                  disabled={isFinished}
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
                        onClick={() => !isFinished && handleRemoveLearner(learner.id)}
                        className={`text-slate-400 transition ${isFinished ? "cursor-not-allowed opacity-50" : "hover:text-slate-100 cursor-pointer"}`}
                        aria-label={`Remove ${learner.name}`}
                        disabled={isFinished}
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
                        const isSelected = selectedLearners.some((s) => s.id === learner.id);
                        const isDisabled =
                          !isSelected && currentParticipant >= watchedCapacity;

                        return (
                          <div
                            key={learner.id}
                            onClick={() => {
                              if (!isDisabled && !isFinished) {
                                handleLearnerToggle(learner);
                              }
                            }}
                            className={`px-3 py-2 transition ${
                              isFinished
                                ? "opacity-50 cursor-not-allowed"
                                : isSelected
                                  ? "bg-blue-900/50 cursor-pointer"
                                : isDisabled
                                  ? "opacity-50 cursor-not-allowed"
                                    : "hover:bg-slate-800 cursor-pointer"
                            }`}
                            title={isFinished ? "Batch is finished" : isDisabled ? "Capacity limit reached" : ""}
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

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
            <thead className="bg-slate-950/70 text-slate-300">
              <tr>
                <th className="px-4 py-3 text-left font-medium border border-slate-700" style={{ width: "20%" }}>Learner</th>
                {Array.from({ length: sessionCount }, (_, i) => i + 1).map((sessionNum) => (
                  <th key={sessionNum} className="px-4 py-3 text-center font-medium border border-slate-700" style={{ width: `${80 / sessionCount}%` }}>
                    Session {sessionNum}
                  </th>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-2 border border-slate-700"></td>
                {Array.from({ length: sessionCount }, (_, i) => {
                  const sessionNum = i + 1;
                  const sessionDates = watchedSessionDates || form.getValues("sessionDates") || [];
                  const currentDate = sessionDates[sessionNum - 1] || null;
                  const previousSessionStarted = sessionNum === 1 || (sessionDates[sessionNum - 2] !== null && sessionDates[sessionNum - 2] !== undefined);
                  const isStarted = currentDate !== null && currentDate !== undefined;
                  
                  // Check if there are learners
                  const hasLearners = isEditing && batch
                    ? batch.learners.length > 0
                    : selectedLearners.length > 0;

                  const handleStartSession = async () => {
                    if (!previousSessionStarted) {
                      setAlertMessage(`Session ${sessionNum} cannot be started when Session ${sessionNum - 1} is not started`);
                      setAlertOpen(true);
                      return;
                    }

                    if (!hasLearners) {
                      setAlertMessage("Cannot start session. There are no learners assigned to this batch.");
                      setAlertOpen(true);
                      return;
                    }

                    if (!batch) {
                      setAlertMessage("Batch not found");
                      setAlertOpen(true);
                      return;
                    }

                    // Set date to today and save to backend immediately
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    try {
                      // Update session date in backend immediately
                      const response = await fetch(`/api/training-batches/${batch.id}/session-date`, {
                        method: "PATCH",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          sessionNumber: sessionNum,
                          sessionDate: today.toISOString(),
                        }),
                      });

                      if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        setAlertMessage(errorData.error || "Failed to save session date");
                        setAlertOpen(true);
                        return;
                      }

                      // Update form state
                      const currentSessionDates = form.getValues("sessionDates") || [];
                      const newSessionDates = [...currentSessionDates];
                      while (newSessionDates.length < sessionNum) {
                        newSessionDates.push(null);
                      }
                      newSessionDates[sessionNum - 1] = today;
                      form.setValue("sessionDates", newSessionDates);

                      // Update flatpickr instance if it exists
                      const fp = sessionDateFpRefs.current.get(sessionNum);
                      if (fp) {
                        fp.setDate(today, false);
                      }
                    } catch (error) {
                      setAlertMessage(error instanceof Error ? error.message : "Failed to save session date");
                      setAlertOpen(true);
                      return;
                    }

                    // Show attendance modal
                    setSelectedSessionForAttendance(sessionNum);
                    setAttendanceModalOpen(true);
                    // Initialize attendance selections - all learners default to attended
                    const learnerIds = form.getValues("learnerIds") || [];
                    const initialSelections: Record<string, boolean> = {};
                    learnerIds.forEach((id) => {
                      initialSelections[id] = true; // Default to attended
                    });
                    setAttendanceSelections(initialSelections);
                  };

                  const handleDateClick = () => {
                    const fp = sessionDateFpRefs.current.get(sessionNum);
                    if (fp) {
                      fp.open();
                    }
                  };

                  return (
                    <td key={sessionNum} className="px-4 py-2 border border-slate-700">
                      {!isStarted ? (
                        <div className="relative group w-full">
                          <Button
                            type="button"
                            onClick={handleStartSession}
                            disabled={isFinished || !previousSessionStarted || !hasLearners}
                            className="w-full rounded-md border border-blue-400 bg-white px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                          >
                            Start Session
                            {((!previousSessionStarted && sessionNum > 1) || !hasLearners) && (
                              <Info className="h-4 w-4" />
                            )}
                          </Button>
                          {!previousSessionStarted && sessionNum > 1 && (
                            <div className="absolute left-1/2 bottom-full mb-2 hidden group-hover:block z-50 transform -translate-x-1/2 pointer-events-none">
                              <div className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 shadow-xl whitespace-nowrap">
                                <div className="text-xs text-slate-200">
                                  Require session {sessionNum - 1}
                                </div>
                              </div>
                            </div>
                          )}
                          {previousSessionStarted && !hasLearners && (
                            <div className="absolute left-1/2 bottom-full mb-2 hidden group-hover:block z-50 transform -translate-x-1/2 pointer-events-none">
                              <div className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 shadow-xl whitespace-nowrap">
                                <div className="text-xs text-slate-200">
                                  There's no learner
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <Input
                          ref={(el) => {
                            if (el) {
                              sessionDateRefs.current.set(sessionNum, el);
                            }
                          }}
                          type="text"
                          value={formatDate(currentDate)}
                          readOnly
                          className={isFinished ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
                          onClick={isFinished ? undefined : handleDateClick}
                          disabled={isFinished}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Get learners: from batch.learners if editing, or selectedLearners if creating
                const learners = isEditing && batch
                  ? batch.learners.map((l) => ({ id: l.learnerUserId, name: l.learner.name, email: l.learner.email }))
                  : selectedLearners;

                if (learners.length === 0) {
                  return (
                    <tr>
                      <td colSpan={sessionCount + 1} className="px-4 py-4 text-center text-slate-400 border border-slate-700">
                        No learners assigned to this batch
                      </td>
                    </tr>
                  );
                }

                return learners.map((learner) => (
                  <tr key={learner.id}>
                    <td className="px-4 py-2 border border-slate-700">
                      <div>
                        <p className="text-sm font-medium text-slate-200">{learner.name}</p>
                        <p className="text-xs text-slate-400">{learner.email}</p>
                      </div>
                    </td>
                    {Array.from({ length: sessionCount }, (_, i) => {
                      const sessionNum = i + 1;
                      const sessionDates = watchedSessionDates || form.getValues("sessionDates") || [];
                      const currentDate = sessionDates[sessionNum - 1] || null;
                      const isStarted = currentDate !== null && currentDate !== undefined;

                      // Get attendance for this learner and session
                      const session = batch?.sessions?.find((s) => s.sessionNumber === sessionNum);
                      const sessionId = session?.id;
                      const attended = sessionId && attendanceData.has(sessionId)
                        ? attendanceData.get(sessionId)?.get(learner.id) ?? false
                        : false;

                      // Check if all previous sessions were attended (for disabling checkbox)
                      let canMarkAttendance = true;
                      if (sessionNum > 1 && !attended) {
                        for (let prevSessionNum = 1; prevSessionNum < sessionNum; prevSessionNum++) {
                          const prevSession = batch?.sessions?.find((s) => s.sessionNumber === prevSessionNum);
                          if (prevSession) {
                            const prevSessionId = prevSession.id;
                            const prevAttended = attendanceData.has(prevSessionId)
                              ? attendanceData.get(prevSessionId)?.get(learner.id) ?? false
                              : false;

                            if (!prevAttended) {
                              canMarkAttendance = false;
                              break;
                            }
                          }
                        }
                      }

                      const handleAttendanceChange = async (checked: boolean) => {
                        if (!batch || !sessionId || isFinished) return;

                        // If marking as attended, validate that all previous sessions were attended
                        if (checked && sessionNum > 1) {
                          // Check all previous sessions
                          for (let prevSessionNum = 1; prevSessionNum < sessionNum; prevSessionNum++) {
                            const prevSession = batch.sessions?.find((s) => s.sessionNumber === prevSessionNum);
                            if (prevSession) {
                              const prevSessionId = prevSession.id;
                              const prevAttended = attendanceData.has(prevSessionId)
                                ? attendanceData.get(prevSessionId)?.get(learner.id) ?? false
                                : false;

                              if (!prevAttended) {
                                setAlertMessage(
                                  `Cannot mark attendance for Session ${sessionNum}. Learner must attend Session ${prevSessionNum} first.`,
                                );
                                setAlertOpen(true);
                                return;
                              }
                            }
                          }
                        }

                        // Update local state immediately
                        const newAttendanceData = new Map(attendanceData);
                        if (!newAttendanceData.has(sessionId)) {
                          newAttendanceData.set(sessionId, new Map());
                        }
                        newAttendanceData.get(sessionId)!.set(learner.id, checked);
                        setAttendanceData(newAttendanceData);

                        // Save to server
                        try {
                          const response = await fetch(`/api/training-batches/${batch.id}/attendance`, {
                            method: "PATCH",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              sessionId,
                              attendance: [{ learnerId: learner.id, attended: checked }],
                            }),
                          });

                          if (!response.ok) {
                            // Revert on error
                            const oldAttendanceData = new Map(attendanceData);
                            setAttendanceData(oldAttendanceData);
                            const errorData = await response.json().catch(() => ({}));
                            setAlertMessage(errorData.error || "Failed to update attendance");
                            setAlertOpen(true);
                          }
                        } catch (error) {
                          // Revert on error
                          const oldAttendanceData = new Map(attendanceData);
                          setAttendanceData(oldAttendanceData);
                          setAlertMessage(error instanceof Error ? error.message : "Failed to update attendance");
                          setAlertOpen(true);
                        }
                      };

                      return (
                        <td key={sessionNum} className="px-4 py-2 text-center border border-slate-700">
                          {isStarted ? (
                            <Checkbox
                              checked={attended}
                              onChange={(e) => handleAttendanceChange(e.target.checked)}
                              disabled={isFinished || !canMarkAttendance}
                              disabled={!canMarkAttendance}
                              title={!canMarkAttendance ? `Cannot mark attendance. Previous sessions must be attended first.` : undefined}
                            />
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>

        {/* Finish Batch button - only show when editing, all session dates are filled, and all learners attended all sessions */}
        {isEditing && batch && allSessionDatesFilled && allLearnersAttendedAllSessions && (
          <div className="flex flex-col items-end gap-2">
            <Button
              type="button"
              onClick={handleFinishBatch}
              disabled={isFinishingBatch || !!batch.batchFinishDate}
              className="bg-green-600 hover:bg-green-700 !text-white text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFinishingBatch ? "Finishing..." : "Finish Batch"}
            </Button>
            {batch.batchFinishDate && (
              <p className="text-sm text-slate-400">
                Finished at: {new Date(batch.batchFinishDate).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Save button - only show when creating (not editing) */}
      {!isEditing && (
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
      )}

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

      {/* Attendance Assignment Modal */}
      {selectedSessionForAttendance && batch && (
        <Modal
          open={attendanceModalOpen}
          onClose={() => {
            setAttendanceModalOpen(false);
            setSelectedSessionForAttendance(null);
            setAttendanceSelections({});
          }}
          title={`Assign Attendance - Session ${selectedSessionForAttendance}`}
          contentClassName="max-w-2xl max-h-[80vh] overflow-hidden"
        >
          <div className="space-y-4">
            <div className="text-sm text-slate-300">
              <p>Select learners who attended Session {selectedSessionForAttendance}</p>
            </div>

            <div className="max-h-96 overflow-y-auto border border-slate-700 rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-slate-300 font-medium">Name</th>
                    <th className="px-4 py-2 text-left text-slate-300 font-medium">Email</th>
                    <th className="px-4 py-2 text-center text-slate-300 font-medium">Attended</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {selectedLearners.map((learner) => (
                    <tr key={learner.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-2 text-slate-200">{learner.name}</td>
                      <td className="px-4 py-2 text-slate-400">{learner.email}</td>
                      <td className="px-4 py-2 text-center">
                        <Checkbox
                          checked={attendanceSelections[learner.id] ?? true}
                          onChange={(e) => {
                            setAttendanceSelections((prev) => ({
                              ...prev,
                              [learner.id]: e.target.checked,
                            }));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAttendanceModalOpen(false);
                  setSelectedSessionForAttendance(null);
                  setAttendanceSelections({});
                }}
                disabled={isSavingAttendance}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  if (!batch || !selectedSessionForAttendance) return;

                  setIsSavingAttendance(true);
                  try {
                    // Get session ID from batch sessions
                    const session = batch.sessions.find((s) => s.sessionNumber === selectedSessionForAttendance);
                    if (!session) {
                      setAlertMessage("Session not found");
                      setAlertOpen(true);
                      setIsSavingAttendance(false);
                      return;
                    }

                    // Note: Date is already saved to backend when "Start Session" is clicked
                    // Just update form state and flatpickr instance here
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    const currentSessionDates = form.getValues("sessionDates") || [];
                    const newSessionDates = [...currentSessionDates];
                    while (newSessionDates.length < selectedSessionForAttendance) {
                      newSessionDates.push(null);
                    }
                    newSessionDates[selectedSessionForAttendance - 1] = today;
                    form.setValue("sessionDates", newSessionDates);

                    // Update flatpickr instance
                    const fp = sessionDateFpRefs.current.get(selectedSessionForAttendance);
                    if (fp) {
                      fp.setDate(today, false);
                    }

                    // If this is Session 1, update training request status to "In Progress" before saving attendance
                    if (selectedSessionForAttendance === 1) {
                      try {
                        const startSessionResponse = await fetch(`/api/training-batches/${batch.id}/start-session-1`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                        });

                        if (!startSessionResponse.ok) {
                          const errorData = await startSessionResponse.json().catch(() => ({}));
                          setAlertMessage(errorData.error || "Failed to start session");
                          setAlertOpen(true);
                          setIsSavingAttendance(false);
                          return;
                        }
                      } catch (error) {
                        setAlertMessage(error instanceof Error ? error.message : "Failed to start session");
                        setAlertOpen(true);
                        setIsSavingAttendance(false);
                        return;
                      }
                    }

                    // Save attendance
                    const attendanceArray = Object.entries(attendanceSelections).map(([learnerId, attended]) => ({
                      learnerId,
                      attended,
                    }));

                    const response = await fetch(`/api/training-batches/${batch.id}/attendance`, {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        sessionId: session.id,
                        attendance: attendanceArray,
                      }),
                    });

                    if (response.ok) {
                      // Update attendanceData state
                      const newAttendanceData = new Map(attendanceData);
                      if (!newAttendanceData.has(session.id)) {
                        newAttendanceData.set(session.id, new Map());
                      }
                      Object.entries(attendanceSelections).forEach(([learnerId, attended]) => {
                        newAttendanceData.get(session.id)!.set(learnerId, attended);
                      });
                      setAttendanceData(newAttendanceData);

                      setAttendanceModalOpen(false);
                      setSelectedSessionForAttendance(null);
                      setAttendanceSelections({});
                      setMessage({ text: `Session ${selectedSessionForAttendance} started and attendance saved`, tone: "success" });
                      setTimeout(() => setMessage(null), 5000);
                    } else {
                      const errorData = await response.json().catch(() => ({}));
                      setAlertMessage(errorData.error || "Failed to save attendance");
                      setAlertOpen(true);
                    }
                  } catch (error) {
                    setAlertMessage(error instanceof Error ? error.message : "Failed to save attendance");
                    setAlertOpen(true);
                  } finally {
                    setIsSavingAttendance(false);
                  }
                }}
                disabled={isSavingAttendance || selectedLearners.length === 0}
              >
                {isSavingAttendance ? "Saving..." : "Start Session & Save Attendance"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Finish Batch Confirmation Dialog */}
      <ConfirmDialog
        open={showFinishBatchConfirm}
        title="Finish Batch"
        description="Are you sure to mark this batch as completed? This will lock all data from any changes."
        confirmLabel="Yes"
        cancelLabel="Cancel"
        onConfirm={handleConfirmFinishBatch}
        onCancel={() => setShowFinishBatchConfirm(false)}
        confirmProps={{
          disabled: isFinishingBatch,
          className: "bg-green-600 hover:bg-green-700 text-white",
        }}
        cancelProps={{
          disabled: isFinishingBatch,
        }}
      />
    </form>
  );
}

