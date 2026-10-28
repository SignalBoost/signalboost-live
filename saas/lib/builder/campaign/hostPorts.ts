// saas/lib/builder/campaign/hostPorts.ts
//
// THE iTMounts HOST'S PORTS FOR A VERIFICATION CAMPAIGN. Every check runs against the real production path, never
// in-process shortcuts: an analysis is one HTTP request to the public Concierge ingress of the live site, judged by
// what the production path returned; the deployed commit is read from the deployment and compared with the
// repository's main; release checks are read from GitHub for that commit; a request's trace is read back from the
// production records by the turn id the production path returned. The one in-process port is fault injection: the
// brief requires faults in isolation on the same release artifact, so the job runs the deployed reasoner in its own
// async scope against a controlled provider stub (faults.ts); no user request and no real provider is touched.
// The browser checks (PAC-13..15) drive the live site through the Builder's own Vercel Sandbox + Playwright CLI port
// (browserChecks.ts); the sandbox is named and kept across slices so a two-minute answer can be waited for. Ports
// this host does not yet provide (governance read-back, the Builder fixture) are left undefined so their items are
// BLOCKED with that cause.
//
// Credentials are read from the environment inside the job; nothing here logs or returns them.

import { PUBLIC_BRAND } from '../../public-brand.ts'
import { cosServiceDb } from '../../cos-core/storage/supabase.ts'
import type { AnalysisOutcome, CampaignPorts, PortResult } from './ports.ts'
import { withInferenceTransport } from '../../ai/inferenceTransport.ts'
import { runWithTurnDeadline } from '../../ai/cos/cosTurnBudget.ts'
import { createFaultStub, judgeFault, FAULT_PROMPT, FAULT_TURN_DEADLINE_MS, type CampaignFault } from './faults.ts'
import { newBrowserSession, runBrowserCheck, BROWSER_SLICE_RESERVE_MS, type BrowserDriver, type BrowserSession, type DriverStep } from './browserChecks.ts'
import { createBuilderPlaywrightCliPort, type VercelSandboxPlaywrightCliPort } from '../playwright-cli-port.ts'

const GITHUB_API = 'https://api.github.com/repos/SignalBoost/signalboost-live'
/** The live site reports the revision serving each response in this header (app/api/cos-browser/route.ts). */
export const SERVING_REVISION_HEADER = 'x-itmounts-revision'
/** One production request may take the whole browser-turn window plus the page's margin. */
export const CAMPAIGN_REQUEST_TIMEOUT_MS = 180_000

function githubHeaders(): Record<string, string> | null {
  const token = String(process.env.GITHUB_TOKEN || process.env.GITHUB_WRITE_TOKEN || '').trim()
  if (!token) return null
  return { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'itmounts-verification-campaign' }
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/** One real request on the production path: the public Concierge ingress of the live site. */
export async function productionAnalysis(prompt: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<AnalysisOutcome> {
  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetchImpl(`${PUBLIC_BRAND.siteUrl}/api/cos-browser`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], context: { language: 'en', surface: 'concierge' } }),
      signal: withTimeout(signal, CAMPAIGN_REQUEST_TIMEOUT_MS),
    })
  } catch {
    return { status: null, ok: false, reply: '', source: 'request_not_completed', correlationId: null, latencyMs: Date.now() - startedAt, servedCommit: null, model: null, localModelInvoked: null, executionAllowed: null }
  }
  const payload = await response.json().catch(() => ({})) as Record<string, any>
  const provenance = payload?.execution_provenance && typeof payload.execution_provenance === 'object' ? payload.execution_provenance : {}
  const reply = typeof payload?.reply === 'string' ? payload.reply : ''
  const source = String(payload?.source || '')
  // ok is what the production path says; when it says nothing, a released reply with a 200 is ok.
  const ok = typeof payload?.ok === 'boolean' ? payload.ok : response.ok && Boolean(reply.trim()) && !payload?.error
  return {
    status: response.status,
    ok,
    reply,
    source,
    correlationId: typeof provenance?.turnId === 'string' ? provenance.turnId : null,
    latencyMs: Date.now() - startedAt,
    servedCommit: response.headers.get(SERVING_REVISION_HEADER)?.trim() || null,
    model: typeof provenance?.local_reasoning?.model === 'string' ? provenance.local_reasoning.model : typeof provenance?.reasonerLabel === 'string' ? provenance.reasonerLabel : null,
    localModelInvoked: typeof payload?.local_model_invoked === 'boolean' ? payload.local_model_invoked : null,
    executionAllowed: typeof payload?.execution_allowed === 'boolean' ? payload.execution_allowed : null,
  }
}

