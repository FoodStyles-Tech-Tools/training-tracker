/**
 * Training Request Status Configuration
 * Maps status numbers (0-7) to their labels
 */

/**
 * Default status labels - can be overridden via environment variable
 */
export const DEFAULT_TRAINING_REQUEST_STATUSES = [
  "Not Started",
  "Looking for trainer",
  "In Queue",
  "No batch match",
  "In Progress",
  "Sessions Completed",
  "On Hold",
  "Drop Off",
];

export function getTrainingRequestStatusLabel(status: number, statuses: string[]): string {
  return statuses[status] || "Unknown";
}

export function getTrainingRequestStatusNumber(label: string, statuses: string[]): number {
  const index = statuses.findIndex(
    (s) => s.toLowerCase() === label.toLowerCase(),
  );
  return index >= 0 ? index : 0;
}

/**
 * Status badge color classes based on status
 */
export function getStatusBadgeClass(status: number): string {
  switch (status) {
    case 0: // Not Started
      return "bg-slate-500/20 text-slate-200";
    case 1: // Looking for trainer
      return "bg-blue-500/20 text-blue-200";
    case 2: // In Queue
      return "bg-blue-500/20 text-blue-200";
    case 3: // No batch match
      return "bg-amber-500/20 text-amber-200";
    case 4: // In Progress
      return "bg-indigo-500/20 text-indigo-200";
    case 5: // Sessions Completed
      return "bg-emerald-500/20 text-emerald-200";
    case 6: // On Hold
      return "bg-orange-500/20 text-orange-200";
    case 7: // Drop Off
      return "bg-red-500/20 text-red-200";
    default:
      return "bg-slate-500/20 text-slate-200";
  }
}

