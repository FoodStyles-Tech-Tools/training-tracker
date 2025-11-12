/**
 * Validation Project Approval Status Configuration
 * Status labels are defined in env.ts (VPA_STATUS environment variable)
 * Status values 0-3 map directly to array indices 0-3 in the statuses array
 * 
 * To update status labels, edit the default value in src/env.ts
 */

export function getVPAStatusLabel(status: number, statuses: string[]): string {
  // Map status 0-3 directly to array indices 0-3
  if (status >= 0 && status < statuses.length) {
    return statuses[status];
  }
  return "Unknown";
}

export function getVPAStatusNumber(label: string, statuses: string[]): number {
  // Map array indices 0-3 to status values 0-3
  const index = statuses.findIndex(
    (s) => s.toLowerCase() === label.toLowerCase(),
  );
  return index >= 0 ? index : 0; // Default to 0 (Pending Validation Project Approval) if not found
}

/**
 * Status badge color classes based on status
 * Status values are defined in env.VPA_STATUS
 * 0 = Pending Validation Project Approval
 * 1 = Approved
 * 2 = Rejected
 * 3 = Resubmit for Re-validation
 */
export function getVPAStatusBadgeClass(status: number): string {
  switch (status) {
    case 0: // Pending Validation Project Approval
      return "bg-amber-500/20 text-amber-200";
    case 1: // Approved
      return "bg-emerald-500/20 text-emerald-200";
    case 2: // Rejected
      return "bg-red-500/20 text-red-200";
    case 3: // Resubmit for Re-validation
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

