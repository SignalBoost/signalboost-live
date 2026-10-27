// saas/lib/builder/campaign/hostPorts.ts
//
// THE iTMounts HOST'S PORTS FOR A VERIFICATION CAMPAIGN. Every check runs against the real production path, never
// in-process shortcuts: an analysis is one HTTP request to the public Concierge ingress of the live site, judged by
// what the production path returned; the deployed commit is read from the deployment and compared with the
// repository's main; release checks are read from GitHub for that commit; a request's trace is read back from the
// production records by the turn id the production path returned. Ports this host does not yet provide (isolated
// fault injection, a browser runner with a test account, governance read-back, the Builder fixture) are left
// undefined so their items are BLOCKED with that cause.
//
// Credentials are read from the environment inside the job; nothing here logs or returns them.

import { PUBLIC_BRAND } from '../../public-brand.ts'
import { cosServiceDb } from '../../cos-core/storage/supabase.ts'
import type { AnalysisOutcome, CampaignPorts, PortResult } from './ports.ts'

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

export function createCampaignHostPorts(): CampaignPorts {
  return {
    deployment: () => deploymentFacts(),
    analysis: (prompt, signal) => productionAnalysis(prompt, signal),
    routing: (prompt, signal) => productionRouting(prompt, signal),
    release: (commit, signal) => releaseChecks(commit, signal),
    observability: ids => productionTrace(ids),
  }
}
