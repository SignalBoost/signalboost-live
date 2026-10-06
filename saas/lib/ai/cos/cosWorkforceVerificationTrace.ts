// saas/lib/ai/cos/cosWorkforceVerificationTrace.ts
//
// Read-only trace of the Workforce verification path. Owner, 2026-10-06: Step 1 evidence showed 0 verified Production
// outcomes ever, 77 production assignments, 66 runtime_failed and 11 served-awaiting-verification. This trace answers
// WHY from the tables instead of from code reading:
//
//   - which statuses and failure reasons the assignments carry;
//   - for each served production assignment, whether its turn id (source_ref) appears in any persisted chat message
//     (assistant_messages.provenance.turnId), because the owner verification page can only list turns found there;
//   - whether any turn outcome, and any production_verified outcome, exists for those turns;
//   - which serving-attempt failure classes dominate.
//
// Counts only. No user ids, prompts, replies or emails leave this module.
import { WORKFORCE_PRODUCTION_OUTCOME_NAMESPACE } from './cosWorkforceVerificationPolicy.ts'

export const WORKFORCE_TRACE_SCHEMA_VERSION = 'cos-workforce-verification-trace-v1' as const
export const WORKFORCE_TRACE_ROW_LIMIT = 5000
const ID_CHUNK = 100
const PAGE = 1000

type Db = { from: (table: string) => any }

const text = (value: unknown, max = 200): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AssignmentRow = Readonly<{ status: unknown; source_kind: unknown; source_ref: unknown; failure_reason?: unknown; harness_run_id?: unknown }>
export type ChatTurnRow = Readonly<{ user_id: unknown; turn_id: unknown }>
export type TurnOutcomeRow = Readonly<{ turn_id: unknown; outcome_source: unknown; verified_success: unknown }>
export type AttemptRow = Readonly<{ phase: unknown; outcome: unknown; error_class: unknown }>

export type WorkforceVerificationTrace = Readonly<{
  schemaVersion: typeof WORKFORCE_TRACE_SCHEMA_VERSION
  generatedAt: string
  assignments: Readonly<{ total: number; truncated: boolean; byStatus: Record<string, number>; bySourceKind: Record<string, number> }>
  runtimeFailedReasons: Record<string, number>
  servedProduction: Readonly<{
    total: number
    withHarnessRunId: number
    turnFoundInChat: number
    distinctChatUsers: number
    withAnyTurnOutcome: number
    withProductionVerifiedOutcome: number
    turnNotFoundInChat: number
  }>
  servingFailures: Readonly<{ attemptsRead: number; truncated: boolean; byOutcome: Record<string, number>; byErrorClass: Record<string, number> }>
  /** Lookups that could not be read; their counts above are unknown, not zero. */
  unavailable: Readonly<Record<string, string>>
  readOnly: true
}>

function bump(map: Record<string, number>, key: string) { map[key] = (map[key] || 0) + 1 }

function top(map: Record<string, number>, n: number): Record<string, number> {
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n))
}

/** The class of a serving failure without the per-endpoint detail: `runtime_deadline_exceeded:idle:...` -> first two segments. */
export function errorClassFamily(value: unknown): string {
  const raw = text(value, 300)
  if (!raw) return 'unclassified'
  return raw.split(':').slice(0, 2).join(':')
}

