/**
 * Validation Project Approval Status Configuration
 * Status labels are defined in env.ts (VPA_STATUS environment variable)
 * This file provides utility functions for working with status labels.
 * 
 * To update status labels, edit the default value in src/env.ts
 */

export function getVPAStatusLabel(status: number, statuses: string[]): string {
  return statuses[status] || "Unknown";
}

export function getVPAStatusNumber(label: string, statuses: string[]): number {
  const index = statuses.findIndex(
    (s) => s.toLowerCase() === label.toLowerCase(),
  );
  return index >= 0 ? index : 0;
}

/**
 * Status badge color classes based on status
 * Status values are defined in env.VPA_STATUS
 */
export function getVPAStatusBadgeClass(status: number): string {
  switch (status) {
    case 0:
      return "bg-slate-500/20 text-slate-200";
    case 1:
      return "bg-amber-500/20 text-amber-200";
    case 2:
      return "bg-emerald-500/20 text-emerald-200";
    case 3:
      return "bg-red-500/20 text-red-200";
    case 4:
      return "bg-blue-500/20 text-blue-200";
    default:
      return "bg-slate-500/20 text-slate-200";
  }
}

/**
 * Level badge color classes
 */
export function getVPALevelBadgeClass(level: string): string {
  const levelLower = level.toLowerCase();
  if (levelLower === "basic") {
    return "bg-blue-500/20 text-blue-200";
  } else if (levelLower === "competent") {
    return "bg-emerald-500/20 text-emerald-200";
  } else if (levelLower === "advanced") {
    return "bg-purple-500/20 text-purple-200";
  }
  return "bg-slate-500/20 text-slate-200";
}

