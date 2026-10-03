// saas/lib/ai/cos/cosUniversityLifecycleOrchestrator.ts
// Durable forward-progress policy for trained University artifacts.
// This controller never grades, promotes, dismisses, or widens authority. It owns only the obligation
// that every nonterminal artifact has a named next action and a deadline.

export type UniversityLifecycleStage =
  | 'EXACT_CANARY'
  | 'INDEPENDENT_EVALUATION'
  | 'QUARANTINE_REMEDIATION'
  | 'GRADUATION'
  | 'WORKFORCE'
  | 'TERMINAL'

export type LifecycleArtifact = Readonly<{
  candidateId: string
  artifactHash: string
  subjectId: string
  status: string
  updatedAt: string
}>

export type LifecyclePlan = Readonly<{
  stage: UniversityLifecycleStage
  nextAction: string
  deadlineMs: number
  terminal: boolean
  workerPath: string | null
}>

export const UNIVERSITY_LIFECYCLE_PLAN: Readonly<Record<string, LifecyclePlan>> = Object.freeze({
  evaluation_ready: Object.freeze({
    stage: 'EXACT_CANARY', nextAction: 'run_exact_canary_and_admit_evaluation',
    deadlineMs: 30 * 60_000, terminal: false, workerPath: '/api/cron/runpod-mass-distilled-local-deploy',
  }),
  evaluation_pending: Object.freeze({
    stage: 'INDEPENDENT_EVALUATION', nextAction: 'complete_independent_evaluation',
    deadlineMs: 45 * 60_000, terminal: false, workerPath: '/api/cron/cos-university-mass-distilled-evaluation',
  }),
  quarantined: Object.freeze({
    stage: 'QUARANTINE_REMEDIATION', nextAction: 'resolve_quarantine_or_retire',
    deadlineMs: 30 * 60_000, terminal: false, workerPath: '/api/cron/cos-university-mass-backlog-compact',
  }),
  runtime_pending: Object.freeze({
    stage: 'GRADUATION', nextAction: 'register_and_activate_graduate',
    deadlineMs: 30 * 60_000, terminal: false, workerPath: '/api/cron/cos-university-graduate-activation',
  }),
  active: Object.freeze({
    stage: 'WORKFORCE', nextAction: 'assign_and_verify_production_work',
    deadlineMs: 60 * 60_000, terminal: false, workerPath: '/api/cron/cos-workforce-pipeline',
  }),
  retired: Object.freeze({
    stage: 'TERMINAL', nextAction: 'none',
    deadlineMs: 0, terminal: true, workerPath: null,
  }),
})

export function lifecyclePlan(status: string): LifecyclePlan | null {
  return UNIVERSITY_LIFECYCLE_PLAN[String(status || '').trim()] ?? null
}

export function lifecycleDeadline(enteredAt: Date, plan: LifecyclePlan): Date {
  return new Date(enteredAt.getTime() + plan.deadlineMs)
}

export function shouldOrchestrate(input: {
  now: Date
  deadlineAt: string
  terminal: boolean
  lastActionAt?: string | null
  minimumActionSpacingMs?: number
}): boolean {
  if (input.terminal) return false
  const now = input.now.getTime()
  const deadline = Date.parse(input.deadlineAt)
  if (!Number.isFinite(now) || !Number.isFinite(deadline) || now < deadline) return false
  const last = input.lastActionAt ? Date.parse(input.lastActionAt) : Number.NaN
  const spacing = input.minimumActionSpacingMs ?? 5 * 60_000
  return !Number.isFinite(last) || now - last >= spacing
}

export function stageChanged(previous: { stage: string; artifact_hash: string } | null, plan: LifecyclePlan, artifactHash: string): boolean {
  return !previous || previous.stage !== plan.stage || previous.artifact_hash !== artifactHash
}