/** Pure: compose the trace from rows. */
export function composeWorkforceTrace(input: {
  assignments: readonly AssignmentRow[]
  truncated: boolean
  chatTurns: readonly ChatTurnRow[]
  turnOutcomes: readonly TurnOutcomeRow[]
  attempts: readonly AttemptRow[]
  attemptsTruncated?: boolean
  now: Date
  unavailable?: Readonly<Record<string, string>>
}): WorkforceVerificationTrace {
  const byStatus: Record<string, number> = {}
  const bySourceKind: Record<string, number> = {}
  const runtimeFailedReasons: Record<string, number> = {}
  const served: AssignmentRow[] = []
  for (const row of input.assignments) {
    const status = text(row.status, 40) || 'unknown'
    bump(byStatus, status)
    bump(bySourceKind, text(row.source_kind, 40) || 'unknown')
    if (status === 'runtime_failed') bump(runtimeFailedReasons, errorClassFamily(row.failure_reason))
    if (status === 'served' && text(row.source_kind, 40) === 'production_request') served.push(row)
  }

  const chatUsersByTurn = new Map<string, Set<string>>()
  for (const row of input.chatTurns) {
    const turn = text(row.turn_id, 80)
    if (!turn) continue
    const users = chatUsersByTurn.get(turn) || new Set<string>()
    const user = text(row.user_id, 80)
    if (user) users.add(user)
    chatUsersByTurn.set(turn, users)
  }
  // Only users of SERVED production turns: the reader fetches chat rows for every production status.
  const chatUsers = new Set<string>()
  const anyOutcome = new Set<string>()
  const verifiedOutcome = new Set<string>()
  for (const row of input.turnOutcomes) {
    const turn = text(row.turn_id, 80)
    if (!turn) continue
    anyOutcome.add(turn)
    if (text(row.outcome_source, 200).startsWith(WORKFORCE_PRODUCTION_OUTCOME_NAMESPACE) && typeof row.verified_success === 'boolean') verifiedOutcome.add(turn)
  }

  let withHarness = 0
  let found = 0
  let withAny = 0
  let withVerified = 0
  for (const row of served) {
    const turn = text(row.source_ref, 80)
    if (text(row.harness_run_id, 160)) withHarness += 1
    const users = chatUsersByTurn.get(turn)
    if (users) {
      found += 1
      for (const user of users) chatUsers.add(user)
    }
    if (anyOutcome.has(turn)) withAny += 1
    if (verifiedOutcome.has(turn)) withVerified += 1
  }

  const byOutcome: Record<string, number> = {}
  const byErrorClass: Record<string, number> = {}
  for (const row of input.attempts) {
    if (text(row.phase, 40) !== 'attempt_failed') continue
    bump(byOutcome, text(row.outcome, 40) || 'unknown')
    bump(byErrorClass, errorClassFamily(row.error_class))
  }

  return Object.freeze({
    schemaVersion: WORKFORCE_TRACE_SCHEMA_VERSION,
    generatedAt: input.now.toISOString(),
    assignments: Object.freeze({ total: input.assignments.length, truncated: input.truncated, byStatus, bySourceKind }),
    runtimeFailedReasons: top(runtimeFailedReasons, 12),
    servedProduction: Object.freeze({
      total: served.length,
      withHarnessRunId: withHarness,
      turnFoundInChat: found,
      distinctChatUsers: chatUsers.size,
      withAnyTurnOutcome: withAny,
      withProductionVerifiedOutcome: withVerified,
      turnNotFoundInChat: served.length - found,
    }),
    servingFailures: Object.freeze({
      attemptsRead: input.attempts.length,
      truncated: input.attemptsTruncated === true,
      byOutcome: top(byOutcome, 12),
      byErrorClass: top(byErrorClass, 12),
    }),
    unavailable: Object.freeze({ ...(input.unavailable || {}) }),
    readOnly: true as const,
  })
}

async function rows(query: any): Promise<any[]> {
  const result = await query
  if (result?.error) throw result.error
  return Array.isArray(result?.data) ? result.data : []
}

/** Paged read; stops at WORKFORCE_TRACE_ROW_LIMIT and reports truncation instead of guessing. */
async function paged(build: (from: number, to: number) => any): Promise<{ data: any[]; truncated: boolean }> {
  const out: any[] = []
  for (let from = 0; from < WORKFORCE_TRACE_ROW_LIMIT; from += PAGE) {
    const page = await rows(build(from, from + PAGE - 1))
    out.push(...page)
    if (page.length < PAGE) return { data: out, truncated: false }
  }
  return { data: out, truncated: true }
}

