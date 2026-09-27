// saas/app/api/admin/runpod-endpoint-cleanup/route.ts
//
// Owner-only retirement of idle RunPod serverless endpoints that belong solely to quarantined mass-distilled
// artifacts. The canary/evaluation lanes create one endpoint per artifact and never delete it; ~400 accumulated
// and RunPod's endpoint listing started failing ("HTTP 500: failed to list endpoints"), which blocks every exam.
//
//   GET /api/admin/runpod-endpoint-cleanup
//       Dry run. Lists what would be deleted and why everything else is kept. Changes nothing.
//   GET /api/admin/runpod-endpoint-cleanup?execute=delete-quarantined-evaluation-endpoints&limit=40
//       Deletes up to `limit` eligible endpoints (max 100). Repeat until `remainingEligible` is 0.
//
// Every deletion is re-checked live against RunPod first (must be ours, mass-distilled, 0 min / 0 max workers),
// uses endpoint IDs from our own ledger so it never depends on the failing list call, and is recorded as an
// append-only host_controller event. The primary reasoner, the graduate runtime and non-mass endpoints are never
// eligible. No Production traffic or authority changes.
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/service-db'
import { configuredRunpodApiKey } from '@/lib/ai/cos/runpodConfig'
import {
  liveEndpointDeletable,
  planMassEndpointCleanup,
  type EndpointReference,
} from '@/lib/ai/cos/runpodEndpointCleanupPlan'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CONFIRM = 'delete-quarantined-evaluation-endpoints'
const REST_V1 = 'https://rest.runpod.io/v1'
const PAGE = 1000
const DEFAULT_LIMIT = 40
const MAX_LIMIT = 100

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

