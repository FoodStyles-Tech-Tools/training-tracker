"use client";

import { useState, useEffect, useRef } from "react";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { TrainingRequest, User } from "@/db/schema";
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
  trainingBatch?: {
    id: string;
    batchName: string;
    trainer: {
      id: string;
      name: string;
    };
  } | null;
};

interface TrainingRequestModalProps {
  open: boolean;
  onClose: () => void;
  trainingRequest: TrainingRequestWithRelations;
  users: User[];
  statusLabels: string[];
  onSave: (data: Partial<TrainingRequest>) => Promise<void>;
  isPending: boolean;
  onFetch?: () => Promise<TrainingRequestWithRelations | null>;
}

export function TrainingRequestModal({
  open,
  onClose,
  trainingRequest: initialTrainingRequest,
  users,
  statusLabels,
  onSave,
  isPending,
  onFetch,
}: TrainingRequestModalProps) {
  // Refs for flatpickr instances
  const requestedDateRef = useRef<HTMLInputElement>(null);
  const responseDueRef = useRef<HTMLInputElement>(null);
  const responseDateRef = useRef<HTMLInputElement>(null);
  const expectedUnblockedDateRef = useRef<HTMLInputElement>(null);
  const noFollowUpDateRef = useRef<HTMLInputElement>(null);
  const followUpDateRef = useRef<HTMLInputElement>(null);
  
  // Refs to store flatpickr instances for date retrieval
  const requestedDateFpRef = useRef<flatpickr.Instance | null>(null);
  const responseDueFpRef = useRef<flatpickr.Instance | null>(null);
  const responseDateFpRef = useRef<flatpickr.Instance | null>(null);
  const expectedUnblockedDateFpRef = useRef<flatpickr.Instance | null>(null);
  const noFollowUpDateFpRef = useRef<flatpickr.Instance | null>(null);
  const followUpDateFpRef = useRef<flatpickr.Instance | null>(null);
  
  // State to hold the current training request (may be updated from fetch)
  const [trainingRequest, setTrainingRequest] = useState<TrainingRequestWithRelations>(initialTrainingRequest);
  
  const [formData, setFormData] = useState({
    status: initialTrainingRequest.status,
    onHoldBy: initialTrainingRequest.onHoldBy,
    onHoldReason: initialTrainingRequest.onHoldReason || "",
    dropOffReason: initialTrainingRequest.dropOffReason || "",
    isBlocked: initialTrainingRequest.isBlocked,
    blockedReason: initialTrainingRequest.blockedReason || "",
    notes: initialTrainingRequest.notes || "",
    assignedTo: initialTrainingRequest.assignedTo || "",
    definiteAnswer: initialTrainingRequest.definiteAnswer,
  });

  // Fetch fresh data when modal opens
  useEffect(() => {
    if (open && onFetch) {
      onFetch().then((freshData) => {
        if (freshData) {
          setTrainingRequest(freshData);
          setFormData({
            status: freshData.status,
            onHoldBy: freshData.onHoldBy,
            onHoldReason: freshData.onHoldReason || "",
            dropOffReason: freshData.dropOffReason || "",
            isBlocked: freshData.isBlocked,
            blockedReason: freshData.blockedReason || "",
            notes: freshData.notes || "",
            assignedTo: freshData.assignedTo || "",
            definiteAnswer: freshData.definiteAnswer,
          });
        }
      }).catch((error) => {
        console.error("Failed to fetch fresh training request data:", error);
      });
    } else if (open) {
      // If no fetch function, use the prop data
      setTrainingRequest(initialTrainingRequest);
      setFormData({
        status: initialTrainingRequest.status,
        onHoldBy: initialTrainingRequest.onHoldBy,
        onHoldReason: initialTrainingRequest.onHoldReason || "",
        dropOffReason: initialTrainingRequest.dropOffReason || "",
        isBlocked: initialTrainingRequest.isBlocked,
        blockedReason: initialTrainingRequest.blockedReason || "",
        notes: initialTrainingRequest.notes || "",
        assignedTo: initialTrainingRequest.assignedTo || "",
        definiteAnswer: initialTrainingRequest.definiteAnswer,
      });
    }
  }, [open, onFetch, initialTrainingRequest]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Get date values from flatpickr instances (returns Date objects)
    const getDateFromFp = (fpRef: React.RefObject<flatpickr.Instance | null>): Date | null => {
      if (fpRef.current && fpRef.current.selectedDates.length > 0) {
        return fpRef.current.selectedDates[0];
      }
      return null;
    };
    
    const responseDue = getDateFromFp(responseDueFpRef);
    const responseDate = getDateFromFp(responseDateFpRef);
    const expectedUnblockedDate = getDateFromFp(expectedUnblockedDateFpRef);
    const noFollowUpDate = getDateFromFp(noFollowUpDateFpRef);
    const followUpDate = getDateFromFp(followUpDateFpRef);
    
    await onSave({
      status: formData.status,
      onHoldBy: formData.onHoldBy !== null ? formData.onHoldBy : undefined,
      onHoldReason: formData.onHoldReason || null,
      dropOffReason: formData.dropOffReason || null,
      isBlocked: formData.isBlocked,
      blockedReason: formData.blockedReason || null,
      expectedUnblockedDate: expectedUnblockedDate,
      notes: formData.notes || null,
      assignedTo: formData.assignedTo || null,
      responseDue: responseDue,
      responseDate: responseDate,
      definiteAnswer: formData.definiteAnswer !== null ? formData.definiteAnswer : null,
      noFollowUpDate: noFollowUpDate,
      followUpDate: followUpDate,
    });
  };

  // Show Response Due, Assigned to, and Response date fields for: Looking for trainer (1), In Queue (2), No batch match (3)
  const showResponseFields = formData.status === 1 || formData.status === 2 || formData.status === 3;
  const showOnHoldFields = formData.status === 6;
  const showDropOffFields = formData.status === 7;
  const showDefiniteAnswerFields = formData.definiteAnswer === false;

  // Auto-calculate Response Due date when status changes
  // +1 day for "Looking for trainer" (1) and "In Queue" (2)
  // +5 days for "No batch match" (3)
  useEffect(() => {
    if (showResponseFields && responseDueFpRef.current && trainingRequest.requestedDate) {
      // Always recalculate when status changes to ensure correct days are added
      const requestedDate = new Date(trainingRequest.requestedDate);
      const responseDueDate = new Date(requestedDate);
      const daysToAdd = formData.status === 3 ? 5 : 1; // +5 days for "No batch match", +1 day for others
      responseDueDate.setDate(responseDueDate.getDate() + daysToAdd);
      
      // Set the calculated date
      responseDueFpRef.current.setDate(responseDueDate, false);
    }
  }, [showResponseFields, formData.status, trainingRequest.requestedDate]);


  // Auto-calculate follow-up date when definite answer is "no" (Requested Date + 3 days)
  useEffect(() => {
    if (formData.definiteAnswer === false && trainingRequest.requestedDate) {
      // Calculate +3 days from requested date
      const requestedDate = new Date(trainingRequest.requestedDate);
      const followDate = new Date(requestedDate);
      followDate.setDate(followDate.getDate() + 3);
      
      // Set the date when Flatpickr is ready
      if (noFollowUpDateFpRef.current) {
        noFollowUpDateFpRef.current.setDate(followDate, false);
      } else {
        // If Flatpickr isn't ready yet, set it after a short delay
        setTimeout(() => {
          if (noFollowUpDateFpRef.current) {
            noFollowUpDateFpRef.current.setDate(followDate, false);
          }
        }, 300);
      }
    }
  }, [formData.definiteAnswer, trainingRequest.requestedDate, open]);

  // Initialize flatpickr for all date inputs
  useEffect(() => {
    if (!open) return;

    const flatpickrInstances: flatpickr.Instance[] = [];

    // Initialize flatpickr after a small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      // Initialize flatpickr for each date input
      const initFlatpickr = (
        ref: React.RefObject<HTMLInputElement | null>,
        fpRef: React.RefObject<flatpickr.Instance | null>,
        initialValue: Date | null,
        readOnly = false,
      ) => {
        if (!ref.current) {
          return;
        }
        
        if (ref.current.dataset.flatpickr) {
          return;
        }

        try {
          const fp = flatpickr(ref.current as any, {
            dateFormat: "d M Y", // Format: "20 Nov 2025"
            allowInput: !readOnly,
            clickOpens: !readOnly,
            appendTo: document.body, // Append to body to avoid z-index issues
            defaultDate: initialValue || undefined,
            // Force formatting on ready
            onReady: function(selectedDates: Date[], dateStr: string, instance: flatpickr.Instance) {
              if (selectedDates.length > 0) {
                instance.setDate(selectedDates[0], false);
              }
            },
          } as any);
          ref.current.dataset.flatpickr = "true";
          flatpickrInstances.push(fp);
          fpRef.current = fp; // Store instance for date retrieval
        } catch (error) {
          console.error('Error initializing flatpickr:', error);
        }
      };

      // Get initial values as Date objects (not ISO strings to avoid timezone issues)
      // If responseDue is not set, calculate it based on status:
      // +1 day for "Looking for trainer" (1) and "In Queue" (2)
      // +5 days for "No batch match" (3)
      const initialResponseDue = trainingRequest.responseDue
        ? trainingRequest.responseDue instanceof Date 
          ? trainingRequest.responseDue 
          : new Date(trainingRequest.responseDue)
        : (trainingRequest.requestedDate
            ? (() => {
                const requestedDate = trainingRequest.requestedDate instanceof Date 
                  ? trainingRequest.requestedDate 
                  : new Date(trainingRequest.requestedDate);
                const responseDueDate = new Date(requestedDate);
                const daysToAdd = trainingRequest.status === 3 ? 5 : 1; // +5 days for "No batch match", +1 day for others
                responseDueDate.setDate(responseDueDate.getDate() + daysToAdd);
                return responseDueDate;
              })()
            : null);
      const initialResponseDate = trainingRequest.responseDate
        ? trainingRequest.responseDate instanceof Date 
          ? trainingRequest.responseDate 
          : new Date(trainingRequest.responseDate)
        : null;
      const initialExpectedUnblockedDate = trainingRequest.expectedUnblockedDate
        ? trainingRequest.expectedUnblockedDate instanceof Date 
          ? trainingRequest.expectedUnblockedDate 
          : new Date(trainingRequest.expectedUnblockedDate)
        : null;
      const initialNoFollowUpDate = trainingRequest.noFollowUpDate
        ? trainingRequest.noFollowUpDate instanceof Date 
          ? trainingRequest.noFollowUpDate 
          : new Date(trainingRequest.noFollowUpDate)
        : null;
      const initialFollowUpDate = trainingRequest.followUpDate
        ? trainingRequest.followUpDate instanceof Date 
          ? trainingRequest.followUpDate 
          : new Date(trainingRequest.followUpDate)
        : null;

      // Requested date (readonly) - always visible
      const requestedDateValue = trainingRequest.requestedDate
        ? trainingRequest.requestedDate instanceof Date 
          ? trainingRequest.requestedDate 
          : new Date(trainingRequest.requestedDate)
        : null;
      initFlatpickr(requestedDateRef, requestedDateFpRef, requestedDateValue, true);

      // Always initialize all date fields to preserve values when status changes
      // Response Due and Response Date
      initFlatpickr(responseDueRef, responseDueFpRef, initialResponseDue, true); // Read-only
      initFlatpickr(responseDateRef, responseDateFpRef, initialResponseDate, false);

      // Expected Unblocked Date
      initFlatpickr(expectedUnblockedDateRef, expectedUnblockedDateFpRef, initialExpectedUnblockedDate, false);

      // Follow up dates
      // Calculate +3 days from requested date for "If no, Follow date"
      const requestedDate = trainingRequest.requestedDate
        ? trainingRequest.requestedDate instanceof Date 
          ? trainingRequest.requestedDate 
          : new Date(trainingRequest.requestedDate)
        : null;
      
      const calculatedFollowUpDate = requestedDate ? (() => {
        const followDate = new Date(requestedDate);
        followDate.setDate(followDate.getDate() + 3);
        return followDate;
      })() : null;
      
      // Use calculated date if no existing value, otherwise use existing value
      const noFollowUpDateValue = initialNoFollowUpDate ? initialNoFollowUpDate : calculatedFollowUpDate;
      
      initFlatpickr(noFollowUpDateRef, noFollowUpDateFpRef, noFollowUpDateValue, true);
      initFlatpickr(followUpDateRef, followUpDateFpRef, initialFollowUpDate, false);
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
      [requestedDateRef, responseDueRef, responseDateRef, expectedUnblockedDateRef, noFollowUpDateRef, followUpDateRef].forEach((ref) => {
        if (ref.current) {
          delete ref.current.dataset.flatpickr;
        }
      });
      // Clear flatpickr instance refs
      requestedDateFpRef.current = null;
      responseDueFpRef.current = null;
      responseDateFpRef.current = null;
      expectedUnblockedDateFpRef.current = null;
      noFollowUpDateFpRef.current = null;
      followUpDateFpRef.current = null;
    };
  }, [
    open, 
    trainingRequest.requestedDate, 
    trainingRequest.responseDue, 
    trainingRequest.responseDate, 
    trainingRequest.expectedUnblockedDate, 
    trainingRequest.noFollowUpDate, 
    trainingRequest.followUpDate
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
          <h2 className="text-lg font-semibold text-white">Training Request Details</h2>
          <p className="text-sm text-slate-400">Update training request information</p>
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
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tr-id">TR ID</Label>
              <Input id="tr-id" type="text" value={trainingRequest.trId} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-name">Name</Label>
              <Input id="tr-name" type="text" value={trainingRequest.learner.name} readOnly />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tr-competency">Competency</Label>
              <Input
                id="tr-competency"
                type="text"
                value={trainingRequest.competencyLevel.competency.name}
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-level">Level</Label>
              <Input
                id="tr-level"
                type="text"
                value={trainingRequest.competencyLevel.name}
                readOnly
              />
            </div>
          </div>

          {trainingRequest.trainingBatch && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tr-batch">Batch</Label>
                <Input
                  id="tr-batch"
                  type="text"
                  value={trainingRequest.trainingBatch.batchName}
                  readOnly
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tr-trainer">Trainer</Label>
                <Input
                  id="tr-trainer"
                  type="text"
                  value={trainingRequest.trainingBatch.trainer.name}
                  readOnly
                />
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tr-status">Status</Label>
              <Select
                id="tr-status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: parseInt(e.target.value) })}
              >
                {statusLabels.map((status, index) => {
                  // Hide "Not Started" (status 0)
                  if (index === 0) return null;
                  
                  // When status is "Looking for trainer" (1), only show "Looking for trainer" (1) and "In Queue" (2)
                  if (formData.status === 1 && index !== 1 && index !== 2) return null;
                  
                  return (
                    <option key={index} value={index}>
                      {status}
                    </option>
                  );
                })}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-requested-date">Requested date</Label>
              <Input
                id="tr-requested-date"
                ref={requestedDateRef}
                type="text"
                readOnly
                placeholder="Select date"
                className="cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Response Fields - Show for Looking for trainer (1), In Queue (2), and No batch match (3) */}
        <div className={`space-y-4 border-t border-slate-800/80 pt-4 ${showResponseFields ? "" : "hidden"}`}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tr-response-due">Response Due</Label>
              <Input
                id="tr-response-due"
                ref={responseDueRef}
                type="text"
                readOnly
                placeholder="Auto-calculated"
                className="cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-assigned-to">Assigned to</Label>
              <Select
                id="tr-assigned-to"
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
          <div className="space-y-2">
            <Label htmlFor="tr-response-date">Response date</Label>
            <Input
              id="tr-response-date"
              ref={responseDateRef}
              type="text"
              placeholder="Select date"
              className="cursor-pointer"
            />
          </div>
        </div>

        {/* On Hold Fields */}
        {showOnHoldFields && (
          <div className="space-y-4 border-t border-slate-800/80 pt-4">
            <div className="space-y-2">
              <Label htmlFor="tr-on-hold-by">On hold by</Label>
              <Select
                id="tr-on-hold-by"
                value={formData.onHoldBy?.toString() || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    onHoldBy: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
              >
                <option value="">Select...</option>
                <option value="0">Learner</option>
                <option value="1">Trainer</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-on-hold-reason">On hold reason</Label>
              <Textarea
                id="tr-on-hold-reason"
                rows={3}
                value={formData.onHoldReason}
                onChange={(e) => setFormData({ ...formData, onHoldReason: e.target.value })}
                placeholder="Enter reason for holding..."
              />
            </div>
          </div>
        )}

        {/* Drop Off Fields */}
        {showDropOffFields && (
          <div className="space-y-4 border-t border-slate-800/80 pt-4">
            <div className="space-y-2">
              <Label htmlFor="tr-drop-off-reason">Drop-off reason</Label>
              <Textarea
                id="tr-drop-off-reason"
                rows={3}
                value={formData.dropOffReason}
                onChange={(e) => setFormData({ ...formData, dropOffReason: e.target.value })}
                placeholder="Enter reason for drop-off..."
              />
            </div>
          </div>
        )}

        {/* Blocked Fields */}
        <div className="space-y-4 border-t border-slate-800/80 pt-4">
          <div className="flex items-center gap-3">
            <Checkbox
              id="tr-blocked"
              checked={formData.isBlocked}
              onChange={(e) => setFormData({ ...formData, isBlocked: e.target.checked })}
            />
            <Label htmlFor="tr-blocked">Blocked</Label>
          </div>
          <div className={`space-y-4 pl-7 ${formData.isBlocked ? "" : "hidden"}`}>
            <div className="space-y-2">
              <Label htmlFor="tr-block-reason">Block reason</Label>
              <Textarea
                id="tr-block-reason"
                rows={3}
                value={formData.blockedReason}
                onChange={(e) => setFormData({ ...formData, blockedReason: e.target.value })}
                placeholder="Enter reason for blocking..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-expected-unblock-date">Expected unblocked date</Label>
              <Input
                id="tr-expected-unblock-date"
                ref={expectedUnblockedDateRef}
                type="text"
                placeholder="Select date"
                className="cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2 border-t border-slate-800/80 pt-4">
          <Label htmlFor="tr-notes">Notes</Label>
          <Textarea
            id="tr-notes"
            rows={4}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Enter any additional notes..."
          />
        </div>

        {/* Definite Answer Fields */}
        <div className="space-y-4 border-t border-slate-800/80 pt-4">
          <div className="space-y-2">
            <Label htmlFor="tr-definite-answer">Definite Answer?</Label>
            <Select
              id="tr-definite-answer"
              value={formData.definiteAnswer === null ? "" : formData.definiteAnswer ? "yes" : "no"}
              onChange={(e) => {
                const value = e.target.value;
                setFormData({
                  ...formData,
                  definiteAnswer: value === "" ? null : value === "yes",
                });
              }}
            >
              <option value="">Select...</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </div>
          <div className={`space-y-4 ${showDefiniteAnswerFields ? "" : "hidden"}`}>
            <div className="space-y-2">
              <Label htmlFor="tr-follow-date">If no, Follow date (+3 days from Requested date)</Label>
              <Input
                id="tr-follow-date"
                ref={noFollowUpDateRef}
                type="text"
                readOnly
                placeholder="Will auto-calculate"
                className="cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-followup-date">Follow up Date</Label>
              <Input
                id="tr-followup-date"
                ref={followUpDateRef}
                type="text"
                placeholder="Select date"
                className="cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-800/80 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

