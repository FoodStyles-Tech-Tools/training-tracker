"use client";

import { useState, useEffect, useRef } from "react";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ValidationScheduleRequest, User } from "@/db/schema";

// Helper functions to convert dates to/from UK timezone for display
// Converts a date to UK timezone representation for display in flatpickr
function convertToUKTime(date: Date): Date {
  // Format the date in UK timezone
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find((p) => p.type === "year")!.value);
  const month = parseInt(parts.find((p) => p.type === "month")!.value) - 1;
  const day = parseInt(parts.find((p) => p.type === "day")!.value);
  const hour = parseInt(parts.find((p) => p.type === "hour")!.value);
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value);
  const second = parseInt(parts.find((p) => p.type === "second")!.value);
  
  // Return a date object with these components (in local timezone, but represents UK time visually)
  return new Date(year, month, day, hour, minute, second);
}

// Converts a date selected in UK timezone back to the equivalent UTC moment for storage
function convertFromUKTime(ukDate: Date): Date {
  // Get components from the date (these represent what the user selected as UK time)
  const year = ukDate.getFullYear();
  const month = ukDate.getMonth();
  const day = ukDate.getDate();
  const hour = ukDate.getHours();
  const minute = ukDate.getMinutes();
  const second = ukDate.getSeconds();
  
  // Create a date string representing this time in UK timezone
  // We'll use a method that properly interprets this as UK time
  const ukDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  
  // To convert UK time to UTC, we need to:
  // 1. Create a date object that represents this exact moment in UK time
  // 2. The trick: create a date in the local timezone, then calculate the offset
  
  // Get current time in both local and UK timezones to calculate offset
  const now = new Date();
  const localNow = now.getTime();
  
  // Get what the current time is in UK
  const ukNowStr = now.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  
  // Parse UK time and create a date object (this will be in local timezone but represents UK time)
  const ukParts = ukNowStr.split(", ");
  const [ukDatePart, ukTimePart] = ukParts;
  const [ukDay, ukMonth, ukYear] = ukDatePart.split("/");
  const [ukHour, ukMinute, ukSecond] = ukTimePart.split(":");
  const ukNowLocal = new Date(
    parseInt(ukYear),
    parseInt(ukMonth) - 1,
    parseInt(ukDay),
    parseInt(ukHour),
    parseInt(ukMinute),
    parseInt(ukSecond),
  );
  
  // Calculate offset: how many milliseconds difference between local and UK representation
  const offsetMs = localNow - ukNowLocal.getTime();
  
  // Create the selected date in local timezone (representing UK time)
  const selectedLocal = new Date(year, month, day, hour, minute, second);
  
  // Adjust by the offset to get the actual UTC time
  return new Date(selectedLocal.getTime() + offsetMs);
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

interface VSRModalProps {
  open: boolean;
  onClose: () => void;
  vsr: VSRWithRelations;
  users: User[];
  statusLabels: string[];
  onSave: (data: Partial<ValidationScheduleRequest>) => Promise<void>;
  isPending: boolean;
  currentUserId: string;
}

export function VSRModal({
  open,
  onClose,
  vsr,
  users,
  statusLabels,
  onSave,
  isPending,
  currentUserId,
}: VSRModalProps) {
  // Refs for flatpickr instances
  const requestedDateRef = useRef<HTMLInputElement>(null);
  const responseDueRef = useRef<HTMLInputElement>(null);
  const responseDateRef = useRef<HTMLInputElement>(null);
  const scheduledDatetimeRef = useRef<HTMLInputElement>(null);
  const followupDateRef = useRef<HTMLInputElement>(null);
  
  // Refs to store flatpickr instances for date retrieval
  const requestedDateFpRef = useRef<flatpickr.Instance | null>(null);
  const responseDueFpRef = useRef<flatpickr.Instance | null>(null);
  const responseDateFpRef = useRef<flatpickr.Instance | null>(null);
  const scheduledDatetimeFpRef = useRef<flatpickr.Instance | null>(null);
  const followupDateFpRef = useRef<flatpickr.Instance | null>(null);
  
  const [formData, setFormData] = useState({
    status: vsr.status,
    assignedTo: vsr.assignedTo || currentUserId || "",
    validatorOps: vsr.validatorOps || "",
    validatorTrainer: vsr.validatorTrainer || "",
    definiteAnswer: vsr.definiteAnswer === null ? "" : (vsr.definiteAnswer ? "yes" : "no"),
  });

  // Filter users by role
  const opsUsers = users.filter(
    (user) => user.role?.roleName?.toLowerCase() === "ops"
  );
  const trainerUsers = users.filter(
    (user) => user.role?.roleName?.toLowerCase() === "trainer"
  );

  // Get calendar URL based on selected validator ops
  const getCalendarUrl = (validatorOpsId: string | null): string | null => {
    if (!validatorOpsId) {
      return null;
    }
    const selectedUser = users.find((u) => u.id === validatorOpsId);
    if (selectedUser?.googleCalendarTag) {
      // Use Google Calendar Appointment Scheduling format with UK timezone
      // Note: Google Calendar Appointment Scheduling may show times based on:
      // 1. The schedule owner's timezone (set when creating the schedule)
      // 2. The viewer's Google account timezone settings
      // The ctz parameter may not always override these settings
      const timezone = encodeURIComponent("Europe/London");
      // Use ctz parameter (standard Google Calendar timezone parameter)
      // Format: ctz=Europe%2FLondon (URL encoded)
      return `https://calendar.google.com/calendar/appointments/schedules/${selectedUser.googleCalendarTag}?gv=true&ctz=${timezone}`;
    }
    return null;
  };

  const calendarUrl = getCalendarUrl(formData.validatorOps);

  useEffect(() => {
    if (open) {
      setFormData({
        status: vsr.status,
        assignedTo: vsr.assignedTo || currentUserId || "",
        validatorOps: vsr.validatorOps || "",
        validatorTrainer: vsr.validatorTrainer || "",
        definiteAnswer: vsr.definiteAnswer === null ? "" : (vsr.definiteAnswer ? "yes" : "no"),
      });
    }
  }, [open, vsr, currentUserId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Get date values from flatpickr instances
    const getDateFromFp = (fpRef: React.RefObject<flatpickr.Instance | null>): Date | null => {
      if (fpRef.current && fpRef.current.selectedDates.length > 0) {
        return fpRef.current.selectedDates[0];
      }
      return null;
    };
    
    const responseDate = getDateFromFp(responseDateFpRef);
    // Save scheduled date as-is (no timezone conversion)
    const scheduledDate = getDateFromFp(scheduledDatetimeFpRef);
    const followUpDate = getDateFromFp(followupDateFpRef);
    
    // Calculate response due date if status is 0, 1, or 2
    let responseDue: Date | null = null;
    if ((formData.status === 0 || formData.status === 1 || formData.status === 2) && vsr.requestedDate) {
      const requestedDate = vsr.requestedDate instanceof Date 
        ? vsr.requestedDate 
        : new Date(vsr.requestedDate);
      responseDue = new Date(requestedDate);
      responseDue.setDate(responseDue.getDate() + 1);
    } else if (vsr.responseDue) {
      responseDue = vsr.responseDue instanceof Date ? vsr.responseDue : new Date(vsr.responseDue);
    }
    
    // Calculate noFollowUpDate if definiteAnswer is "no"
    let noFollowUpDate: Date | null = null;
    if (formData.definiteAnswer === "no" && vsr.requestedDate) {
      const requestedDate = vsr.requestedDate instanceof Date 
        ? vsr.requestedDate 
        : new Date(vsr.requestedDate);
      noFollowUpDate = new Date(requestedDate);
      noFollowUpDate.setDate(noFollowUpDate.getDate() + 3);
    }
    
    await onSave({
      status: formData.status,
      assignedTo: formData.assignedTo || null,
      validatorOps: formData.validatorOps || null,
      validatorTrainer: formData.validatorTrainer || null,
      scheduledDate: scheduledDate,
      responseDue: responseDue,
      responseDate: responseDate,
      definiteAnswer: formData.definiteAnswer === "" ? null : formData.definiteAnswer === "yes",
      noFollowUpDate: noFollowUpDate,
      followUpDate: followUpDate,
    });
  };

  const handleSetStatus = (status: number) => {
    setFormData({ ...formData, status });
  };

  const handlePassFail = async (status: number) => {
    // Get date values from flatpickr instances
    const getDateFromFp = (fpRef: React.RefObject<flatpickr.Instance | null>): Date | null => {
      if (fpRef.current && fpRef.current.selectedDates.length > 0) {
        return fpRef.current.selectedDates[0];
      }
      return null;
    };
    
    const responseDate = getDateFromFp(responseDateFpRef);
    // Save scheduled date as-is (no timezone conversion)
    const scheduledDate = getDateFromFp(scheduledDatetimeFpRef);
    const followUpDate = getDateFromFp(followupDateFpRef);
    
    // Calculate response due date if status is 0, 1, or 2
    let responseDue: Date | null = null;
    if ((formData.status === 0 || formData.status === 1 || formData.status === 2) && vsr.requestedDate) {
      const requestedDate = vsr.requestedDate instanceof Date 
        ? vsr.requestedDate 
        : new Date(vsr.requestedDate);
      responseDue = new Date(requestedDate);
      responseDue.setDate(responseDue.getDate() + 1);
    } else if (vsr.responseDue) {
      responseDue = vsr.responseDue instanceof Date ? vsr.responseDue : new Date(vsr.responseDue);
    }
    
    // Calculate noFollowUpDate if definiteAnswer is "no"
    let noFollowUpDate: Date | null = null;
    if (formData.definiteAnswer === "no" && vsr.requestedDate) {
      const requestedDate = vsr.requestedDate instanceof Date 
        ? vsr.requestedDate 
        : new Date(vsr.requestedDate);
      noFollowUpDate = new Date(requestedDate);
      noFollowUpDate.setDate(noFollowUpDate.getDate() + 3);
    }
    
    // Save with the new status (Pass = 4, Fail = 3)
    await onSave({
      status: status,
      assignedTo: formData.assignedTo || null,
      validatorOps: formData.validatorOps || null,
      validatorTrainer: formData.validatorTrainer || null,
      scheduledDate: scheduledDate,
      responseDue: responseDue,
      responseDate: responseDate,
      definiteAnswer: formData.definiteAnswer === "" ? null : formData.definiteAnswer === "yes",
      noFollowUpDate: noFollowUpDate,
      followUpDate: followUpDate,
    });
  };

  const showResponseFields = formData.status === 0 || formData.status === 1 || formData.status === 2;
  const showScheduleSection = formData.status === 0 || formData.status === 1 || formData.status === 2;
  const showCalendarSection = formData.status === 0 || formData.status === 1 || formData.status === 2;
  const showDefiniteAnswerFields = formData.definiteAnswer === "no";

  // Auto-calculate Response Due date (+1 day from requested date) when status is 0, 1, or 2
  useEffect(() => {
    if (showResponseFields && responseDueFpRef.current && vsr.requestedDate) {
      // Check if Response Due is already set
      const currentResponseDue = responseDueFpRef.current.selectedDates.length;
      if (!currentResponseDue) {
        // Calculate +1 day from requested date
        const requestedDate = new Date(vsr.requestedDate);
        const responseDueDate = new Date(requestedDate);
        responseDueDate.setDate(responseDueDate.getDate() + 1);
        
        // Set the calculated date
        responseDueFpRef.current.setDate(responseDueDate, false);
      }
    }
  }, [showResponseFields, vsr.requestedDate]);

  // Auto-calculate Follow date (+3 days from requested date) when definiteAnswer is "no"
  useEffect(() => {
    if (showDefiniteAnswerFields && followupDateFpRef.current && vsr.requestedDate) {
      const requestedDate = new Date(vsr.requestedDate);
      const followDate = new Date(requestedDate);
      followDate.setDate(followDate.getDate() + 3);
      
      // Only set if not already set
      if (followupDateFpRef.current.selectedDates.length === 0) {
        followupDateFpRef.current.setDate(followDate, false);
      }
    }
  }, [showDefiniteAnswerFields, vsr.requestedDate]);

  // Initialize flatpickr for all date inputs
  useEffect(() => {
    if (!open) return;

    const flatpickrInstances: flatpickr.Instance[] = [];

    // Initialize flatpickr after a small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      // Initialize flatpickr for each date input
      const initFlatpickr = (
        ref: React.RefObject<HTMLInputElement>,
        fpRef: React.RefObject<flatpickr.Instance | null>,
        initialValue: Date | null,
        readOnly = false,
        enableTime = false,
      ) => {
        if (!ref.current) {
          return;
        }
        
        // Destroy existing instance if it exists
        if (fpRef.current) {
          try {
            fpRef.current.destroy();
          } catch (e) {
            // Instance might already be destroyed
          }
          fpRef.current = null;
        }
        
        // Clear dataset marker if it exists
        if (ref.current.dataset.flatpickr) {
          delete ref.current.dataset.flatpickr;
        }

        try {
          const fp = flatpickr(ref.current, {
            dateFormat: enableTime ? "d M Y h:i K" : "d M Y",
            enableTime: enableTime,
            time_24hr: false,
            allowInput: !readOnly,
            clickOpens: !readOnly,
            appendTo: document.body, // Append to body to avoid z-index issues
            defaultDate: initialValue || undefined,
            // Force formatting on ready
            onReady: function(selectedDates, dateStr, instance) {
              if (selectedDates.length > 0) {
                instance.setDate(selectedDates[0], false);
              }
            },
          });
          ref.current.dataset.flatpickr = "true";
          flatpickrInstances.push(fp);
          fpRef.current = fp; // Store instance for date retrieval
        } catch (error) {
          console.error('Error initializing flatpickr:', error);
        }
      };

      // Get initial values as Date objects
      const initialRequestedDate = vsr.requestedDate
        ? vsr.requestedDate instanceof Date 
          ? vsr.requestedDate 
          : new Date(vsr.requestedDate)
        : null;
      
      // If responseDue is not set, calculate it as requested date + 1 day
      const initialResponseDue = vsr.responseDue
        ? vsr.responseDue instanceof Date 
          ? vsr.responseDue 
          : new Date(vsr.responseDue)
        : (vsr.requestedDate
            ? (() => {
                const requestedDate = vsr.requestedDate instanceof Date 
                  ? vsr.requestedDate 
                  : new Date(vsr.requestedDate);
                const responseDueDate = new Date(requestedDate);
                responseDueDate.setDate(responseDueDate.getDate() + 1);
                return responseDueDate;
              })()
            : null);
      
      const initialResponseDate = vsr.responseDate
        ? vsr.responseDate instanceof Date 
          ? vsr.responseDate 
          : new Date(vsr.responseDate)
        : null;

      const initialScheduledDate = vsr.scheduledDate
        ? vsr.scheduledDate instanceof Date 
          ? vsr.scheduledDate 
          : new Date(vsr.scheduledDate)
        : null;

      const initialFollowUpDate = vsr.followUpDate
        ? vsr.followUpDate instanceof Date 
          ? vsr.followUpDate 
          : new Date(vsr.followUpDate)
        : null;

      // Requested date (readonly) - always visible
      initFlatpickr(requestedDateRef, requestedDateFpRef, initialRequestedDate, true);

      // Response Due and Response Date (only if status is 0 or 1)
      if (showResponseFields) {
        initFlatpickr(responseDueRef, responseDueFpRef, initialResponseDue, true); // Read-only
        initFlatpickr(responseDateRef, responseDateFpRef, initialResponseDate, false);
      }

      // Scheduled Date Time (with time) - save as-is (only if status is 0, 1, or 2)
      if (showScheduleSection) {
        initFlatpickr(scheduledDatetimeRef, scheduledDatetimeFpRef, initialScheduledDate, false, true);
      }

      // Follow up Date
      initFlatpickr(followupDateRef, followupDateFpRef, initialFollowUpDate, false);
    }, 200);

    // Cleanup function
    return () => {
      clearTimeout(timeoutId);
      flatpickrInstances.forEach((fp) => {
        try {
          fp.destroy();
        } catch (e) {
          // Ignore errors during cleanup
        }
      });
      // Remove flatpickr markers and clear instance refs
      [requestedDateRef, responseDueRef, responseDateRef, scheduledDatetimeRef, followupDateRef].forEach((ref) => {
        if (ref.current) {
          delete ref.current.dataset.flatpickr;
        }
      });
      // Clear flatpickr instance refs
      requestedDateFpRef.current = null;
      responseDueFpRef.current = null;
      responseDateFpRef.current = null;
      scheduledDatetimeFpRef.current = null;
      followupDateFpRef.current = null;
    };
  }, [
    open, 
    vsr.requestedDate, 
    vsr.responseDue, 
    vsr.responseDate,
    vsr.scheduledDate,
    vsr.followUpDate,
    formData.status,
    showResponseFields,
    showScheduleSection,
  ]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      contentClassName="max-w-5xl max-h-[90vh] overflow-y-auto"
      overlayClassName="bg-black/60 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Validation Schedule Request</h2>
          <p className="text-sm text-slate-400">Manage validation schedule request details</p>
        </div>
        <button
          type="button"
          onClick={onClose}
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

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
          {/* Row 1: VSR ID | Requested Date */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vsr-id">VSR ID</Label>
              <Input id="vsr-id" type="text" value={vsr.vsrId} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vsr-requested-date">Requested Date</Label>
              <Input
                id="vsr-requested-date"
                ref={requestedDateRef}
                type="text"
                readOnly
                placeholder="Select date"
                className="cursor-pointer"
              />
            </div>
          </div>
        
          {/* Row 2: Competency | Level */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vsr-competency">Competency</Label>
              <Input
                id="vsr-competency"
                type="text"
                value={vsr.competencyLevel.competency.name}
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vsr-level">Level</Label>
              <Input
                id="vsr-level"
                type="text"
                value={vsr.competencyLevel.name}
                readOnly
              />
            </div>
          </div>
        
          {/* Row 3: Status | Assigned to */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vsr-status">Status</Label>
              <Select
                id="vsr-status"
                value={formData.status}
                onChange={(e) => {
                  const newStatus = parseInt(e.target.value);
                  setFormData({ ...formData, status: newStatus });
                }}
              >
                {statusLabels.map((status, index) => (
                  <option key={index} value={index}>
                    {status}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vsr-assigned-to">Assigned to</Label>
              <Select
                id="vsr-assigned-to"
                value={formData.assignedTo}
                onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
              >
                <option value="">Select...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        
          {/* Row 4: Response Due | Response Date (conditional based on status) */}
          {showResponseFields && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vsr-response-due">Response Due</Label>
                <Input
                  id="vsr-response-due"
                  ref={responseDueRef}
                  type="text"
                  readOnly
                  placeholder="Auto-calculated"
                  className="cursor-not-allowed"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vsr-response-date">Response Date</Label>
                <Input
                  id="vsr-response-date"
                  ref={responseDateRef}
                  type="text"
                  placeholder="Select date"
                  className="cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Schedule Section (shown for Pending Validation, Pending Re-validation, or Validation Scheduled) */}
          {showScheduleSection && (
            <div className="space-y-4 border-t border-slate-800/80 pt-4">
              <h4 className="text-sm font-semibold text-white">Schedule</h4>
              
              {/* Row 1: Validator Ops | Validator Trainer */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vsr-validator-ops">Validator Ops</Label>
                  <Select
                    id="vsr-validator-ops"
                    value={formData.validatorOps}
                    onChange={(e) => setFormData({ ...formData, validatorOps: e.target.value })}
                  >
                    <option value="">Select Validator Ops...</option>
                    {opsUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vsr-validator-trainer">Validator Trainer</Label>
                  <Select
                    id="vsr-validator-trainer"
                    value={formData.validatorTrainer}
                    onChange={(e) => setFormData({ ...formData, validatorTrainer: e.target.value })}
                  >
                    <option value="">Select Validator Trainer...</option>
                    {trainerUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              
              {/* Row 2: Scheduled Date Time */}
              <div className="space-y-2">
                <Label htmlFor="vsr-scheduled-datetime">Scheduled Date Time (UK Time)</Label>
                <Input
                  id="vsr-scheduled-datetime"
                  ref={scheduledDatetimeRef}
                  type="text"
                  placeholder="Select date and time"
                  className="cursor-pointer"
                />
              </div>
                              
              {/* Google Calendar (shown for Pending Validation, Pending Re-validation, or Validation Scheduled) */}
              {showCalendarSection && calendarUrl && (
                <div className="space-y-2">
                  <Label>Calendar</Label>
                  <iframe
                    key={calendarUrl}
                    src={calendarUrl}
                    style={{ border: 0 }}
                    width="100%"
                    height="600"
                    frameBorder="0"
                    className="rounded-md"
                  />
                </div>
              )}
            </div>
          )}

          {/* Definite Answer Fields */}
          <div className="space-y-4 border-t border-slate-800/80 pt-4">
            <div className="space-y-2">
              <Label htmlFor="vsr-definite-answer">Definite Answer?</Label>
              <Select
                id="vsr-definite-answer"
                value={formData.definiteAnswer}
                onChange={(e) => setFormData({ ...formData, definiteAnswer: e.target.value })}
              >
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </div>
            {showDefiniteAnswerFields && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="vsr-follow-date">If no, Follow date (+3 days)</Label>
                  <Input
                    id="vsr-follow-date"
                    type="text"
                    readOnly
                    value={vsr.requestedDate ? (() => {
                      const requestedDate = vsr.requestedDate instanceof Date 
                        ? vsr.requestedDate 
                        : new Date(vsr.requestedDate);
                      const followDate = new Date(requestedDate);
                      followDate.setDate(followDate.getDate() + 3);
                      const day = followDate.getDate().toString().padStart(2, "0");
                      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                      const month = monthNames[followDate.getMonth()];
                      const year = followDate.getFullYear();
                      return `${day} ${month} ${year}`;
                    })() : ""}
                    className="cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vsr-followup-date">Follow up Date</Label>
                  <Input
                    id="vsr-followup-date"
                    ref={followupDateRef}
                    type="text"
                    placeholder="Select date"
                    className="cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-800/80 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => handlePassFail(3)}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            disabled={isPending}
          >
            Fail
          </Button>
          <Button
            type="button"
            onClick={() => handlePassFail(4)}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            disabled={isPending}
          >
            Pass
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

