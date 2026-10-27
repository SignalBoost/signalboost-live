// saas/lib/builder/campaign/runner.ts
//
// THE CAMPAIGN RUNNER. Executes the catalog in order through the host's ports, one real check at a time, and writes
// a ledger row per item with the item's own evidence. It is a slice runner: it stops when the slice's time is nearly
// spent and resumes from the ledger on the next slice, so a twenty-item campaign with real model calls survives the
// per-slice deadline of the job runner. Acceptance for an analysis item is the deterministic answer contract the
// production path itself uses (answerTaskContract.ts): a reply is PASS only when the production path released it and
// every numbered deliverable has real substance; a refusal, a timeout, a generic or duplicated reply is FAIL.
//
// Pure: no I/O of its own, every effect goes through a port.

import type { CampaignItem } from './catalog.ts'
import type { CampaignEvidence, CampaignLedger, CampaignLedgerRow, CampaignVerdict } from './ledger.ts'
import { pendingItems } from './ledger.ts'
import type { AnalysisOutcome, CampaignPorts, PortResult } from './ports.ts'
import { missingAnalyticalTasks } from '../../ai/cos/answerTaskContract.ts'

/** Time a single item is expected to need; the slice stops before an item it cannot finish. */
export const CAMPAIGN_ITEM_RESERVE_MS = 60_000

export type CampaignSliceResult = Readonly<{
  ledger: CampaignLedger
  stopped: 'complete' | 'budget' | 'aborted'
}>

export type ReliabilityProgress = Readonly<{ testId: string; completed: number; correlationIds: readonly string[] }>

export type CampaignState = Readonly<{
  ledger: CampaignLedger
  reliability: ReliabilityProgress | null
}>

/** Production-path sources that mean the request did not get a released answer. Read from the response, not the reply text. */
export function analysisFailureCause(outcome: AnalysisOutcome): string | null {
  if (outcome.status === null) return 'the request never completed'
  if (outcome.status >= 400) return `production path returned HTTP ${outcome.status}`
  if (!outcome.ok) return `production path did not release an answer (source: ${outcome.source || 'unknown'})`
  if (!outcome.reply.trim()) return 'empty reply'
  const source = String(outcome.source || '').toLowerCase()
  if (/failed_closed|timeout|deadline|unavailable|refusal|security/.test(source)) return `production path ended in ${outcome.source}`
  return null
}

export function judgeAnalysis(prompt: string, outcome: AnalysisOutcome): Readonly<{ verdict: CampaignVerdict; actual: string; failureCause: string | null }> {
  const cause = analysisFailureCause(outcome)
  if (cause) return { verdict: 'FAIL', actual: `No released answer. ${cause}.`, failureCause: cause }
  const missing = missingAnalyticalTasks(prompt, outcome.reply)
  if (missing.length) {
    const cause2 = `deliverables without real substance: ${missing.map(item => item.slice(0, 60)).join('; ')}`
    return { verdict: 'FAIL', actual: `Answer released (${outcome.reply.length} chars) but ${missing.length} deliverable(s) lack substance.`, failureCause: cause2 }
  }
  return { verdict: 'PASS', actual: `Answer released (${outcome.reply.length} chars); every requested deliverable has substance.`, failureCause: null }
}

export function analysisEvidence(outcome: AnalysisOutcome): CampaignEvidence[] {
  return [{
    kind: 'model_call',
    label: 'Model call receipt',
    detail: `status=${outcome.status ?? 'none'} source=${outcome.source || '-'} model=${outcome.model || '-'} local_model=${outcome.localModelInvoked ?? '-'} latency_ms=${outcome.latencyMs} execution_allowed=${outcome.executionAllowed ?? '-'}`,
  }]
}

