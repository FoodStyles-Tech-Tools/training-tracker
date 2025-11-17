/**
 * Shared helper for rendering competency level badges.
 * Ensures Basic/Competent/Advanced chips stay visually consistent
 * across Training Requests, VPA, and VSR surfaces.
 */
export function getCompetencyLevelBadgeClass(level: string): string {
  const levelLower = level.trim().toLowerCase();

  switch (levelLower) {
    case "basic":
      return "bg-blue-500/20 text-blue-200";
    case "competent":
      return "bg-emerald-500/20 text-emerald-200";
    case "advanced":
      return "bg-purple-500/20 text-purple-200";
    default:
      return "bg-slate-500/20 text-slate-200";
  }
}