async function readEndpointReferences(db: any): Promise<EndpointReference[]> {
  const refs: EndpointReference[] = []
  for (let from = 0; ; from += PAGE) {
    const page = await db.from('cos_university_learning_assurance_events')
      .select('candidate_id,subject_id,observed_at,evidence')
      .eq('event_type', 'fine_tune')
      .not('evidence->>endpointId', 'is', null)
      .order('observed_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (page.error) throw page.error
    const rows = page.data || []
    for (const row of rows) {
      refs.push({
        endpointId: String(row?.evidence?.endpointId || '').trim(),
        candidateId: String(row?.candidate_id || '').trim(),
        subjectId: row?.subject_id ? String(row.subject_id) : null,
        observedAt: String(row?.observed_at || ''),
        retired: row?.evidence?.claim === 'mass_distilled_runtime_endpoint_deleted',
      })
    }
    if (rows.length < PAGE) break
  }
  return refs
}

async function readArtifactStatuses(db: any): Promise<Map<string, string>> {
  const statuses = new Map<string, string>()
  for (let from = 0; ; from += PAGE) {
    const page = await db.from('cos_local_distillation_artifacts')
      .select('candidate_id,status')
      .order('candidate_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (page.error) throw page.error
    const rows = page.data || []
    for (const row of rows) statuses.set(String(row.candidate_id), String(row.status))
    if (rows.length < PAGE) break
  }
  return statuses
}

async function readProtectedText(db: any): Promise<string[]> {
  // Anything the live graduate runtime or the graduate registry points at is never eligible.
  const text: string[] = [
    process.env.COS_GRADUATE_AI_BASE_URL || '',
    process.env.RUNPOD_PRIMARY_ENDPOINT_ID || '',
    process.env.RUNPOD_POD_ID || '',
  ]
  const registry = await db.from('cos_university_graduate_model_registry').select('*').limit(5000)
  if (registry.error) throw registry.error
  for (const row of registry.data || []) text.push(JSON.stringify(row))
  return text
}

async function runpod(path: string, method: 'GET' | 'DELETE') {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const response = await fetch(`${REST_V1}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  })
  const raw = await response.text()
  let body: any = null
  try { body = raw ? JSON.parse(raw) : null } catch { body = null }
  return { status: response.status, ok: response.ok, body }
}

export async function GET(req: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'service_database_unavailable' }, { status: 503 })

  const url = new URL(req.url)
  const execute = url.searchParams.get('execute') === CONFIRM
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(url.searchParams.get('limit')) || DEFAULT_LIMIT))

  try {
    const [references, statuses, protectedText] = await Promise.all([
      readEndpointReferences(db), readArtifactStatuses(db), readProtectedText(db),
    ])
    const plan = planMassEndpointCleanup({ references, artifactStatusByCandidate: statuses, protectedText, now: new Date() })

    if (!execute) {
      return NextResponse.json({
        ok: true,
        mode: 'dry_run',
        totalReferencedEndpoints: plan.totalReferencedEndpoints,
        eligible: plan.eligible.length,
        kept: plan.kept,
        sample: plan.eligible.slice(0, 20).map(item => ({ endpointId: item.endpointId, candidates: item.candidateIds, lastReferencedAt: item.lastReferencedAt })),
        howToExecute: `?execute=${CONFIRM}&limit=${DEFAULT_LIMIT}`,
      })
    }

    const results: Array<{ endpointId: string; outcome: string; detail?: string }> = []
    let deleted = 0
    for (const item of plan.eligible) {
      if (results.length >= limit) break
      const live = await runpod(`/endpoints/${encodeURIComponent(item.endpointId)}`, 'GET')
      const alreadyGone = live.status === 404
      if (!alreadyGone && !live.ok) { results.push({ endpointId: item.endpointId, outcome: 'skipped_lookup_failed', detail: `HTTP ${live.status}` }); continue }
      if (!alreadyGone && !liveEndpointDeletable(live.body)) {
        results.push({ endpointId: item.endpointId, outcome: 'skipped_not_idle_or_not_ours', detail: String(live.body?.name || '').slice(0, 120) })
        continue
      }
      if (!alreadyGone) {
        const removed = await runpod(`/endpoints/${encodeURIComponent(item.endpointId)}`, 'DELETE')
        if (!removed.ok && removed.status !== 404) {
          results.push({ endpointId: item.endpointId, outcome: 'delete_failed', detail: `HTTP ${removed.status}` })
          continue
        }
        deleted += 1
      }
      results.push({ endpointId: item.endpointId, outcome: alreadyGone ? 'already_gone' : 'deleted' })
      const evidence = {
        profile: 'cos_mass_distilled_runtime_endpoint_lifecycle_v1',
        claim: 'mass_distilled_runtime_endpoint_deleted',
        endpointId: item.endpointId,
        endpointName: String(live.body?.name || '').slice(0, 240),
        candidateIds: item.candidateIds,
        reason: alreadyGone ? 'already_absent_at_runpod' : 'idle_endpoint_of_quarantined_artifact',
        ownerDirected: true,
        productionTrafficAuthorized: false,
        authorityExpanded: false,
      }
      const write = await db.from('cos_university_learning_assurance_events').upsert({
        event_key: sha256(['mass_distilled_runtime_endpoint_deleted', item.endpointId].join('|')),
        event_type: 'fine_tune',
        subject_id: item.subjectId,
        candidate_id: item.candidateIds[0],
        evidence_hash: sha256(JSON.stringify(evidence)),
        evidence,
        verifier: 'host_controller',
        observed_at: new Date().toISOString(),
      }, { onConflict: 'event_key', ignoreDuplicates: true })
      if (write.error) console.error('[runpod-endpoint-cleanup] ledger write failed', write.error.message)
    }

    const processed = new Set(results.map(result => result.endpointId))
    return NextResponse.json({
      ok: true,
      mode: 'execute',
      deleted,
      processed: results.length,
      remainingEligible: plan.eligible.filter(item => !processed.has(item.endpointId)).length,
      results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[runpod-endpoint-cleanup]', message)
    return NextResponse.json({ ok: false, error: message.slice(0, 300) }, { status: 500 })
  }
}
