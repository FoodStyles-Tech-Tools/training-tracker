import { getCompetencyLevelBadgeClass } from "./competency-level-config";

/**
 * Project Assignment Request Status Configuration
 * Status labels are defined in env.ts (PAR_STATUS environment variable)
 * Status values 0-4 map directly to array indices 0-4 in the statuses array
 * 
 * To update status labels, edit the default value in src/env.ts
 */
export function getPARStatusLabel(status: number, statuses: string[]): string {
  // Map status 0-4 directly to array indices 0-4
  if (status >= 0 && status < statuses.length) {
    return statuses[status];
  }
  return "Unknown";
}

export function getPARStatusNumber(label: string, statuses: string[]): number {
  // Map array indices 0-4 to status values 0-4
  const index = statuses.findIndex(
    (s) => s.toLowerCase() === label.toLowerCase(),
  );
  return index >= 0 ? index : 0; // Default to 0 (New) if not found
}

/**
 * Status badge color classes based on status
 * Status values are defined in env.PAR_STATUS
 * 0 = New
 * 1 = Pending Project Assignment
 * 2 = Project Assigned
 * 3 = Rejected Project
 * 4 = No project match
 */
export function getPARStatusBadgeClass(status: number): string {
  switch (status) {
    case 0: // New
      return "bg-blue-500/20 px-2 py-0.5 text-sm font-semibold text-blue-200 rounded-md";
    case 1: // Pending Project Assignment
      return "bg-amber-500/20 px-2 py-0.5 text-sm font-semibold text-amber-200 rounded-md";
    case 2: // Project Assigned
      return "bg-emerald-500/20 px-2 py-0.5 text-sm font-semibold text-emerald-200 rounded-md";
    case 3: // Rejected Project
      return "bg-red-500/20 px-2 py-0.5 text-sm font-semibold text-red-200 rounded-md";
    case 4: // No project match
      return "bg-slate-500/20 px-2 py-0.5 text-sm font-semibold text-slate-200 rounded-md";
    default:
      return "bg-slate-500/20 px-2 py-0.5 text-sm font-semibold text-slate-200 rounded-md";
  }
}

/**
 * Level badge color classes
 */
export function getPARLevelBadgeClass(level: string): string {
  return getCompetencyLevelBadgeClass(level);
}

