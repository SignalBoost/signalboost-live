// saas/lib/hub/pr-engine.ts
//
// The PR-style state machine for Hub Console infrastructure changes.
//
// Why this exists: provider actions normally fire the instant they are
// submitted. This layer inserts an approval gate that behaves like a GitHub PR
// or an outreach-approval queue: the AI stages the exact provider payloads, the
// owner reviews them as "Open Pull Requests", and execution only happens on an
// explicit Merge click.
//
// Crucially, this file does NOT re-implement any provider logic. On merge it
// REPLAYS each step through the existing, proven action routes:
//   • /api/hub/action          (Stripe, Supabase, Vercel, OpenAI, Anthropic, …)
//   • /api/hub/action/engine   (GitHub, ElevenLabs, Gemini, Resend, AssemblyAI, …)
// The merge call forwards the owner's auth cookie, so every step still passes
// the same permission + policy + audit checks it always did. Zero drift.
//
// Storage: the infrastructure_prs table, reached via the service-role admin
// client (same posture as the rest of the hub).

import { createClient } from '@supabase/supabase-js'
import { recordAuditEvent, normalizeStatus } from '@/lib/hub/audit'

// ── Types ───────────────────────────────────────────────────────────────────

export type InfraPRStatus = 'open' | 'merging' | 'merged' | 'failed' | 'closed'
export type InfraRisk = 'low' | 'medium' | 'high'

/** One provider call inside a PR. `templateId` must match a real hub template. */
export interface InfraPRStep {
  provider: string                    // e.g. 'vercel' (derived from templateId if omitted)
  templateId: string                  // e.g. 'vercel.set_env'
  label: string                       // human one-liner shown in the UI
  payload: Record<string, unknown>    // the exact inputs the executor needs
}

/** The outcome of one step, recorded at merge time. */
export interface InfraPRStepResult {
  templateId: string
  label: string
  ok: boolean
  message?: string
  error?: string
  data?: unknown
  ranAt: string
}

export interface InfraPR {
  id: string
  title: string
  summary: string
  status: InfraPRStatus
  risk: InfraRisk
  steps: InfraPRStep[]
  results: InfraPRStepResult[]
  created_by: string | null
  created_by_email: string | null
  approved_by: string | null
  error: string | null
  created_at: string
  updated_at: string
  merged_at: string | null
}

const TABLE = 'infrastructure_prs'

// Providers whose executors live on the portable engine route. Everything else
// (Stripe, Supabase, Vercel, OpenAI, Anthropic, AWS, GCP, Vault, …) goes to the
// legacy route, which holds the richest infra logic (Vercel env, Supabase sync).
const ENGINE_PROVIDERS = new Set([
  'github', 'elevenlabs', 'gemini', 'resend', 'assemblyai', 'supabase-marketing',
])

/** Decide which existing route fires a given templateId. */
export function resolveActionRoute(templateId: string): 'engine' | 'legacy' {
  const provider = String(templateId || '').split('.')[0].toLowerCase()
  return ENGINE_PROVIDERS.has(provider) ? 'engine' : 'legacy'
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function normalizeSteps(raw: unknown): { ok: boolean; steps?: InfraPRStep[]; error?: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'steps must be an array' }
  if (raw.length === 0) return { ok: false, error: 'at least one step is required' }
  if (raw.length > 25) return { ok: false, error: 'too many steps (max 25 per PR)' }
  const steps: InfraPRStep[] = []
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i] as Record<string, unknown>
    if (!s || typeof s !== 'object') return { ok: false, error: `step ${i + 1} is malformed` }
    const templateId = String(s.templateId || '').trim()
    if (!templateId || !templateId.includes('.')) {
      return { ok: false, error: `step ${i + 1} needs a templateId like "provider.action"` }
    }
    const payload = (s.payload && typeof s.payload === 'object') ? (s.payload as Record<string, unknown>) : {}
    steps.push({
      templateId,
      provider: String(s.provider || templateId.split('.')[0]),
      label: String(s.label || templateId).slice(0, 160),
      payload,
    })
  }
  return { ok: true, steps }
}

// ── Stage (create) ──────────────────────────────────────────────────────────

export async function stageInfrastructurePR(input: {
  title: string
  summary?: string
  steps: InfraPRStep[] | unknown
  risk?: InfraRisk
  createdBy?: string | null
  createdByEmail?: string | null
}): Promise<{ ok: boolean; pr?: InfraPR; error?: string }> {
  const db = admin()
  if (!db) return { ok: false, error: 'Supabase service role is not configured (SUPABASE_SERVICE_ROLE_KEY).' }

  const title = String(input.title || '').trim()
  if (!title) return { ok: false, error: 'title is required' }

  const norm = normalizeSteps(input.steps)
  if (!norm.ok || !norm.steps) return { ok: false, error: norm.error || 'invalid steps' }

  const risk: InfraRisk = (['low', 'medium', 'high'] as const).includes(input.risk as InfraRisk)
    ? (input.risk as InfraRisk)
    : 'medium'

  const { data, error } = await db
    .from(TABLE)
    .insert({
      title: title.slice(0, 160),
      summary: String(input.summary || '').slice(0, 4000),
      status: 'open',
      risk,
      steps: norm.steps,
      results: [],
      created_by: input.createdBy || null,
      created_by_email: input.createdByEmail || null,
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }

  await recordAuditEvent({
    actor: input.createdBy || 'console',
    action: 'pr.stage',
    status: normalizeStatus('SUCCESS'),
    message: `Staged infrastructure PR "${title}" (${norm.steps.length} step${norm.steps.length === 1 ? '' : 's'})`,
    metadata: { prId: (data as any)?.id, risk },
  }).catch(() => {})

  return { ok: true, pr: data as InfraPR }
}

// ── Read ────────────────────────────────────────────────────────────────────

export async function listInfrastructurePRs(
  status?: InfraPRStatus,
  limit = 50,
): Promise<{ ok: boolean; prs: InfraPR[]; error?: string }> {
  const db = admin()
  if (!db) return { ok: false, prs: [], error: 'Supabase service role is not configured.' }
  let q = db.from(TABLE).select('*').order('created_at', { ascending: false }).limit(Math.min(limit, 200))
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) return { ok: false, prs: [], error: error.message }
  return { ok: true, prs: (data || []) as InfraPR[] }
}