/** The same request, plus whether the production path turned it into a Builder job. */
export async function productionRouting(prompt: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch) {
  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetchImpl(`${PUBLIC_BRAND.siteUrl}/api/cos-browser`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], context: { language: 'en', surface: 'concierge' } }),
      signal: withTimeout(signal, CAMPAIGN_REQUEST_TIMEOUT_MS),
    })
  } catch {
    return { outcome: { status: null, ok: false, reply: '', source: 'request_not_completed', correlationId: null, latencyMs: Date.now() - startedAt, servedCommit: null, model: null, localModelInvoked: null, executionAllowed: null } as AnalysisOutcome, enteredBuilder: false }
  }
  const payload = await response.json().catch(() => ({})) as Record<string, any>
  const enteredBuilder = (response.status === 202 && typeof payload?.jobId === 'string') || payload?.specialist_family === 'software'
  const provenance = payload?.execution_provenance && typeof payload.execution_provenance === 'object' ? payload.execution_provenance : {}
  const reply = typeof payload?.reply === 'string' ? payload.reply : ''
  const source = String(payload?.source || '')
  const outcome: AnalysisOutcome = {
    status: response.status,
    ok: typeof payload?.ok === 'boolean' ? payload.ok : response.ok && Boolean(reply.trim()) && !payload?.error,
    reply, source,
    correlationId: typeof provenance?.turnId === 'string' ? provenance.turnId : null,
    latencyMs: Date.now() - startedAt,
    servedCommit: response.headers.get(SERVING_REVISION_HEADER)?.trim() || null,
    model: typeof provenance?.local_reasoning?.model === 'string' ? provenance.local_reasoning.model : null,
    localModelInvoked: typeof payload?.local_model_invoked === 'boolean' ? payload.local_model_invoked : null,
    executionAllowed: typeof payload?.execution_allowed === 'boolean' ? payload.execution_allowed : null,
  }
  return { outcome, enteredBuilder }
}

/**
 * The repository's current main. The production commit is never taken from this worker's environment (Codex on
 * #4973: a campaign started from a preview would attribute production evidence to the preview); it is what the live
 * site reports serving each request.
 */
export async function deploymentFacts(fetchImpl: typeof fetch = fetch): Promise<Readonly<{ mainCommit: string | null }>> {
  const headers = githubHeaders()
  let mainCommit: string | null = null
  if (headers) {
    try {
      const response = await fetchImpl(`${GITHUB_API}/commits/main`, { headers, signal: AbortSignal.timeout(15_000) })
      const payload = await response.json().catch(() => ({})) as Record<string, any>
      mainCommit = response.ok && typeof payload?.sha === 'string' ? payload.sha : null
    } catch { mainCommit = null }
  }
  return { mainCommit }
}

