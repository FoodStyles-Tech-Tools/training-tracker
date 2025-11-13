/**
 * Training Request Status Configuration
 * Status labels are defined in env.ts (TRAINING_REQUEST_STATUS environment variable)
 * This file provides utility functions for working with status labels.
 * 
 * To update status labels, edit the default value in src/env.ts
 */

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
 * Status values are defined in env.TRAINING_REQUEST_STATUS
 */
export function getStatusBadgeClass(status: number): string {
  switch (status) {
    case 0:
      return "bg-slate-500/20 text-slate-200";
    case 1:
      return "bg-blue-500/20 text-blue-200";
    case 2:
      return "bg-blue-500/20 text-blue-200";
    case 3:
      return "bg-amber-500/20 text-amber-200";
    case 4:
      return "bg-indigo-500/20 text-indigo-200";
    case 5:
      return "bg-emerald-500/20 text-emerald-200";
    case 6:
      return "bg-orange-500/20 text-orange-200";
    case 7:
      return "bg-red-500/20 text-red-200";
    case 8:
      return "bg-green-500/20 text-green-200";
    default:
      return "bg-slate-500/20 text-slate-200";
  }
}