export async function getInfrastructurePR(
  id: string,
): Promise<{ ok: boolean; pr?: InfraPR; error?: string }> {
  const db = admin()
  if (!db) return { ok: false, error: 'Supabase service role is not configured.' }
  const { data, error } = await db.from(TABLE).select('*').eq('id', id).single()
  if (error || !data) return { ok: false, error: error?.message || 'PR not found' }
  return { ok: true, pr: data as InfraPR }
}

// ── Close (dismiss without running) ─────────────────────────────────────────

export async function closeInfrastructurePR(input: {
  id: string
  approvedBy?: string | null
}): Promise<{ ok: boolean; pr?: InfraPR; error?: string }> {
  const db = admin()
  if (!db) return { ok: false, error: 'Supabase service role is not configured.' }
  const { data, error } = await db
    .from(TABLE)
    .update({ status: 'closed', approved_by: input.approvedBy || null, updated_at: new Date().toISOString() })
    .eq('id', input.id)
    .in('status', ['open', 'failed'])
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message || 'PR could not be closed (it may already be merged).' }
  return { ok: true, pr: data as InfraPR }
}

// ── Merge (the authorization gate fires the live providers) ─────────────────

export async function mergeInfrastructurePR(input: {
  id: string
  approvedBy?: string | null
  origin: string                      // e.g. https://saas.signalboostapp.com
  cookie: string                      // forwarded so steps run as the owner
}): Promise<{ ok: boolean; pr?: InfraPR; error?: string }> {
  const db = admin()
  if (!db) return { ok: false, error: 'Supabase service role is not configured.' }

  const { id, origin, cookie } = input

  // Atomic lock: flip open → merging in a single conditional update. If another
  // click already moved it, the row won't match and we refuse — no double-fire.
  const { data: locked, error: lockErr } = await db
    .from(TABLE)
    .update({ status: 'merging', approved_by: input.approvedBy || null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'open')
    .select('*')
    .single()

  if (lockErr || !locked) {
    // Surface a precise reason by reading current state.
    const cur = await getInfrastructurePR(id)
    if (!cur.ok || !cur.pr) return { ok: false, error: 'PR not found' }
    if (cur.pr.status === 'merged') return { ok: false, error: 'This PR is already merged.' }
    if (cur.pr.status === 'merging') return { ok: false, error: 'A merge is already in progress for this PR.' }
    if (cur.pr.status === 'closed') return { ok: false, error: 'This PR is closed.' }
    if (cur.pr.status === 'failed') return { ok: false, error: 'This PR previously failed. Re-stage it to retry.' }
    return { ok: false, error: 'PR is no longer open.' }
  }

  const pr = locked as InfraPR
  const steps: InfraPRStep[] = Array.isArray(pr.steps) ? pr.steps : []
  const results: InfraPRStepResult[] = []
  let failed = false
  let failError = ''

  // Sequential, stop-on-first-failure. Order matters: e.g. set Vercel var →
  // sync Supabase → trigger redeploy. A later step never runs on a broken state.
  for (const step of steps) {
    const endpoint = resolveActionRoute(step.templateId) === 'engine'
      ? '/api/hub/action/engine'
      : '/api/hub/action'

    let result: InfraPRStepResult
    try {
      const r = await fetch(`${origin}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ templateId: step.templateId, payload: step.payload || {} }),
        cache: 'no-store',
      })
      const body = await r.json().catch(() => ({} as any))
      const ok = r.ok && body && body.ok !== false
      result = {
        templateId: step.templateId,
        label: step.label || step.templateId,
        ok,
        message: body?.message,
        error: ok ? undefined : (body?.error || `HTTP ${r.status}`),
        data: body?.data,
        ranAt: new Date().toISOString(),
      }
    } catch (err) {
      result = {
        templateId: step.templateId,
        label: step.label || step.templateId,
        ok: false,
        error: err instanceof Error ? err.message : 'request failed',
        ranAt: new Date().toISOString(),
      }
    }

    results.push(result)
    await recordAuditEvent({
      actor: input.approvedBy || 'console',
      action: `pr.merge:${step.templateId}`,
      status: normalizeStatus(result.ok ? 'SUCCESS' : 'FAILURE'),
      message: result.message || result.error || '',
      metadata: { prId: id },
    }).catch(() => {})

    if (!result.ok) { failed = true; failError = result.error || 'step failed'; break }
  }

  const finalStatus: InfraPRStatus = failed ? 'failed' : 'merged'
  const { data: done } = await db
    .from(TABLE)
    .update({
      status: finalStatus,
      results,
      error: failed ? failError : null,
      merged_at: failed ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  return {
    ok: !failed,
    pr: (done as InfraPR) || { ...pr, status: finalStatus, results, error: failed ? failError : null },
    error: failed ? `Merge stopped at a failing step: ${failError}` : undefined,
  }
}
