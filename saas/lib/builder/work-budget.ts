// saas/lib/builder/work-budget.ts
//
// How much work a durable Builder job gets: up to MAX_WORK_SLICES slices, BUILDER_SLICE_MAX_STEPS model turns each,
// within the whole-job deadline. A V2 job that makes no progress for three slices in a row ends instead (the idle-slice
// stop). The database functions enforce the same slice ceiling (migration 20261014060000).

export const MAX_WORK_SLICES = 24

// Hard whole-job safety bounds; resumed claims retain the original createdAt.
export const BUILDER_JOB_TOTAL_DEADLINE_MS = 60 * 60 * 1000
/** Model turns one work slice may take. */
export const BUILDER_SLICE_MAX_STEPS = 24
// The whole-job model-call ceiling is the job's own slice limits, not a smaller number. Production 2026-10-24
// (LibraryFlow, workspaces 557041fe and f5b796db): a ceiling of 60 calls ended both builds after 13-14 of their
// 60 minutes, at slices 9 and 12 of 24, with all 14 files written and most tests passing. The 60 calls included
// owned-GPU timeouts and calls the slice spend ceiling refused. Spend stays bounded by the per-slice ceiling, time by
// the total deadline, and a build that gets nowhere by the idle-slice stop.
export const BUILDER_JOB_MODEL_CALL_BUDGET = MAX_WORK_SLICES * BUILDER_SLICE_MAX_STEPS
export function builderJobOverTotalDeadline(createdAt: string, now: number, deadlineMs = BUILDER_JOB_TOTAL_DEADLINE_MS): boolean {
  const created = Date.parse(createdAt)
  return !Number.isFinite(created) || now - created >= deadlineMs
}
