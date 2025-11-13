"use client";

import { useState, useEffect, useRef } from "react";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QuillEditor } from "@/components/ui/quill-editor";
import type { ValidationProjectApproval, User } from "@/db/schema";

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

interface VPAModalProps {
  open: boolean;
  onClose: () => void;
  vpa: VPAWithRelations;
  users: User[];
  statusLabels: string[];
  onSave: (data: Partial<ValidationProjectApproval>) => Promise<void>;
  isPending: boolean;
  onFetch?: () => Promise<VPAWithRelations | null>;
}

export function VPAModal({
  open,
  onClose,
  vpa: initialVPA,
  users,
  statusLabels,
  onSave,
  isPending,
  onFetch,
}: VPAModalProps) {
  // Refs for flatpickr instances
  const submittedDateRef = useRef<HTMLInputElement>(null);
  const responseDueRef = useRef<HTMLInputElement>(null);
  const responseDateRef = useRef<HTMLInputElement>(null);
  
  // Refs to store flatpickr instances for date retrieval
  const submittedDateFpRef = useRef<flatpickr.Instance | null>(null);
  const responseDueFpRef = useRef<flatpickr.Instance | null>(null);
  const responseDateFpRef = useRef<flatpickr.Instance | null>(null);
  
  // State to hold the current VPA (may be updated from fetch)
  const [vpa, setVPA] = useState<VPAWithRelations>(initialVPA);
  
  const [formData, setFormData] = useState({
    status: initialVPA.status,
    assignedTo: initialVPA.assignedTo || "",
    projectDetails: initialVPA.projectDetails || "",
    rejectionReason: initialVPA.rejectionReason || "",
  });
  
  const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);

  // Fetch fresh data when modal opens
  useEffect(() => {
    if (open && onFetch) {
      onFetch().then((freshData) => {
        if (freshData) {
          setVPA(freshData);
          setFormData({
            status: freshData.status,
            assignedTo: freshData.assignedTo || "",
            projectDetails: freshData.projectDetails || "",
            rejectionReason: freshData.rejectionReason || "",
          });
          setRejectionReason("");
          setIsRejectionModalOpen(false);
          setIsApproveConfirmOpen(false);
        }
      }).catch((error) => {
        console.error("Failed to fetch fresh VPA data:", error);
      });
    } else if (open) {
      // If no fetch function, use the prop data
      setVPA(initialVPA);
      setFormData({
        status: initialVPA.status,
        assignedTo: initialVPA.assignedTo || "",
        projectDetails: initialVPA.projectDetails || "",
        rejectionReason: initialVPA.rejectionReason || "",
      });
      setRejectionReason("");
      setIsRejectionModalOpen(false);
      setIsApproveConfirmOpen(false);
    }
  }, [open, onFetch, initialVPA]);

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
    
    await onSave({
      status: formData.status,
      assignedTo: formData.assignedTo || null,
      responseDate: responseDate,
      projectDetails: formData.projectDetails || null,
      rejectionReason: formData.rejectionReason || null,
    });
  };

  const handleApprove = () => {
    setIsApproveConfirmOpen(true);
  };

  const handleConfirmApprove = async () => {
    setIsApproveConfirmOpen(false);
    
    // Set today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to midnight to avoid timezone issues

    // Update form data with approved status
    setFormData({ ...formData, status: 1 }); // Status 1 = Approved

    // Update flatpickr instance to show response date immediately
    if (responseDateFpRef.current) {
      responseDateFpRef.current.setDate(today, false);
    }

    // Immediately save the approval with status and responseDate
    await onSave({
      status: 1, // Approved
      responseDate: today,
    });
  };

  const handleCancelApprove = () => {
    setIsApproveConfirmOpen(false);
  };

  const handleReject = () => {
    setIsRejectionModalOpen(true);
  };

  const handleConfirmRejection = async () => {
    if (!rejectionReason.trim()) {
      return; // Don't proceed if rejection reason is empty
    }

    // Set today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to midnight to avoid timezone issues

    // Update form data with rejection status and rejection reason
    setFormData({ ...formData, status: 2, rejectionReason: rejectionReason.trim() }); // Status 2 = Rejected

    // Close rejection modal
    setIsRejectionModalOpen(false);

    // Save the rejection with status, responseDate, and rejectionReason
    await onSave({
      status: 2, // Rejected
      responseDate: today,
      rejectionReason: rejectionReason.trim(),
    });
  };

  const handleCancelRejection = () => {
    setIsRejectionModalOpen(false);
    setRejectionReason("");
  };

  const showResponseFields = formData.status === 0; // Show only when status is 0
  const showRejectionReason = formData.status === 2; // Show when status is 2 (Rejected)

  // Auto-calculate Response Due date (+1 day from requested date) when status is 0
  useEffect(() => {
    if (showResponseFields && responseDueFpRef.current && vpa.requestedDate) {
      // Check if Response Due is already set
      const currentResponseDue = responseDueFpRef.current.selectedDates.length;
      if (!currentResponseDue) {
        // Calculate +1 day from requested date
        const requestedDate = new Date(vpa.requestedDate);
        const responseDueDate = new Date(requestedDate);
        responseDueDate.setDate(responseDueDate.getDate() + 1);
        
        // Set the calculated date
        responseDueFpRef.current.setDate(responseDueDate, false);
      }
    }
  }, [showResponseFields, vpa.requestedDate]);


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

      // Get initial values as Date objects
      const initialSubmittedDate = vpa.requestedDate
        ? vpa.requestedDate instanceof Date 
          ? vpa.requestedDate 
          : new Date(vpa.requestedDate)
        : null;
      
      // If responseDue is not set, calculate it as requested date + 1 day
      const initialResponseDue = vpa.responseDue
        ? vpa.responseDue instanceof Date 
          ? vpa.responseDue 
          : new Date(vpa.responseDue)
        : (vpa.requestedDate
            ? (() => {
                const requestedDate = vpa.requestedDate instanceof Date 
                  ? vpa.requestedDate 
                  : new Date(vpa.requestedDate);
                const responseDueDate = new Date(requestedDate);
                responseDueDate.setDate(responseDueDate.getDate() + 1);
                return responseDueDate;
              })()
            : null);
      
      const initialResponseDate = vpa.responseDate
        ? vpa.responseDate instanceof Date 
          ? vpa.responseDate 
          : new Date(vpa.responseDate)
        : null;

      // Submitted date (readonly) - always visible
      initFlatpickr(submittedDateRef, submittedDateFpRef, initialSubmittedDate, true);

      // Response Due and Response Date
      initFlatpickr(responseDueRef, responseDueFpRef, initialResponseDue, true); // Read-only
      initFlatpickr(responseDateRef, responseDateFpRef, initialResponseDate, false);
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
      [submittedDateRef, responseDueRef, responseDateRef].forEach((ref) => {
        if (ref.current) {
          delete ref.current.dataset.flatpickr;
        }
      });
      // Clear flatpickr instance refs
      submittedDateFpRef.current = null;
      responseDueFpRef.current = null;
      responseDateFpRef.current = null;
    };
  }, [
    open, 
    vpa.requestedDate, 
    vpa.responseDue, 
    vpa.responseDate
  ]);

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      contentClassName="max-w-5xl max-h-[90vh] overflow-y-auto"
      overlayClassName="bg-black/60 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Validation Project Approval</h2>
          <p className="text-sm text-slate-400">Manage validation project approval details</p>
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
          {/* Row 1: VPA ID | Submitted Date */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vpa-id">VPA ID</Label>
              <Input id="vpa-id" type="text" value={vpa.vpaId} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vpa-submitted-date">Submitted Date</Label>
              <Input
                id="vpa-submitted-date"
                ref={submittedDateRef}
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
              <Label htmlFor="vpa-competency">Competency</Label>
              <Input
                id="vpa-competency"
                type="text"
                value={vpa.competencyLevel.competency.name}
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vpa-level">Level</Label>
              <Input
                id="vpa-level"
                type="text"
                value={vpa.competencyLevel.name}
                readOnly
              />
            </div>
          </div>
        
          {/* Row 3: Status | Assigned to */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vpa-status">Status</Label>
              <Select
                id="vpa-status"
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
              <Label htmlFor="vpa-assigned-to">Assigned to</Label>
              <Select
                id="vpa-assigned-to"
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
          <div className={`grid gap-4 md:grid-cols-2 ${showResponseFields ? "" : "hidden"}`}>
            <div className="space-y-2">
              <Label htmlFor="vpa-response-due">Response Due</Label>
              <Input
                id="vpa-response-due"
                ref={responseDueRef}
                type="text"
                readOnly
                placeholder="Auto-calculated"
                className="cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vpa-response-date">Response Date</Label>
              <Input
                id="vpa-response-date"
                ref={responseDateRef}
                type="text"
                placeholder="Select date"
                className="cursor-pointer"
              />
            </div>
          </div>

          {/* Project Details */}
          <div className="space-y-2 border-t border-slate-800/80 pt-4">
            <Label htmlFor="vpa-project-details">Project Details</Label>
            <QuillEditor
              key={`vpa-editor-${vpa.id}-${open}`}
              id="vpa-project-details"
              value={formData.projectDetails}
              onChange={(value) => setFormData({ ...formData, projectDetails: value })}
              placeholder="Enter project details..."
              className="min-h-[200px]"
            />
          </div>

          {/* Rejection Reason - shown when status is Rejected */}
          {showRejectionReason && (
            <div className="space-y-2 border-t border-slate-800/80 pt-4">
              <Label htmlFor="vpa-rejection-reason">Rejection Reason</Label>
              <Textarea
                id="vpa-rejection-reason"
                rows={4}
                value={formData.rejectionReason}
                onChange={(e) => setFormData({ ...formData, rejectionReason: e.target.value })}
                placeholder="Enter the reason for rejecting this validation project..."
              />
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-800/80 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleReject}
            className="force-white-text rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            disabled={isPending}
          >
            Reject
          </Button>
          <Button
            type="button"
            onClick={handleApprove}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            disabled={isPending}
          >
            Approve
          </Button>
          <Button type="submit" disabled={isPending} className="force-white-text">
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Modal>

    {/* Rejection Reason Modal */}
    <Modal
      open={isRejectionModalOpen}
      onClose={handleCancelRejection}
      contentClassName="max-w-2xl"
      overlayClassName="bg-black/60 backdrop-blur-sm z-[70]"
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Rejection Reason</h2>
          <p className="text-sm text-slate-400">Please provide a reason for rejecting this validation project</p>
        </div>
        <button
          type="button"
          onClick={handleCancelRejection}
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
      <div className="p-6">
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirmRejection();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="rejection-reason-text">Rejection Reason</Label>
            <Textarea
              id="rejection-reason-text"
              rows={6}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter the reason for rejecting this validation project..."
              required
            />
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-slate-800/80 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelRejection}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="force-white-text rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              disabled={isPending || !rejectionReason.trim()}
            >
              {isPending ? "Processing..." : "Confirm Rejection"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>

    {/* Approve Confirmation Modal */}
    <Modal
      open={isApproveConfirmOpen}
      onClose={handleCancelApprove}
      contentClassName="max-w-md"
      overlayClassName="bg-black/60 backdrop-blur-sm z-[70]"
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-6 py-4">
        <h2 className="text-lg font-semibold text-white">Confirm Approval</h2>
        <button
          type="button"
          onClick={handleCancelApprove}
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
      <div className="p-6">
        <p className="mb-4 text-sm text-slate-300">
          Are you sure you want to approve this validation project?
        </p>
        <div className="mb-6 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-300">Competency:</span>
            <span className="text-slate-200">{vpa.competencyLevel.competency.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-300">Level:</span>
            <span className="text-slate-200">{vpa.competencyLevel.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-300">Learner:</span>
            <span className="text-slate-200">{vpa.learner.name}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancelApprove}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirmApprove}
            className="force-white-text rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            disabled={isPending}
          >
            {isPending ? "Processing..." : "Confirm Approval"}
          </Button>
        </div>
      </div>
    </Modal>
    </>
  );
}

