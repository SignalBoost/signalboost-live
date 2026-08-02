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
// TWO DEADLINES, NOT ONE. "No deadline — resolves on the schedule" was answering two different
// questions in one sentence and therefore neither of them cleanly. They are now separate:
//
//   ACTION DEADLINE       Does a PERSON owe something, and by when? Null means nobody is on
//                         the hook — which is a real and common answer, not a missing value.
//   EXPECTED RESOLUTION   When the SYSTEM is expected to clear it by itself.
//
// An observation that is merely late has no action deadline and a precise expected resolution.
// A stalled work item has both. Collapsing them hid the difference between "nothing for you to
// do" and "nothing will happen unless you do it".
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
  /** Hours a PERSON has to act. Null when nobody owes anything. */
  actionDeadlineHours: number | null
  actionDeadlineLabel: string
  /** When the system is expected to clear it without anyone. */
  expectedResolution: string
  /** Why this class and not a more urgent one. */
  rationale: string

  // ── Default versus what the buyer configured ───────────────────────────────
  /** Our recommendation, always shown so a buyer can see what they are overriding. */
  defaultActionDeadlineHours: number | null
  defaultActionDeadlineLabel: string
  /** What the buyer configured. Null when they have configured nothing. */
  buyerActionDeadlineHours: number | null
  buyerActionDeadlineLabel: string
  /** Which of the two is in effect. */
  source: 'default_policy' | 'buyer_policy'
  sourceLabel: string
}

/**
 * What a buyer supplies to replace our schedule.
 *
 * Deliberately narrow: a buyer overrides the DEADLINE and the PRIORITY, never the operational
 * classification. Letting a buyer declare that blocked work is routine would let policy
 * overwrite evidence, which is the one direction this product never allows.
 */
export type BuyerPolicyOverride = {
  actionDeadlineHours?: number | null
  priority?: RecommendationPriority
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
const DEFAULT_POLICY: Record<string, { policyClass: RecommendationClass; priority: RecommendationPriority; slaHours: number | null; expectedResolution: string; rationale: string }> = {
  nominal: {
    policyClass: 'no_action',
    priority: 'none',
    slaHours: null,
    expectedResolution: 'Not applicable — nothing is owed.',
    rationale: 'Nothing is owed.',
  },
  expected_transient: {
    policyClass: 'no_action',
    priority: 'none',
    slaHours: null,
    expectedResolution: 'Not applicable — this is the expected reading.',
    rationale: 'The execution model predicts this state. Acting on it would be acting on normal behaviour.',
  },
  observation_delayed: {
    policyClass: 'observe',
    priority: 'watch',
    slaHours: null,
    expectedResolution: 'At the next scheduled observation.',
    rationale: 'The next scheduled observation resolves this without anyone touching it. It has no deadline because the deadline belongs to the schedule, not to a person.',
  },
  cleanup_pending: {
    policyClass: 'maintenance_window',
    priority: 'routine',
    slaHours: 168,
    expectedResolution: 'At the next reconciliation pass.',
    rationale: 'Finished records only. Nothing live is waiting on them, so this belongs with other housekeeping rather than in a working day.',
  },
  not_measured: {
    policyClass: 'business_hours',
    priority: 'routine',
    slaHours: 72,
    expectedResolution: 'When the source next reports a metric.',
    rationale: 'An evidence gap, not a fault. It costs confidence in the assessment rather than service, so it is worth a working day and not an evening.',
  },
  capability_reduced: {
    policyClass: 'business_hours',
    priority: 'routine',
    slaHours: 72,
    expectedResolution: 'When the measurement returns above its threshold.',
    rationale: 'Work continues to flow while this waits, so it is a working-day task rather than an interruption.',
  },
  maintenance_required: {
    policyClass: 'business_hours',
    priority: 'elevated',
    slaHours: 24,
    expectedResolution: 'Not expected to resolve on its own. It needs a person.',
    rationale: 'Needs a person and could affect operations if it is left. Still not a page — nothing is blocked yet.',
  },
}

const FALLBACK = DEFAULT_POLICY.capability_reduced

function deadlineLabel(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return 'None'
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
export function recommendationPolicy(diagnosticStatus: string, override?: BuyerPolicyOverride): RecommendationPolicy {
  const entry = Object.prototype.hasOwnProperty.call(DEFAULT_POLICY, diagnosticStatus)
    ? DEFAULT_POLICY[diagnosticStatus]
    : FALLBACK
  // An override counts only when the buyer actually supplied the field. `undefined` means
  // "not configured" and falls through to our default; an explicit null means the buyer has
  // decided nobody owes a deadline, which is a real choice and is honoured.
  const overridden = override !== undefined && Object.prototype.hasOwnProperty.call(override, 'actionDeadlineHours')
  const effectiveHours = overridden ? override!.actionDeadlineHours ?? null : entry.slaHours
  const priority = override?.priority ?? entry.priority
  return {
    policyClass: entry.policyClass,
    policyLabel: CLASS_LABELS[entry.policyClass],
    priority,
    priorityLabel: PRIORITY_LABELS[priority],
    actionDeadlineHours: effectiveHours,
    actionDeadlineLabel: deadlineLabel(effectiveHours),
    expectedResolution: entry.expectedResolution,
    rationale: entry.rationale,
    defaultActionDeadlineHours: entry.slaHours,
    defaultActionDeadlineLabel: deadlineLabel(entry.slaHours),
    buyerActionDeadlineHours: overridden ? override!.actionDeadlineHours ?? null : null,
    buyerActionDeadlineLabel: overridden ? deadlineLabel(override!.actionDeadlineHours) : 'Not configured',
    source: overridden || override?.priority ? 'buyer_policy' : 'default_policy',
    sourceLabel: overridden || override?.priority ? 'Buyer policy' : 'Product default',
  }
}

/** Does this recommendation belong to anyone today? Used to order the attention list. */
export function isTodaysProblem(policy: RecommendationPolicy): boolean {
  return policy.priority === 'elevated'
}