/** GitHub check runs for the deployed commit: PASS only when checks exist and none failed or is pending. */
export async function releaseChecks(productionCommit: string | null, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<PortResult> {
  if (!productionCommit) return { verdict: 'BLOCKED', actual: 'The deployed commit is unknown, so its checks cannot be read.', evidence: [], failureCause: 'deployed commit unknown' }
  const headers = githubHeaders()
  if (!headers) return { verdict: 'BLOCKED', actual: 'No GitHub read credential is available to this job.', evidence: [], failureCause: 'no GitHub read credential' }
  let runs: any
  try {
    const response = await fetchImpl(`${GITHUB_API}/commits/${productionCommit}/check-runs?per_page=100`, { headers, signal: withTimeout(signal, 20_000) })
    runs = await response.json().catch(() => ({}))
    if (!response.ok) return { verdict: 'BLOCKED', actual: `GitHub returned HTTP ${response.status} for the commit's checks.`, evidence: [], failureCause: `GitHub HTTP ${response.status}` }
  } catch {
    return { verdict: 'BLOCKED', actual: 'The checks request did not complete.', evidence: [], failureCause: 'GitHub request not completed' }
  }
  const checkRuns: any[] = Array.isArray(runs?.check_runs) ? runs.check_runs : []
  if (!checkRuns.length) return { verdict: 'FAIL', actual: 'No checks have reported on the deployed commit.', evidence: [], failureCause: 'no checks reported' }
  const pending = checkRuns.filter(run => String(run?.status || '') !== 'completed').map(run => String(run?.name || 'unnamed'))
  const failed = checkRuns.filter(run => String(run?.status || '') === 'completed' && !['success', 'neutral', 'skipped'].includes(String(run?.conclusion || ''))).map(run => `${run?.name || 'unnamed'} (${run?.conclusion || 'none'})`)
  const evidence = [{ kind: 'check_run' as const, label: 'Check runs', detail: `${checkRuns.length} runs on ${productionCommit.slice(0, 7)}; failed: ${failed.length}; pending: ${pending.length}` }]
  if (failed.length) return { verdict: 'FAIL', actual: `Checks failed: ${failed.slice(0, 6).join(', ')}.`, evidence, failureCause: 'failed checks' }
  if (pending.length) return { verdict: 'BLOCKED', actual: `Checks still pending: ${pending.slice(0, 6).join(', ')}.`, evidence, failureCause: 'pending checks' }
  return { verdict: 'PASS', actual: `All ${checkRuns.length} checks on the deployed commit concluded green.`, evidence }
}

/** The production trace of each executed request, read back by the turn id the production path returned. */
export async function productionTrace(correlationIds: readonly string[]): Promise<PortResult> {
  if (!correlationIds.length) return { verdict: 'BLOCKED', actual: 'No executed request carried a turn id to trace.', evidence: [], failureCause: 'no turn ids' }
  const db = cosServiceDb()
  if (!db) return { verdict: 'BLOCKED', actual: 'The production records are not reachable from this job.', evidence: [], failureCause: 'records unavailable' }
  const { data, error } = await db.from('cos_turn_experience')
    .select('turn_id,reasoner_label,model_calls,model_call_ms,answered,route_class,response_source,failure_reason,created_at')
    .in('turn_id', [...correlationIds])
  if (error) return { verdict: 'BLOCKED', actual: `The trace read failed: ${error.message}.`, evidence: [], failureCause: 'trace read failed' }
  const rows = Array.isArray(data) ? data : []
  const found = new Set(rows.map((row: any) => String(row.turn_id)))
  const missing = correlationIds.filter(id => !found.has(id))
  const evidence = rows.slice(0, 25).map((row: any) => ({
    kind: 'record' as const,
    label: `Turn ${String(row.turn_id).slice(0, 8)}`,
    detail: `model=${row.reasoner_label || '-'} calls=${row.model_calls ?? '-'} model_ms=${row.model_call_ms ?? '-'} answered=${row.answered} route=${row.route_class || '-'} source=${row.response_source || '-'}${row.failure_reason ? ' reason=' + String(row.failure_reason).slice(0, 120) : ''}`,
  }))
  if (missing.length) return { verdict: 'FAIL', actual: `${missing.length} of ${correlationIds.length} executed requests have no production trace.`, evidence, failureCause: `untraced turns: ${missing.map(id => id.slice(0, 8)).join(', ')}` }
  const incomplete = rows.filter((row: any) => !row.reasoner_label || row.model_calls === null)
  if (incomplete.length) return { verdict: 'FAIL', actual: `${incomplete.length} trace(s) lack the model and call record.`, evidence, failureCause: 'incomplete trace' }
  return { verdict: 'PASS', actual: `Every executed request (${correlationIds.length}) has a production trace with model, call count, timing, routing and outcome.`, evidence }
}

/**
 * One fault, in isolation: the deployed reasoner runs in this job's async scope with a controlled provider stub as
 * its only provider and a fixed turn deadline. The stub records every call; the judge (faults.ts) decides. The code
 * that runs is this worker's own revision, so the check certifies production only when that revision IS the
 * production revision under test (Codex on #4977: a preview worker must not certify production with code it lacks).
 */
export async function isolatedFault(fault: CampaignFault, productionCommit: string | null, signal?: AbortSignal, workerRevision: string | null = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim() || null): Promise<PortResult> {
  if (!productionCommit || !workerRevision || workerRevision !== productionCommit) {
    return {
      verdict: 'BLOCKED',
      actual: `this worker runs revision ${workerRevision || 'unknown'}, the production revision under test is ${productionCommit || 'unknown'}; the fault check only certifies the revision it runs`,
      evidence: [{ kind: 'note', label: 'revision', detail: `worker=${workerRevision || 'unknown'} production=${productionCommit || 'unknown'}` }],
      failureCause: 'worker_revision_differs',
    }
  }
  // The reasoner module needs the Next runtime; load it only when a fault actually runs so the host's other ports
  // stay loadable outside it.
  const { callRawCosReasoner, resolveCosReasoner } = await import('../../ai/cos/cosReasoner.ts')
  if (!resolveCosReasoner().config) return { verdict: 'BLOCKED', actual: 'no COS reasoner is configured on this host', evidence: [], failureCause: 'reasoner_not_configured' }
  const stub = createFaultStub(fault)
  const startedAt = Date.now()
  let released: string | null = null
  let escaped: string | null = null
  try {
    const reasoned = await withInferenceTransport(stub.transport, () => runWithTurnDeadline(startedAt + FAULT_TURN_DEADLINE_MS, () => callRawCosReasoner({
      usageContext: { feature: 'cos_interactive_answer', purpose: 'verification_campaign_fault' },
      writesUserAnswer: true,
      temperature: 0,
      maxTokens: 1800,
      systemPrompt: 'You are COS. Return ONLY strict JSON: {"answer":"...","confidence":0.0}.',
      prompt: FAULT_PROMPT,
      signal,
    })))
    released = reasoned?.text ?? null
  } catch (error) {
    escaped = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  }
  return judgeFault({ fault, calls: stub.calls(), released, escaped, elapsedMs: Date.now() - startedAt })
}

/** The browser sandbox lives long enough for the three checks in sequence, each waited for across slices. */
export const BROWSER_SANDBOX_LIFETIME_MS = 30 * 60_000

function driverStep(observed: Awaited<ReturnType<VercelSandboxPlaywrightCliPort['invoke']>>): DriverStep {
  return { ok: observed.ok, stdout: observed.stdout, detail: `exit=${observed.exitCode}${observed.timedOut ? ' timeout' : ''}${observed.failureCode ? ` ${observed.failureCode}` : ''}` }
}

function cliDriver(port: VercelSandboxPlaywrightCliPort): BrowserDriver {
  return {
    open: async url => driverStep(await port.invoke({ action: 'open', url })),
    goto: async url => driverStep(await port.invoke({ action: 'goto', url })),
    fill: async (target, text) => driverStep(await port.invoke({ action: 'fill', target, text })),
    click: async target => driverStep(await port.invoke({ action: 'click', target })),
    find: async query => driverStep(await port.invoke({ action: 'find', query })),
    snapshot: async () => driverStep(await port.invoke({ action: 'snapshot' })),
    reload: async () => driverStep(await port.invoke({ action: 'reload' })),
    requests: async () => driverStep(await port.invoke({ action: 'requests' })),
    close: async () => driverStep(await port.invoke({ action: 'close' })),
  }
}

/** The test account the browser signs in with, from the job's environment; never logged or returned. */
function browserCredentials(): Readonly<{ email: string; password: string }> | null {
  const email = String(process.env.CAMPAIGN_BROWSER_LOGIN_EMAIL || '').trim()
  const password = String(process.env.CAMPAIGN_BROWSER_LOGIN_PASSWORD || '')
  return email && password ? { email, password } : null
}

/** How many user and assistant messages the production records hold for a request token. */
export async function requestRecords(token: string): Promise<Readonly<{ user: number; assistant: number }> | null> {
  const db = cosServiceDb()
  if (!db) return null
  const { data, error } = await db.from('assistant_messages').select('role').ilike('content', `%${token}%`)
  if (error || !Array.isArray(data)) return null
  return {
    user: data.filter(row => row.role === 'user').length,
    assistant: data.filter(row => row.role === 'assistant').length,
  }
}

/**
 * One browser check, continued across slices. The sandbox is created on the first call and named in the session so
 * the next slice attaches to it; it is stopped after the last browser item (or when a check cannot continue).
 */
export async function browserCheck(
  testId: string,
  session: BrowserSession | null,
  slice: Readonly<{ remainingMs: () => number; last: boolean }>,
  signal?: AbortSignal,
): Promise<Readonly<{ status: 'done'; result: PortResult; session: BrowserSession }> | Readonly<{ status: 'pending'; session: BrowserSession }>> {
  let current = session ?? newBrowserSession(testId, Date.now())
  const port = createBuilderPlaywrightCliPort({ ownerAuthorized: true, interactive: true, sandboxName: current.sandboxName, sandboxLifetimeMs: BROWSER_SANDBOX_LIFETIME_MS })
  const stop = async () => { await port.close().catch(() => undefined) }
  try {
    if (!current.sandboxName) {
      const name = await port.warm()
      current = { ...current, sandboxName: name, log: [...current.log, 'browser sandbox ready'] }
      // Bootstrapping took most of the slice: checkpoint the sandbox and start the actions in the next slice.
      if (slice.remainingMs() < 2 * BROWSER_SLICE_RESERVE_MS) { port.detach(); return { status: 'pending', session: current } }
    }
    const outcome = await runBrowserCheck({
      testId, session: current, driver: cliDriver(port), credentials: browserCredentials(), records: requestRecords,
      now: Date.now, remainingMs: slice.remainingMs,
      sleep: ms => new Promise<void>(resolve => { const timer = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true }) }),
    })
    if (outcome.status === 'pending' || !slice.last) port.detach()
    else await stop()
    return outcome
  } catch (error) {
    await stop()
    const cause = error instanceof Error ? error.message : String(error)
    return { status: 'done', session: { ...current, sandboxName: null }, result: { verdict: 'FAIL', actual: `browser runner failed: ${cause.slice(0, 200)}`, evidence: current.log.map((line, index) => ({ kind: 'browser' as const, label: `step ${index + 1}`, detail: line })), failureCause: cause.slice(0, 200) } }
  }
}

export function createCampaignHostPorts(): CampaignPorts {
  return {
    deployment: () => deploymentFacts(),
    analysis: (prompt, signal) => productionAnalysis(prompt, signal),
    routing: (prompt, signal) => productionRouting(prompt, signal),
    fault: (fault, productionCommit, signal) => isolatedFault(fault, productionCommit, signal),
    browser: (testId, session, slice, signal) => browserCheck(testId, session, slice, signal),
    release: (commit, signal) => releaseChecks(commit, signal),
    observability: ids => productionTrace(ids),
  }
}
