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
  const baseClass = "tr-status-badge";

  switch (status) {
    case 0:
      return `${baseClass} ${baseClass}--not-started`;
    case 1:
      return `${baseClass} ${baseClass}--looking-for-trainer`;
    case 2:
      return `${baseClass} ${baseClass}--in-queue`;
    case 3:
      return `${baseClass} ${baseClass}--no-batch-match`;
    case 4:
      return `${baseClass} ${baseClass}--in-progress`;
    case 5:
      return `${baseClass} ${baseClass}--sessions-completed`;
    case 6:
      return `${baseClass} ${baseClass}--on-hold`;
    case 7:
      return `${baseClass} ${baseClass}--drop-off`;
    case 8:
      return `${baseClass} ${baseClass}--training-completed`;
    default:
      return `${baseClass} ${baseClass}--not-started`;
  }
}

