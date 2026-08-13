import type { RequestStatus, WorkStatus, WorkType } from "./types";

/** The canonical workflow, in order. */
export const WORK_STATUS_FLOW: WorkStatus[] = [
  "pending_approval",
  "approved",
  "scheduled",
  "shooting",
  "editing",
  "review",
  "completed",
];

export const ALL_WORK_STATUSES: WorkStatus[] = [...WORK_STATUS_FLOW, "cancelled"];

/** Tailwind classes for each status pill. */
/**
 * Status pills use literal palette colours rather than the themed ink ramp,
 * because the hue itself carries meaning. Each therefore needs an explicit
 * dark variant: the same hue, dimmed background, lifted text.
 */
export const STATUS_STYLES: Record<WorkStatus | RequestStatus, string> = {
  pending_approval:
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25",
  pending:
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25",
  approved:
    "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/25",
  scheduled:
    "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/25",
  shooting:
    "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/25",
  editing:
    "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25",
  review:
    "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:ring-fuchsia-500/25",
  completed:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25",
  cancelled: "bg-ink-100 text-ink-500 ring-ink-200",
  rejected:
    "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/25",
};

/** Rough completion percentage suggested for each stage. */
export const STATUS_PROGRESS: Record<WorkStatus, number> = {
  pending_approval: 0,
  approved: 10,
  scheduled: 20,
  shooting: 40,
  editing: 60,
  review: 85,
  completed: 100,
  cancelled: 0,
};

export const WORK_TYPES: WorkType[] = ["photos", "video", "edit", "album", "other"];

export const SESSION_TYPES = [
  "Wedding",
  "Engagement",
  "Outdoor Photoshoot",
  "Studio Portrait",
  "Event Coverage",
  "Product Shoot",
  "Video Shoot",
  "Other",
];

export function nextStatus(current: WorkStatus): WorkStatus | null {
  const i = WORK_STATUS_FLOW.indexOf(current);
  if (i === -1 || i === WORK_STATUS_FLOW.length - 1) return null;
  return WORK_STATUS_FLOW[i + 1];
}