function row(item: CampaignItem, ledger: CampaignLedger, executedAt: string, now: () => number, result: PortResult, scenario: string): CampaignLedgerRow {
  return {
    testId: item.id,
    title: item.title,
    productionCommit: ledger.productionCommit,
    executedAt,
    finishedAt: new Date(now()).toISOString(),
    scenario,
    expected: item.requiredResult,
    actual: result.actual,
    verdict: result.verdict,
    correlationId: result.correlationId ?? null,
    evidence: result.evidence,
    failureCause: result.failureCause ?? null,
    repairPr: null,
    retest: null,
  }
}

function blocked(cause: string): PortResult {
  return { verdict: 'BLOCKED', actual: `Not executed: ${cause}.`, evidence: [{ kind: 'note', label: 'Capability', detail: cause }], failureCause: cause }
}

async function executeItem(item: CampaignItem, ports: CampaignPorts, ledger: CampaignLedger, signal: AbortSignal | undefined): Promise<Readonly<{ result: PortResult; scenario: string }>> {
  switch (item.port) {
    case 'analysis': {
      if (!ports.analysis) return { result: blocked('no production-path analysis port on this host'), scenario: item.prompt || '' }
      const outcome = await ports.analysis(item.prompt || '', signal)
      const judged = judgeAnalysis(item.prompt || '', outcome)
      return { scenario: item.prompt || '', result: { ...judged, correlationId: outcome.correlationId, evidence: analysisEvidence(outcome) } }
    }
    case 'routing': {
      if (!ports.routing) return { result: blocked('no routing read-back port on this host'), scenario: item.prompt || '' }
      const { outcome, enteredBuilder } = await ports.routing(item.prompt || '', signal)
      const judged = judgeAnalysis(item.prompt || '', outcome)
      const evidence = [...analysisEvidence(outcome), { kind: 'record' as const, label: 'Routing', detail: enteredBuilder ? 'entered Builder as coding work' : 'answered as analysis, no Builder job' }]
      if (enteredBuilder) return { scenario: item.prompt || '', result: { verdict: 'FAIL', actual: 'The investigation entered the Builder as coding work.', correlationId: outcome.correlationId, evidence, failureCause: 'misrouted to Builder' } }
      return { scenario: item.prompt || '', result: { ...judged, correlationId: outcome.correlationId, evidence } }
    }
    case 'fault':
      return { scenario: `fault: ${item.fault}`, result: ports.fault ? await ports.fault(item.fault!, signal) : blocked('no isolated fault-injection port on this host') }
    case 'browser':
      return { scenario: `browser workflow ${item.id}`, result: ports.browser ? await ports.browser(item.id, signal) : blocked('no browser runner with network and a test account on this host') }
    case 'observability': {
      const ids = ledger.rows.map(r => r.correlationId).filter((id): id is string => Boolean(id))
      return { scenario: `trace of ${ids.length} executed request(s)`, result: ports.observability ? await ports.observability(ids, signal) : blocked('no production trace read-back port on this host') }
    }
    case 'governance':
      return { scenario: 'budget and deadline records of this campaign\'s requests', result: ports.governance ? await ports.governance(signal) : blocked('no governance read-back port on this host') }
    case 'builder_fixture':
      return { scenario: 'disposable fixture with one deliberately failing test', result: ports.builderFixture ? await ports.builderFixture(signal) : blocked('no Builder fixture port on this host') }
    case 'release':
      return { scenario: `release checks for ${ledger.productionCommit || 'unknown commit'}`, result: ports.release ? await ports.release(ledger.productionCommit, signal) : blocked('no release-check port on this host') }
    case 'reliability':
      throw new Error('reliability items are executed by the slice loop')
  }
}

/**
 * Run as much of the campaign as the slice allows. `remainingMs` is the slice's clock; an item is started only when
 * at least one item's reserve is left. Reliability progress (PAC-20) is kept in `state.reliability` between slices.
 */
