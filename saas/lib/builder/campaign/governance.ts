// saas/lib/builder/campaign/governance.ts
//
// PAC-17, BUDGET AND DEADLINE ENFORCEMENT, READ BACK FROM THE PRODUCTION RECORDS. The campaign's own requests leave
// two kinds of record: one turn record per request (cos_turn_experience: total time, call count, outcome, failure
// reason) and one row per provider call (provider_inference_usage: provider, purpose, success, finish reason,
// latency). The judge below reads them and decides by fixed rules, each tied to a line of the brief:
//
//   retries cannot reset cumulative budgets      every turn's total time is inside the platform ceiling, however
//                                                 many calls it made, and no turn made more calls than the ceiling
//   an expired request cannot keep calling       no single provider call ran longer than the platform ceiling
//   background work cannot repeatedly deprive    at most one interactive request in the window was refused the
//   interactive users                             owned reasoner because background work held it
//   timeouts keep accurate failure provenance    every unanswered turn names its failure; every failed call names
//                                                 its finish reason
//   every fallback is authorized and accounted   every provider call names a provider from the authorized set
//
// Provider calls carry no turn id, so they are read for the campaign's time window and its interactive features;
// the evidence says so. Pure: the host reads the records (hostPorts.ts) and hands them here.

import type { PortResult } from './ports.ts'

/** The platform ceiling for one answer route (maxDuration 300 s): no turn and no call may outlive it. */
export const GOVERNANCE_TURN_CEILING_MS = 300_000
/** More provider calls than this in one turn means retries are not bounded by the turn's budget. */
export const GOVERNANCE_MAX_CALLS_PER_TURN = 20
/** Interactive requests refused the owned reasoner because background work held it: "repeatedly" starts at two. */
export const GOVERNANCE_MAX_BACKGROUND_REFUSALS = 1
/** The providers production may fall back to; anything else is an unauthorized route. */
export const AUTHORIZED_PROVIDERS = Object.freeze(['runpod', 'deepinfra'])
/** The usage features of the production answer path, the ones the campaign's requests use. */
export const INTERACTIVE_FEATURES = Object.freeze(['cos_interactive_answer', 'cos_fresh_grounded_task'])

export type TurnRecord = Readonly<{ turnId: string; totalMs: number | null; modelCalls: number | null; answered: boolean; failureReason: string | null }>
export type CallRecord = Readonly<{ provider: string; purpose: string | null; success: boolean; finishReason: string | null; latencyMs: number }>

export type GovernanceRecords = Readonly<{
  turns: readonly TurnRecord[]
  /** Provider calls of the interactive features inside the campaign window. */
  calls: readonly CallRecord[]
  windowStart: string
}>

export function judgeGovernance(records: GovernanceRecords): PortResult {
  const failures: string[] = []
  const { turns, calls } = records
  const overlong = turns.filter(turn => (turn.totalMs ?? 0) > GOVERNANCE_TURN_CEILING_MS)
  if (overlong.length) failures.push(`${overlong.length} turn(s) outlived the ${GOVERNANCE_TURN_CEILING_MS / 1000} s ceiling: ${overlong.map(turn => `${turn.turnId.slice(0, 8)}=${turn.totalMs} ms`).join(', ')}`)
  const chatty = turns.filter(turn => (turn.modelCalls ?? 0) > GOVERNANCE_MAX_CALLS_PER_TURN)
  if (chatty.length) failures.push(`${chatty.length} turn(s) made more than ${GOVERNANCE_MAX_CALLS_PER_TURN} provider calls: ${chatty.map(turn => `${turn.turnId.slice(0, 8)}=${turn.modelCalls}`).join(', ')}`)
  const runaway = calls.filter(call => call.latencyMs > GOVERNANCE_TURN_CEILING_MS)
  if (runaway.length) failures.push(`${runaway.length} provider call(s) ran past the ${GOVERNANCE_TURN_CEILING_MS / 1000} s ceiling`)
  const refusals = calls.filter(call => call.finishReason === 'runpod_busy_background_work').length
  if (refusals > GOVERNANCE_MAX_BACKGROUND_REFUSALS) failures.push(`background work held the owned reasoner against ${refusals} interactive requests`)
  const unexplainedTurns = turns.filter(turn => !turn.answered && !turn.failureReason)
  if (unexplainedTurns.length) failures.push(`${unexplainedTurns.length} unanswered turn(s) carry no failure reason: ${unexplainedTurns.map(turn => turn.turnId.slice(0, 8)).join(', ')}`)
  const unexplainedCalls = calls.filter(call => !call.success && !call.finishReason).length
  if (unexplainedCalls) failures.push(`${unexplainedCalls} failed provider call(s) carry no finish reason`)
  const unauthorized = [...new Set(calls.map(call => call.provider).filter(provider => !AUTHORIZED_PROVIDERS.includes(provider)))]
  if (unauthorized.length) failures.push(`provider call(s) to an unauthorized route: ${unauthorized.join(', ')}`)

  const longestTurn = Math.max(0, ...turns.map(turn => turn.totalMs ?? 0))
  const mostCalls = Math.max(0, ...turns.map(turn => turn.modelCalls ?? 0))
  const longestCall = Math.max(0, ...calls.map(call => call.latencyMs))
  const byProvider = Object.entries(calls.reduce<Record<string, number>>((acc, call) => ({ ...acc, [call.provider]: (acc[call.provider] ?? 0) + 1 }), {}))
    .map(([provider, count]) => `${provider}=${count}`).join(', ') || 'none'
  const evidence = [
    { kind: 'record' as const, label: 'Turns', detail: `${turns.length} turn record(s); longest ${longestTurn} ms (ceiling ${GOVERNANCE_TURN_CEILING_MS} ms); most calls in one turn ${mostCalls} (ceiling ${GOVERNANCE_MAX_CALLS_PER_TURN}); unanswered without reason ${unexplainedTurns.length}` },
    { kind: 'record' as const, label: 'Provider calls', detail: `${calls.length} call(s) of the interactive features since ${records.windowStart}; by provider ${byProvider}; longest ${longestCall} ms; failed without finish reason ${unexplainedCalls}; refused for background work ${refusals}` },
  ]
  if (!turns.length) return { verdict: 'BLOCKED', actual: 'No turn record of this campaign\'s requests was found to judge.', evidence, failureCause: 'no turn records' }
  if (failures.length) return { verdict: 'FAIL', actual: failures.join('; '), evidence, failureCause: failures[0] }
  return { verdict: 'PASS', actual: `Every turn stayed inside the ${GOVERNANCE_TURN_CEILING_MS / 1000} s ceiling with bounded calls, no call outlived it, failures carry their reason, every provider is authorized, and background work refused at most ${GOVERNANCE_MAX_BACKGROUND_REFUSALS} interactive request.`, evidence }
}