export async function readWorkforceVerificationTrace(input: { db: Db; now?: Date; attemptsSince?: Date }): Promise<WorkforceVerificationTrace> {
  const now = input.now ?? new Date()
  const db = input.db
  const assignments = await paged((from, to) => db.from('cos_workforce_assignments')
    .select('status,source_kind,source_ref,failure_reason,harness_run_id')
    .order('assigned_at', { ascending: false })
    .range(from, to))

  const turnIds = [...new Set(assignments.data
    .filter((row: any) => text(row.source_kind, 40) === 'production_request')
    .map((row: any) => text(row.source_ref, 80))
    .filter(id => UUID.test(id)))]

  // Each lookup degrades to "unavailable" on its own: assistant_messages is filtered on a JSON path without an index
  // and may time out on a large table, which must not hide the rest of the trace or pass as a real zero.
  const chatTurns: ChatTurnRow[] = []
  const turnOutcomes: TurnOutcomeRow[] = []
  const unavailable: Record<string, string> = {}
  for (let i = 0; i < turnIds.length; i += ID_CHUNK) {
    const chunk = turnIds.slice(i, i + ID_CHUNK)
    if (!unavailable.chatHistory) {
      try { chatTurns.push(...await rows(db.from('assistant_messages').select('user_id,turn_id:provenance->>turnId').in('provenance->>turnId', chunk).limit(PAGE))) }
      catch (error) { unavailable.chatHistory = text(error instanceof Error ? error.message : (error as any)?.message || String(error), 200) }
    }
    if (!unavailable.turnOutcomes) {
      try { turnOutcomes.push(...await rows(db.from('cos_turn_outcomes').select('turn_id,outcome_source,verified_success').in('turn_id', chunk).limit(PAGE))) }
      catch (error) { unavailable.turnOutcomes = text(error instanceof Error ? error.message : (error as any)?.message || String(error), 200) }
    }
  }

  const since = (input.attemptsSince ?? new Date(now.getTime() - 7 * 86_400_000)).toISOString()
  const attempts = await paged((from, to) => db.from('cos_university_graduate_serving_attempts')
    .select('phase,outcome,error_class')
    .eq('phase', 'attempt_failed')
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: false })
    .range(from, to))

  return composeWorkforceTrace({ assignments: assignments.data, truncated: assignments.truncated, chatTurns, turnOutcomes, attempts: attempts.data, attemptsTruncated: attempts.truncated, now, unavailable })
}

/** One block a human reads in a CI log. */
export function describeWorkforceTrace(trace: WorkforceVerificationTrace): string {
  const kv = (map: Record<string, number>) => Object.entries(map).map(([k, v]) => `${k}=${v}`).join(' ') || 'none'
  const s = trace.servedProduction
  return [
    `WORKFORCE TRACE assignments=${trace.assignments.total}${trace.assignments.truncated ? '+ (truncated)' : ''} :: ${kv(trace.assignments.byStatus)} | source ${kv(trace.assignments.bySourceKind)}`,
    `  runtime_failed reasons: ${kv(trace.runtimeFailedReasons)}`,
    `  served production: total=${s.total} harnessRunId=${s.withHarnessRunId} turnFoundInChat=${s.turnFoundInChat} (distinctUsers=${s.distinctChatUsers}) turnNotFoundInChat=${s.turnNotFoundInChat} anyTurnOutcome=${s.withAnyTurnOutcome} productionVerified=${s.withProductionVerifiedOutcome}`,
    `  serving failures 7d: read=${trace.servingFailures.attemptsRead}${trace.servingFailures.truncated ? '+ (truncated)' : ''} outcome ${kv(trace.servingFailures.byOutcome)}`,
    `  serving failure classes 7d: ${kv(trace.servingFailures.byErrorClass)}`,
    ...(Object.keys(trace.unavailable).length ? [`  UNAVAILABLE (counts above are unknown, not zero): ${Object.entries(trace.unavailable).map(([k, v]) => `${k}: ${v}`).join(' | ')}`] : []),
  ].join('\n')
}
// end of saas/lib/ai/cos/cosWorkforceVerificationTrace.ts (if this line is missing, the paste was cut short)