export async function runCampaignSlice(input: Readonly<{
  catalog: readonly CampaignItem[]
  state: CampaignState
  ports: CampaignPorts
  remainingMs: () => number
  signal?: AbortSignal
  now?: () => number
  /** Prompts rotated through the reliability loop so the 20 requests cover different subjects and formats. */
  reliabilityPrompts?: readonly string[]
}>): Promise<CampaignState & { stopped: 'complete' | 'budget' | 'aborted' }> {
  const now = input.now ?? (() => Date.now())
  let ledger = input.state.ledger
  let reliability = input.state.reliability
  if (!ledger.productionCommit && !ledger.mainCommit) {
    const facts = await input.ports.deployment()
    ledger = { ...ledger, productionCommit: facts.productionCommit, mainCommit: facts.mainCommit }
  }
  for (const item of pendingItems(ledger, input.catalog)) {
    if (input.signal?.aborted) return { ledger, reliability, stopped: 'aborted' }
    if (input.remainingMs() < CAMPAIGN_ITEM_RESERVE_MS) return { ledger, reliability, stopped: 'budget' }
    const executedAt = new Date(now()).toISOString()
    if (item.port === 'reliability') {
      if (!input.ports.analysis) {
        ledger = { ...ledger, rows: [...ledger.rows, row(item, ledger, executedAt, now, blocked('no production-path analysis port on this host'), 'reliability loop')] }
        continue
      }
      const required = item.count ?? 20
      const prompts = input.reliabilityPrompts?.length ? input.reliabilityPrompts : [item.prompt || '']
      let progress: ReliabilityProgress = reliability?.testId === item.id ? reliability : { testId: item.id, completed: 0, correlationIds: [] }
      let failure: Readonly<{ at: number; cause: string; evidence: CampaignEvidence[]; correlationId: string | null }> | null = null
      while (progress.completed < required) {
        if (input.signal?.aborted) return { ledger, reliability: progress, stopped: 'aborted' }
        if (input.remainingMs() < CAMPAIGN_ITEM_RESERVE_MS) return { ledger, reliability: progress, stopped: 'budget' }
        const prompt = prompts[progress.completed % prompts.length]
        const outcome = await input.ports.analysis(prompt, input.signal)
        const judged = judgeAnalysis(prompt, outcome)
        if (judged.verdict !== 'PASS') {
          failure = { at: progress.completed + 1, cause: judged.failureCause || judged.actual, evidence: analysisEvidence(outcome), correlationId: outcome.correlationId }
          break
        }
        progress = { ...progress, completed: progress.completed + 1, correlationIds: [...progress.correlationIds, ...(outcome.correlationId ? [outcome.correlationId] : [])] }
      }
      const result: PortResult = failure
        ? { verdict: 'FAIL', actual: `Request ${failure.at} of ${required} did not produce a complete analysis; ${failure.at - 1} consecutive completions before it.`, correlationId: failure.correlationId, evidence: [{ kind: 'record', label: 'Consecutive completions', detail: `${failure.at - 1} of ${required}` }, ...failure.evidence], failureCause: failure.cause }
        : { verdict: 'PASS', actual: `${required} of ${required} consecutive analytical requests completed with every deliverable delivered.`, correlationId: progress.correlationIds.at(-1) ?? null, evidence: [{ kind: 'record', label: 'Consecutive completions', detail: `${required} of ${required}; correlation ids: ${progress.correlationIds.join(', ') || 'none recorded'}` }] }
      ledger = { ...ledger, rows: [...ledger.rows, row(item, ledger, executedAt, now, result, `reliability loop: ${required} requests over ${prompts.length} prompt(s)`)] }
      reliability = null
      continue
    }
    const executed = await executeItem(item, input.ports, ledger, input.signal)
    ledger = { ...ledger, rows: [...ledger.rows, row(item, ledger, executedAt, now, executed.result, executed.scenario)] }
  }
  return { ledger, reliability, stopped: 'complete' }
}

export function emptyCampaignLedger(campaignId: string, now = Date.now()): CampaignLedger {
  return { campaignId, productionCommit: null, mainCommit: null, startedAt: new Date(now).toISOString(), rows: [] }
}
