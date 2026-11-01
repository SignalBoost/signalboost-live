// saas/lib/builder/campaign/runner.ts
//
// THE CAMPAIGN RUNNER. Executes the catalog in order through the host's ports, one real check at a time, and writes
// a ledger row per item with the item's own evidence. It is a slice runner: it stops when the slice's time is nearly
// spent and resumes from the ledger on the next slice, so a twenty-item campaign with real model calls survives the
// per-slice deadline of the job runner. Acceptance for an analysis item is the independent outcome verifier the
// production path itself releases answers with (answerOutcomeVerifier.ts): a reply is PASS only when the production
// path released it and the verifier quotes the answer's delivery of every requested deliverable; a refusal, a timeout
// or a reply missing a deliverable is FAIL; a verifier that could not run makes the item BLOCKED, never PASS.
//
// Pure: no I/O of its own, every effect goes through a port.

import type { CampaignItem } from './catalog.ts'
import { PAC_MODEL_LANE_PORTS, PAC_PARALLEL_PORTS } from './catalog.ts'
import type { CampaignEvidence, CampaignLedger, CampaignLedgerRow, CampaignVerdict } from './ledger.ts'
import { pendingItems } from './ledger.ts'
import type { AnalysisOutcome, CampaignPorts, PortResult } from './ports.ts'
import { newBrowserSession, type BrowserSession } from './browserChecks.ts'
import type { FixtureSession } from './fixture.ts'
import { verifyAnswerOutcome, type AnswerOutcomeJudge } from '../../ai/cos/answerOutcomeVerifier.ts'

/**
 * SLICE SCHEDULING. Before any request has completed, an item needs at least one minute. Afterwards the reserve is the
 * shortest completed request: a request that may fit is started, and one the slice deadline does cut is an
 * interruption, never a production result: it is not recorded and runs again in the next slice. The item that was
 * just interrupted is started again only when the longest completed request fits, so the same request is not cut
 * twice in a row. (Codex on #4973 and #4974: reserving the longest request on every item let a 240 s slice run one
 * 116 s request, and the twenty-eight requests of the catalog outran the 24-slice continuation budget.)
 */
export const CAMPAIGN_ITEM_RESERVE_MS = 60_000

/**
 * No overhead is added: the slice clock the job runner hands the campaign is its 240 s hard deadline, and the
 * checkpoint write runs after that clock, inside the function's 300 s ceiling. Two 116 s requests therefore fit one
 * slice, which keeps the catalog's twenty-eight requests inside the continuation budget.
 */
export function itemReserveMs(timings: Readonly<{ shortestRequestMs: number; longestRequestMs: number }>, afterInterruption: boolean): number {
  const basis = afterInterruption ? timings.longestRequestMs : timings.shortestRequestMs
  return Math.max(CAMPAIGN_ITEM_RESERVE_MS, basis)
}

/**
 * How many production model requests the campaign keeps in flight at once. The live path is served by a hosted provider
 * (the 2026-11-01 run recorded every interactive call on DeepInfra), so the analytical checks and the reliability loop no
 * longer wait in line; the cap keeps a campaign from crowding out real users of the same path. A fixed constant, not a
 * setting.
 */
export const CAMPAIGN_MODEL_CONCURRENCY = 3

export type CampaignSliceResult = Readonly<{
  ledger: CampaignLedger
  stopped: 'complete' | 'budget' | 'aborted'
}>

export type ReliabilityProgress = Readonly<{ testId: string; completed: number; correlationIds: readonly string[] }>

