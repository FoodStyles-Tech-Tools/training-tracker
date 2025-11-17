import { getCompetencyLevelBadgeClass } from "./competency-level-config";

/**
 * Validation Schedule Request Status Configuration
 * Status labels are defined in env.ts (VSR_STATUS environment variable)
 * Status values map to array indices: 0→0, 1→1, 2→2, 3→3, 4→4
 * 
 * To update status labels, edit the default value in src/env.ts
 */
export function getVSRStatusLabel(status: number, statuses: string[]): string {
  // Map status to array index
  if (status >= 0 && status < statuses.length) {
    return statuses[status];
  }
  return "Unknown";
}

export function getVSRStatusNumber(label: string, statuses: string[]): number {
  // Map array indices 0-4 to status values 0-4
  const index = statuses.findIndex(
    (s) => s.toLowerCase() === label.toLowerCase(),
  );
  return index >= 0 ? index : 0; // Default to 0 (Pending Validation) if not found
}

/**
 * Status badge color classes based on status
 * Status values are defined in env.VSR_STATUS
 * 0 = Pending Validation
 * 1 = Pending Re-validation
 * 2 = Validation Scheduled
 * 3 = Fail
 * 4 = Pass
 */
export function getVSRStatusBadgeClass(status: number): string {
  switch (status) {
    case 0: // Pending Validation
      return "bg-slate-500/20 text-slate-200";
    case 1: // Pending Re-validation
      return "bg-amber-500/20 text-amber-200";
    case 2: // Validation Scheduled
      return "bg-emerald-500/20 text-emerald-200";
    case 3: // Fail
      return "bg-red-500/20 text-red-200";
    case 4: // Pass
      return "bg-emerald-500/20 text-emerald-200";
    default:
      return "bg-slate-500/20 text-slate-200";
  }
}

/**
 * Level badge color classes
 */
export function getVSRLevelBadgeClass(level: string): string {
  return getCompetencyLevelBadgeClass(level);
}

