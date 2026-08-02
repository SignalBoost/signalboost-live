// saas/lib/supervisor/recommendation-policy.ts
//
// A RECOMMENDATION WITHOUT A POLICY IS A SUGGESTION.
//
// "Reconcile 100 finished records when convenient. Nothing is waiting on them." is a good
// sentence and an operations team still cannot schedule it. Is it today's problem? Does it
// have a deadline? Does it belong in the maintenance window or in the next sprint? The
// console was leaving that judgement to whoever happened to be reading, which means the same
// condition gets triaged differently by two people on two shifts.
//
// So every recommendation carries a policy: WHERE the work belongs, HOW urgent it is, and the
// TIME IT HAS. Those three come from the diagnostic status, not from the individual card, so
// two subsystems in the same condition can never receive different urgency by accident.
//
// THE SLA IS OURS UNTIL A BUYER REPLACES IT. Every record here is marked `default_policy`, and
// `source` exists precisely so the console can say so on screen. A Fortune-500 operations team
// has its own maintenance calendar and its own severity matrix; shipping our numbers as though
// they were theirs is the same overreach as shipping our domain model as though it were theirs.
// When a buyer supplies a policy, the record is returned with `source: 'buyer_policy'` and
// nothing else in the pipeline changes.
//
// NOTHING HERE PAGES. The most urgent class this file can produce is "next business day".
// Paging is decided by operational state alone, in operational-assessment.ts, and a diagnostic
// has no route to it — that separation is the whole reason the diagnostic vocabulary exists.
//
// PURE, NO IMPORTS.

export type RecommendationPriority = 'none' | 'watch' | 'routine' | 'elevated'

export type RecommendationClass =
  | 'no_action'          // nothing is owed
  | 'observe'            // wait for the next scheduled observation; acting early is the error
  | 'maintenance_window' // batch it with other housekeeping
  | 'business_hours'     // a person, during the working day

export type RecommendationPolicy = {
  policyClass: RecommendationClass
  policyLabel: string
  priority: RecommendationPriority
  priorityLabel: string
  /** Null when the work has no deadline — an observation you must simply wait for has none. */
  slaHours: number | null
  slaLabel: string
  /** Why this class and not a more urgent one. */
  rationale: string
  source: 'default_policy' | 'buyer_policy'
}

const CLASS_LABELS: Record<RecommendationClass, string> = {
  no_action: 'No action',
  observe: 'Observe',
  maintenance_window: 'Maintenance window',
  business_hours: 'Business hours',
}

const PRIORITY_LABELS: Record<RecommendationPriority, string> = {
  none: 'None',
  watch: 'Watch',
  routine: 'Routine',
  elevated: 'Elevated',
}

/**
 * The default schedule, stated as data so a buyer can see exactly what they are replacing.
 *
 * Keyed by diagnostic status. `maintenance_required` is the only class with a next-business-day
 * deadline, and even that one does not page: it needs a person, not an interruption.
 */
const DEFAULT_POLICY: Record<string, { policyClass: RecommendationClass; priority: RecommendationPriority; slaHours: number | null; rationale: string }> = {
  nominal: {
    policyClass: 'no_action',
    priority: 'none',
    slaHours: null,
    rationale: 'Nothing is owed.',
  },
  expected_transient: {
    policyClass: 'no_action',
    priority: 'none',
    slaHours: null,
    rationale: 'The execution model predicts this state. Acting on it would be acting on normal behaviour.',
  },
  observation_delayed: {
    policyClass: 'observe',
    priority: 'watch',
    slaHours: null,
    rationale: 'The next scheduled observation resolves this without anyone touching it. It has no deadline because the deadline belongs to the schedule, not to a person.',
  },
  cleanup_pending: {
    policyClass: 'maintenance_window',
    priority: 'routine',
    slaHours: 168,
    rationale: 'Finished records only. Nothing live is waiting on them, so this belongs with other housekeeping rather than in a working day.',
  },
  not_measured: {
    policyClass: 'business_hours',
    priority: 'routine',
    slaHours: 72,
    rationale: 'An evidence gap, not a fault. It costs confidence in the assessment rather than service, so it is worth a working day and not an evening.',
  },
  capability_reduced: {
    policyClass: 'business_hours',
    priority: 'routine',
    slaHours: 72,
    rationale: 'Work continues to flow while this waits, so it is a working-day task rather than an interruption.',
  },
  maintenance_required: {
    policyClass: 'business_hours',
    priority: 'elevated',
    slaHours: 24,
    rationale: 'Needs a person and could affect operations if it is left. Still not a page — nothing is blocked yet.',
  },
}

const FALLBACK = DEFAULT_POLICY.capability_reduced

function slaLabel(hours: number | null): string {
  if (hours === null) return 'No deadline — resolves on the schedule'
  if (hours < 48) return `${hours} hours`
  return `${Math.round(hours / 24)} days`
}

/**
 * The policy attached to one recommendation.
 *
 * An unknown status falls back to the working-day class rather than to the most urgent one:
 * a status this file has never seen is by definition one nobody has shown to be urgent, and
 * defaulting an unknown to "elevated" is how a console trains its operators to ignore it.
 */
export function recommendationPolicy(diagnosticStatus: string): RecommendationPolicy {
  const entry = Object.prototype.hasOwnProperty.call(DEFAULT_POLICY, diagnosticStatus)
    ? DEFAULT_POLICY[diagnosticStatus]
    : FALLBACK
  return {
    policyClass: entry.policyClass,
    policyLabel: CLASS_LABELS[entry.policyClass],
    priority: entry.priority,
    priorityLabel: PRIORITY_LABELS[entry.priority],
    slaHours: entry.slaHours,
    slaLabel: slaLabel(entry.slaHours),
    rationale: entry.rationale,
    source: 'default_policy',
  }
}

/** Does this recommendation belong to anyone today? Used to order the attention list. */
export function isTodaysProblem(policy: RecommendationPolicy): boolean {
  return policy.priority === 'elevated'
}