export type CampaignState = Readonly<{
  ledger: CampaignLedger
  reliability: ReliabilityProgress | null
  /** Shortest and longest completed production requests in this campaign, the basis of the per-item reserve. */
  shortestRequestMs?: number
  longestRequestMs?: number
  /** The item the previous slice interrupted, if any: it is started again only when the longest request fits. */
  interruptedItem?: string | null
  /** The browser session of a check still in progress, or the sandbox kept for the next browser item. */
  browser?: BrowserSession | null
  /** The Builder fixture run still in progress. */
  fixture?: FixtureSession | null
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

export async function judgeAnalysis(prompt: string, outcome: AnalysisOutcome, judge: AnswerOutcomeJudge | undefined): Promise<Readonly<{ verdict: CampaignVerdict; actual: string; failureCause: string | null }>> {
  const cause = analysisFailureCause(outcome)
  if (cause) return { verdict: 'FAIL', actual: `No released answer. ${cause}.`, failureCause: cause }
  if (!judge) return { verdict: 'BLOCKED', actual: `Answer released (${outcome.reply.length} chars); not graded: no independent outcome verifier on this host.`, failureCause: 'no independent outcome verifier on this host' }
  const verified = await verifyAnswerOutcome({ request: prompt, answer: outcome.reply, judge })
  if (verified.status === 'unverified') {
    return { verdict: 'BLOCKED', actual: `Answer released (${outcome.reply.length} chars); not graded: the independent outcome verifier could not run (${verified.verification.reason}).`, failureCause: 'independent outcome verifier unavailable' }
  }
  if (verified.status === 'incomplete') {
    return { verdict: 'FAIL', actual: `Answer released (${outcome.reply.length} chars) but ${verified.missing.length} of ${verified.deliverables.length} requested deliverable(s) are not delivered.`, failureCause: `undelivered: ${verified.missing.map(item => item.slice(0, 60)).join('; ')}` }
  }
  return { verdict: 'PASS', actual: `Answer released (${outcome.reply.length} chars); the independent verifier found every one of ${verified.deliverables.length} requested deliverable(s) delivered, each with a quoted passage.`, failureCause: null }
}

export function analysisEvidence(outcome: AnalysisOutcome): CampaignEvidence[] {
  return [{
    kind: 'model_call',
    label: 'Model call receipt',
    detail: `status=${outcome.status ?? 'none'} source=${outcome.source || '-'} model=${outcome.model || '-'} local_model=${outcome.localModelInvoked ?? '-'} latency_ms=${outcome.latencyMs} execution_allowed=${outcome.executionAllowed ?? '-'}`,
  }]
}

/** Record the revision the live site reported for a request: the first one is the production commit under test. */
function noteServedRevision(ledger: CampaignLedger, servedCommit: string | null): CampaignLedger {
  if (!servedCommit) return ledger
  if (!ledger.productionCommit) return { ...ledger, productionCommit: servedCommit }
  if (servedCommit === ledger.productionCommit || ledger.revisionChanges.includes(servedCommit)) return ledger
  return { ...ledger, revisionChanges: [...ledger.revisionChanges, servedCommit] }
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

type Executed = Readonly<{ result: PortResult; scenario: string; servedCommit?: string | null; requestMs?: number; interrupted?: boolean; browser?: BrowserSession | null; fixture?: FixtureSession | null; pending?: boolean }>

async function executeItem(item: CampaignItem, ports: CampaignPorts, ledger: CampaignLedger, signal: AbortSignal | undefined, context: Readonly<{ browser: BrowserSession | null; fixture: FixtureSession | null; remainingMs: () => number; lastBrowserItem: boolean; now: () => number }>): Promise<Executed> {
  switch (item.port) {
    case 'analysis': {
      if (!ports.analysis) return { result: blocked('no production-path analysis port on this host'), scenario: item.prompt || '' }
      const outcome = await ports.analysis(item.prompt || '', signal)
      if (signal?.aborted) return { result: blocked('interrupted'), scenario: item.prompt || '', interrupted: true }
      const judged = await judgeAnalysis(item.prompt || '', outcome, ports.outcomeJudge)
      return { scenario: item.prompt || '', servedCommit: outcome.servedCommit, requestMs: outcome.latencyMs, result: { ...judged, correlationId: outcome.correlationId, evidence: analysisEvidence(outcome) } }
    }
    case 'routing': {
      if (!ports.routing) return { result: blocked('no routing read-back port on this host'), scenario: item.prompt || '' }
      const { outcome, enteredBuilder } = await ports.routing(item.prompt || '', signal)
      if (signal?.aborted) return { result: blocked('interrupted'), scenario: item.prompt || '', interrupted: true }
      const judged = await judgeAnalysis(item.prompt || '', outcome, ports.outcomeJudge)
      const evidence = [...analysisEvidence(outcome), { kind: 'record' as const, label: 'Routing', detail: enteredBuilder ? 'entered Builder as coding work' : 'answered as analysis, no Builder job' }]
      if (enteredBuilder) return { scenario: item.prompt || '', servedCommit: outcome.servedCommit, requestMs: outcome.latencyMs, result: { verdict: 'FAIL', actual: 'The investigation entered the Builder as coding work.', correlationId: outcome.correlationId, evidence, failureCause: 'misrouted to Builder' } }
      return { scenario: item.prompt || '', servedCommit: outcome.servedCommit, requestMs: outcome.latencyMs, result: { ...judged, correlationId: outcome.correlationId, evidence } }
    }
    case 'fault': {
      const result = ports.fault ? await ports.fault(item.fault!, ledger.productionCommit, signal) : blocked('no isolated fault-injection port on this host')
      return { scenario: `fault: ${item.fault}`, result, interrupted: Boolean(ports.fault && signal?.aborted) }
    }
    case 'browser': {
      if (!ports.browser) return { result: blocked('no browser runner on this host'), scenario: `browser workflow ${item.id}` }
      // A session from an earlier slice continues only when it is this item's; a finished item's session keeps the
      // sandbox, and the next item gets its own request token (Codex on #4980: a shared token made PAC-15 count PAC-14's request).
      const session = context.browser?.testId === item.id ? context.browser : context.browser ? newBrowserSession(item.id, context.now(), context.browser.sandboxName) : null
      const outcome = await ports.browser(item.id, session, { remainingMs: context.remainingMs, last: context.lastBrowserItem }, signal)
      if (signal?.aborted) return { result: blocked('interrupted'), scenario: `browser workflow ${item.id}`, interrupted: true, browser: outcome.session }
      if (outcome.status === 'pending') return { result: blocked('pending'), scenario: `browser workflow ${item.id}`, pending: true, browser: outcome.session }
      return { scenario: `browser workflow ${item.id}`, result: outcome.result, browser: outcome.session }
    }
    case 'observability': {
      const ids = ledger.rows.map(r => r.correlationId).filter((id): id is string => Boolean(id))
      const result = ports.observability ? await ports.observability(ids, signal) : blocked('no production trace read-back port on this host')
      return { scenario: `trace of ${ids.length} executed request(s)`, result, interrupted: Boolean(ports.observability && signal?.aborted) }
    }
    case 'governance': {
      const ids = ledger.rows.map(r => r.correlationId).filter((id): id is string => Boolean(id))
      const result = ports.governance ? await ports.governance(ids, ledger.startedAt, signal) : blocked('no governance read-back port on this host')
      return { scenario: 'budget and deadline records of this campaign\'s requests', result, interrupted: Boolean(ports.governance && signal?.aborted) }
    }
    case 'builder_fixture': {
      if (!ports.builderFixture) return { result: blocked('no Builder fixture port on this host'), scenario: 'disposable fixture with one deliberately failing test' }
      const outcome = await ports.builderFixture(context.fixture, { remainingMs: context.remainingMs }, signal)
      if (signal?.aborted) return { result: blocked('interrupted'), scenario: 'disposable fixture with one deliberately failing test', interrupted: true, fixture: outcome.session }
      if (outcome.status === 'pending') return { result: blocked('pending'), scenario: 'disposable fixture with one deliberately failing test', pending: true, fixture: outcome.session }
      return { scenario: 'disposable fixture with one deliberately failing test', result: outcome.result, fixture: null }
    }
    case 'release': {
      const result = ports.release ? await ports.release(ledger.productionCommit, signal) : blocked('no release-check port on this host')
      return { scenario: `release checks for ${ledger.productionCommit || 'unknown commit'}`, result, interrupted: Boolean(ports.release && signal?.aborted) }
    }
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
  /**
   * Called after every recorded check and every reliability request, so the owner sees results as they happen. A
   * failed progress write never fails the campaign: the checkpoint at the end of the slice still records everything.
   */
  progress?: (snapshot: Readonly<{ ledger: CampaignLedger; reliability: ReliabilityProgress | null }>) => Promise<void>
}>): Promise<CampaignState & { stopped: 'complete' | 'budget' | 'aborted' }> {
  const now = input.now ?? (() => Date.now())
  let ledger = input.state.ledger
  let reliability = input.state.reliability
  let longestRequestMs = input.state.longestRequestMs ?? 0
  let shortestRequestMs = input.state.shortestRequestMs ?? 0
  let interruptedItem: string | null = input.state.interruptedItem ?? null
  let browser: BrowserSession | null = input.state.browser ?? null
  let fixture: FixtureSession | null = input.state.fixture ?? null
  const browserItems = input.catalog.filter(item => item.port === 'browser').map(item => item.id)
  const noteRequest = (ms: number | undefined) => {
    if (typeof ms !== 'number' || ms <= 0) return
    if (ms > longestRequestMs) longestRequestMs = ms
    if (!shortestRequestMs || ms < shortestRequestMs) shortestRequestMs = ms
  }
  const reserveFor = (testId: string) => itemReserveMs({ shortestRequestMs, longestRequestMs }, interruptedItem === testId)
  const state = (stopped: 'complete' | 'budget' | 'aborted', progress: ReliabilityProgress | null = reliability, interrupted: string | null = null) =>
    ({ ledger, reliability: progress, shortestRequestMs, longestRequestMs, interruptedItem: interrupted, browser, fixture, stopped })
  const report = async (progress: ReliabilityProgress | null = reliability, snapshot: CampaignLedger = ledger) => {
    if (!input.progress) return
    try { await input.progress({ ledger: snapshot, reliability: progress }) } catch { /* the slice checkpoint still records it */ }
  }
  if (!ledger.mainCommit || !ledger.productionCommit) {
    const facts = await input.ports.deployment()
    ledger = {
      ...ledger,
      mainCommit: ledger.mainCommit ?? facts.mainCommit,
      // The revision the live site reports serving, read without a model call, so the checks that need it can run first.
      productionCommit: ledger.productionCommit ?? facts.productionCommit ?? null,
    }
  }
  // Checks that never call the production model run first and side by side; they need the production revision.
  const parallelReady = () => Boolean(ledger.productionCommit)
  const runParallelGroup = async (): Promise<'ok' | 'budget' | 'aborted'> => {
    const group = parallelReady() ? pendingItems(ledger, input.catalog).filter(item => PAC_PARALLEL_PORTS.has(item.port)) : []
    if (!group.length) return 'ok'
    if (input.remainingMs() < CAMPAIGN_ITEM_RESERVE_MS) return 'budget'
    const base = ledger
    const context = { browser, fixture, remainingMs: input.remainingMs, lastBrowserItem: false, now }
    // Complete the five independent checks concurrently, but publish each receipt as it arrives.
    // Serialize the database writes: a slower previous status write must not overwrite newer progress.
    let progressWrite = Promise.resolve()
    const results = await Promise.all(group.map(async item => {
      const executedAt = new Date(now()).toISOString()
      const executed = await executeItem(item, input.ports, base, input.signal, context)
      if (!executed.interrupted && !input.signal?.aborted) {
        ledger = { ...ledger, rows: [...ledger.rows, row(item, ledger, executedAt, now, executed.result, executed.scenario)] }
        const snapshot = ledger
        progressWrite = progressWrite.then(() => report(reliability, snapshot))
      }
      return { item, executedAt, executed }
    }))
    await progressWrite
    return results.some(result => result.executed.interrupted) || input.signal?.aborted ? 'aborted' : 'ok'
  }
  // Analytical and routing checks: CAMPAIGN_MODEL_CONCURRENCY requests in flight; a new one starts as soon as one ends,
  // and only while the slice still has an item's reserve. Each result is recorded and published the moment it arrives.
  // One ordered writer for every status update of this slice: checks finishing side by side (model lane, Builder fixture)
  // must never let a slower earlier write replace a newer status.
  let publishing = Promise.resolve()
  const publish = (progress: ReliabilityProgress | null, snapshot: CampaignLedger) => { publishing = publishing.then(() => report(progress, snapshot)) }
  // The model check a slice cut, so the next slice starts it only when its longest-request reserve fits.
  let cutItem: string | null = null
  const runModelLane = async (): Promise<'ok' | 'budget' | 'aborted'> => {
    const queue = pendingItems(ledger, input.catalog).filter(item => PAC_MODEL_LANE_PORTS.has(item.port))
    if (!queue.length) return 'ok'
    let stop = null as 'budget' | 'aborted' | null
    const context = { browser, fixture, remainingMs: input.remainingMs, lastBrowserItem: false, now }
    const worker = async () => {
      for (;;) {
        if (stop) return
        if (input.signal?.aborted) { stop = 'aborted'; return }
        const item = queue[0]
        if (!item) return
        if (input.remainingMs() < reserveFor(item.id)) { stop = stop ?? 'budget'; return }
        queue.shift()
        const executedAt = new Date(now()).toISOString()
        const executed = await executeItem(item, input.ports, ledger, input.signal, context)
        // Cut by the slice deadline: not a production result; it runs again in the next slice.
        if (executed.interrupted || input.signal?.aborted) { stop = 'aborted'; cutItem = cutItem ?? item.id; return }
        if (interruptedItem === item.id) interruptedItem = null
        noteRequest(executed.requestMs)
        ledger = noteServedRevision(ledger, executed.servedCommit ?? null)
        ledger = { ...ledger, rows: [...ledger.rows, row(item, ledger, executedAt, now, executed.result, executed.scenario)] }
        publish(reliability, ledger)
      }
    }
    await Promise.all(Array.from({ length: Math.min(CAMPAIGN_MODEL_CONCURRENCY, queue.length) }, () => worker()))
    await publishing
    return stop ?? 'ok'
  }
  // PAC-18 runs the Builder's own coding model in its own sandbox, not the answer path the model checks measure, so it
  // starts together with them instead of waiting for them (production 2026-11-01: 9.7 min that ran alone at the end).
  // A fixture run that paused at its slice boundary hands the slice back, as it does when it runs in order.
  let fixturePaused = false
  const runFixtureAlongside = async (): Promise<'ok' | 'pending' | 'aborted' | null> => {
    const pending = pendingItems(ledger, input.catalog)
    const item = pending.find(candidate => candidate.port === 'builder_fixture')
    if (!item || !pending.some(candidate => PAC_MODEL_LANE_PORTS.has(candidate.port))) return null
    if (input.remainingMs() < reserveFor(item.id)) return null
    const executedAt = new Date(now()).toISOString()
    const executed = await executeItem(item, input.ports, ledger, input.signal, { browser, fixture, remainingMs: input.remainingMs, lastBrowserItem: false, now })
    if (executed.fixture !== undefined) fixture = executed.fixture
    if (executed.interrupted) return 'aborted'
    if (executed.pending) { fixturePaused = true; return 'pending' }
    ledger = { ...ledger, rows: [...ledger.rows, row(item, ledger, executedAt, now, executed.result, executed.scenario)] }
    publish(reliability, ledger)
    return 'ok'
  }
  for (;;) {
    const grouped = await runParallelGroup()
    if (grouped === 'aborted') return state('aborted', reliability)
    if (grouped === 'budget') return state('budget')
    const [modelLane, fixtureAlongside] = await Promise.all([runModelLane(), runFixtureAlongside()])
    await publishing
    if (modelLane === 'aborted' || fixtureAlongside === 'aborted') return state('aborted', reliability, cutItem)
    if (modelLane === 'budget') return state('budget')
    const item = pendingItems(ledger, input.catalog).find(candidate => !(parallelReady() && PAC_PARALLEL_PORTS.has(candidate.port)))
    if (!item) break
    if (item.port === 'builder_fixture' && fixturePaused) return state('budget')
    if (input.signal?.aborted) return state('aborted', reliability, item.id)
    if (input.remainingMs() < reserveFor(item.id)) return state('budget')
    const executedAt = new Date(now()).toISOString()
    if (item.port === 'reliability') {
      if (!input.ports.analysis) {
        ledger = { ...ledger, rows: [...ledger.rows, row(item, ledger, executedAt, now, blocked('no production-path analysis port on this host'), 'reliability loop')] }
        continue
      }
      const required = item.count ?? 20
      const prompts = input.reliabilityPrompts?.length ? input.reliabilityPrompts : [item.prompt || '']
      let progress: ReliabilityProgress = reliability?.testId === item.id ? reliability : { testId: item.id, completed: 0, correlationIds: [] }
      // Assigned inside the request workers below, so its declared type is kept (no narrowing to the initial null).
      let failure = null as Readonly<{ at: number; verdict: CampaignVerdict; cause: string; evidence: CampaignEvidence[]; correlationId: string | null }> | null
      // The requests run CAMPAIGN_MODEL_CONCURRENCY at a time, but they count in order: progress is the run of verified
      // completions from the first request, and the first one that is not verified ends the qualification. Results past
      // that point, or past a slice cut, are not counted; an unfinished request runs again in the next slice.
      const results = new Map<number, Readonly<{ outcome: AnalysisOutcome; judged: Awaited<ReturnType<typeof judgeAnalysis>> }>>()
      let nextIndex = progress.completed
      let stop = null as 'budget' | 'aborted' | null
      let progressWrite = Promise.resolve()
      const advance = () => {
        while (!failure && results.has(progress.completed)) {
          const { outcome, judged } = results.get(progress.completed)!
          results.delete(progress.completed)
          if (judged.verdict !== 'PASS') {
            failure = { at: progress.completed + 1, verdict: judged.verdict, cause: judged.failureCause || judged.actual, evidence: analysisEvidence(outcome), correlationId: outcome.correlationId }
            return
          }
          progress = { ...progress, completed: progress.completed + 1, correlationIds: [...progress.correlationIds, ...(outcome.correlationId ? [outcome.correlationId] : [])] }
          const snapshot = progress
          progressWrite = progressWrite.then(() => report(snapshot))
        }
      }
      const worker = async () => {
        for (;;) {
          if (stop || failure || nextIndex >= required) return
          if (input.signal?.aborted) { stop = 'aborted'; return }
          if (input.remainingMs() < reserveFor(item.id)) { stop = stop ?? 'budget'; return }
          const index = nextIndex++
          const prompt = prompts[index % prompts.length]
          const outcome = await input.ports.analysis!(prompt, input.signal)
          if (input.signal?.aborted) { stop = 'aborted'; return }
          if (interruptedItem === item.id) interruptedItem = null
          noteRequest(outcome.latencyMs)
          ledger = noteServedRevision(ledger, outcome.servedCommit)
          const judged = await judgeAnalysis(prompt, outcome, input.ports.outcomeJudge)
          results.set(index, { outcome, judged })
          advance()
        }
      }
      await Promise.all(Array.from({ length: Math.min(CAMPAIGN_MODEL_CONCURRENCY, required - progress.completed) }, () => worker()))
      await progressWrite
      if (!failure && progress.completed < required) return state(stop === 'aborted' ? 'aborted' : 'budget', progress, stop === 'aborted' ? item.id : null)
      const result: PortResult = failure
        ? failure.verdict === 'BLOCKED'
          ? { verdict: 'BLOCKED', actual: `Request ${failure.at} of ${required} could not be graded (${failure.cause}); ${failure.at - 1} consecutive verified completions before it.`, correlationId: failure.correlationId, evidence: [{ kind: 'record', label: 'Consecutive completions', detail: `${failure.at - 1} of ${required}` }, ...failure.evidence], failureCause: failure.cause }
          : { verdict: 'FAIL', actual: `Request ${failure.at} of ${required} did not produce a complete analysis; ${failure.at - 1} consecutive completions before it.`, correlationId: failure.correlationId, evidence: [{ kind: 'record', label: 'Consecutive completions', detail: `${failure.at - 1} of ${required}` }, ...failure.evidence], failureCause: failure.cause }
        : { verdict: 'PASS', actual: `${required} of ${required} consecutive analytical requests completed with every deliverable delivered.`, correlationId: progress.correlationIds.at(-1) ?? null, evidence: [{ kind: 'record', label: 'Consecutive completions', detail: `${required} of ${required}; correlation ids: ${progress.correlationIds.join(', ') || 'none recorded'}` }] }
      ledger = { ...ledger, rows: [...ledger.rows, row(item, ledger, executedAt, now, result, `reliability loop: ${required} requests over ${prompts.length} prompt(s)`)] }
      reliability = null
      await report()
      continue
    }
    const executed = await executeItem(item, input.ports, ledger, input.signal, { browser, fixture, remainingMs: input.remainingMs, lastBrowserItem: browserItems.at(-1) === item.id, now })
    if (executed.browser !== undefined) browser = executed.browser
    if (executed.fixture !== undefined) fixture = executed.fixture
    if (executed.interrupted) return state('aborted', reliability, item.id)
    // A browser check waiting for the page hands the slice back; the next slice continues the same session.
    if (executed.pending) return state('budget')
    interruptedItem = null
    noteRequest(executed.requestMs)
    ledger = noteServedRevision(ledger, executed.servedCommit ?? null)
    ledger = { ...ledger, rows: [...ledger.rows, row(item, ledger, executedAt, now, executed.result, executed.scenario)] }
    await report()
  }
  return state('complete')
}

export function emptyCampaignLedger(campaignId: string, now = Date.now()): CampaignLedger {
  return { campaignId, productionCommit: null, mainCommit: null, revisionChanges: [], startedAt: new Date(now).toISOString(), rows: [] }
}
