import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { runPrivateCapabilityCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'
import {
  buildBlindChiefOfStaffAcceptanceSuite,
  CHIEF_OF_STAFF_BLIND_PROFILE,
  evaluateBlindChiefOfStaffAcceptanceCase,
} from '@/lib/ai/cos/chiefOfStaffBlindAcceptance'
import { isFreshReleasedAcceptanceOutcome } from '@/lib/ai/cos/chiefOfStaffAcceptance'
import { evaluateChiefOfStaffReliability } from '@/lib/ai/cos/chiefOfStaffReliability'
import { attachTurnOutcome } from '@/lib/ai/cos/turnExperienceStore'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CASE_IDS:Record<string,string> = {
  'instruction-scope':'c05f1001-0000-4000-8000-000000000001',
  'evidence-boundary':'c05f1001-0000-4000-8000-000000000002',
  'routine-follow-through':'c05f1001-0000-4000-8000-000000000003',
  'truthful-status':'c05f1001-0000-4000-8000-000000000004',
}
const CASE_WORKER_ROLES = {
  'instruction-scope':'primary',
  'evidence-boundary':'verifier',
  'routine-follow-through':'primary',
  'truthful-status':'verifier',
} as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CASE_CLAIM_LEASE_MS = 150_000
const CASE_CLAIM_WAIT_ATTEMPTS = 20
const CASE_CLAIM_WAIT_MS = 500
const errorText = (error:unknown) => (error instanceof Error ? error.message : String(error ?? 'Unknown blind acceptance error')).slice(0, 1600)
type Db = NonNullable<ReturnType<typeof cosServiceDb>>
type StoredCase = { case_key:string; passed:boolean; turn_id:string|null; fresh_execution:boolean }

function canonicalJson(value:unknown):string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string,unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve, ms))

async function readBlindRun(db:Db, runId:string) {
  return db.from('cos_chief_of_staff_acceptance_runs')
    .select('id,profile,status,started_at,completed_at,gate_passed,observed_cases,dimensions,failures,error,variant_seed,case_manifest')
    .eq('id', runId).eq('profile', CHIEF_OF_STAFF_BLIND_PROFILE).maybeSingle()
}

async function readStoredCase(db:Db, runId:string, caseKey:string):Promise<StoredCase|null> {
  const result = await db.from('cos_chief_of_staff_acceptance_results')
    .select('case_key,passed,turn_id,fresh_execution')
    .eq('run_id', runId).eq('case_key', caseKey).maybeSingle()
  if (result.error) throw result.error
  return result.data as StoredCase|null
}

async function attachStoredOutcome(row:StoredCase|null):Promise<void> {
  if (!row?.turn_id) return
  await attachTurnOutcome(row.turn_id, {
    verifiedSuccess:row.passed,
    repairNeeded:!row.passed,
    escalated:!row.fresh_execution,
    source:'chief_of_staff_blind_acceptance',
  })
}

async function finalizeBlindRunIfComplete(db:Db, runId:string, requiredCases:number) {
  const collected = await db.from('cos_chief_of_staff_acceptance_results')
    .select('case_key,verdicts,fresh_execution,provenance_recorded').eq('run_id', runId)
  if (collected.error) throw collected.error
  if ((collected.data ?? []).length < requiredCases) return { completed:false, report:null }
  const observations = (collected.data ?? []).map(item => ({
    caseId:item.case_key,
    verdicts:item.verdicts,
    freshExecution:item.fresh_execution,
    provenanceRecorded:item.provenance_recorded,
  })) as Parameters<typeof evaluateChiefOfStaffReliability>[0]
  const report = evaluateChiefOfStaffReliability(observations)
  const updated = await db.from('cos_chief_of_staff_acceptance_runs').update({
    status:'completed',
    completed_at:new Date().toISOString(),
    gate_passed:report.gatePassed,
    observed_cases:report.observedCases,
    dimensions:report.dimensions,
    failures:report.failures,
  }).eq('id', runId).eq('profile', CHIEF_OF_STAFF_BLIND_PROFILE).eq('status', 'running')
  if (updated.error) throw updated.error
  return { completed:true, report }
}

async function acquireCaseClaim(db:Db, runId:string, caseKey:string) {
  const token = randomUUID()
  const claimedAt = new Date().toISOString()
  const leaseExpiresAt = new Date(Date.now() + CASE_CLAIM_LEASE_MS).toISOString()
  const inserted = await db.from('cos_chief_of_staff_acceptance_case_claims').insert({
    run_id:runId,
    case_key:caseKey,
    claim_token:token,
    claimed_at:claimedAt,
    lease_expires_at:leaseExpiresAt,
  }).select('claim_token').single()
  if (!inserted.error && inserted.data) return { owned:true, token }
  if ((inserted.error as { code?:string } | null)?.code !== '23505') throw inserted.error

  const takeover = await db.from('cos_chief_of_staff_acceptance_case_claims').update({
    claim_token:token,
    claimed_at:claimedAt,
    lease_expires_at:leaseExpiresAt,
  }).eq('run_id', runId).eq('case_key', caseKey).lt('lease_expires_at', claimedAt).select('claim_token').maybeSingle()
  if (takeover.error) throw takeover.error
  return { owned:Boolean(takeover.data), token }
}

async function releaseCaseClaim(db:Db, runId:string, caseKey:string, token:string):Promise<void> {
  const released = await db.from('cos_chief_of_staff_acceptance_case_claims')
    .delete().eq('run_id', runId).eq('case_key', caseKey).eq('claim_token', token)
  if (released.error) console.warn('[cos-chief-of-staff-blind-acceptance] claim release failed', errorText(released.error))
}

async function waitForStoredCase(db:Db, runId:string, caseKey:string):Promise<StoredCase|null> {
  for (let attempt = 0; attempt < CASE_CLAIM_WAIT_ATTEMPTS; attempt += 1) {
    const stored = await readStoredCase(db, runId, caseKey)
    if (stored) return stored
    await sleep(CASE_CLAIM_WAIT_MS)
  }
  return null
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error:guard.error }, { status:guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok:false, error:'COS service database is not configured.' }, { status:503 })
  const runs = await db.from('cos_chief_of_staff_acceptance_runs')
    .select('id,profile,status,started_at,completed_at,gate_passed,observed_cases,dimensions,failures,error,variant_seed')
    .eq('profile', CHIEF_OF_STAFF_BLIND_PROFILE)
    .order('started_at', { ascending:false }).limit(20)
  if (runs.error) return NextResponse.json({ ok:false, error:runs.error.message }, { status:500 })
  const runIds = (runs.data ?? []).map(row => row.id)
  const results = runIds.length
    ? await db.from('cos_chief_of_staff_acceptance_results')
      .select('id,run_id,case_key,title,passed,verdicts,response_source,local_model_invoked,external_ai_invoked,fresh_execution,provenance_recorded,latency_ms,created_at')
      .in('run_id', runIds).order('created_at', { ascending:true })
    : { data:[], error:null }
  if (results.error) return NextResponse.json({ ok:false, error:results.error.message }, { status:500 })
  return NextResponse.json({ ok:true, profile:CHIEF_OF_STAFF_BLIND_PROFILE, requiredCases:4, runs:runs.data ?? [], results:results.data ?? [] })
}

export async function POST(request:Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error:guard.error }, { status:guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok:false, error:'COS service database is not configured.' }, { status:503 })
  const body = await request.json().catch(() => ({})) as { runId?:string }
  const runId = String(body.runId || randomUUID())
  if (!UUID.test(runId)) return NextResponse.json({ ok:false, error:'A valid blind acceptance run id is required.' }, { status:400 })

  const existing = await readBlindRun(db, runId)
  if (existing.error) return NextResponse.json({ ok:false, error:existing.error.message }, { status:500 })
  if (existing.data) {
    const suite = buildBlindChiefOfStaffAcceptanceSuite(String(existing.data.variant_seed || ''))
    return NextResponse.json({ ok:true, runId, caseKeys:suite.cases.map(test => test.key), resumed:true })
  }

  const seed = randomUUID()
  const suite = buildBlindChiefOfStaffAcceptanceSuite(seed)
  const created = await db.from('cos_chief_of_staff_acceptance_runs').insert({
    id:runId,
    profile:CHIEF_OF_STAFF_BLIND_PROFILE,
    variant_seed:seed,
    case_manifest:suite,
  }).select('id').single()
  if (created.error || !created.data) {
    if ((created.error as { code?:string } | null)?.code === '23505') {
      const raced = await readBlindRun(db, runId)
      if (!raced.error && raced.data) {
        const resumed = buildBlindChiefOfStaffAcceptanceSuite(String(raced.data.variant_seed || ''))
        return NextResponse.json({ ok:true, runId, caseKeys:resumed.cases.map(test => test.key), resumed:true })
      }
    }
    return NextResponse.json({ ok:false, error:created.error?.message ?? 'Could not create blind acceptance run.' }, { status:500 })
  }
  return NextResponse.json({ ok:true, runId, caseKeys:suite.cases.map(test => test.key), resumed:false })
}

export async function PUT(request:Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error:guard.error }, { status:guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok:false, error:'COS service database is not configured.' }, { status:503 })
  const body = await request.json().catch(() => ({})) as { runId?:string; caseKey?:string }
  const runId = String(body.runId ?? '')
  if (!UUID.test(runId)) return NextResponse.json({ ok:false, error:'A valid blind acceptance run is required.' }, { status:400 })

  const run = await readBlindRun(db, runId)
  if (run.error || !run.data) return NextResponse.json({ ok:false, error:run.error?.message ?? 'Blind acceptance run was not found.' }, { status:404 })
  const suite = buildBlindChiefOfStaffAcceptanceSuite(String(run.data.variant_seed || ''))
  if (canonicalJson(run.data.case_manifest ?? {}) !== canonicalJson(suite)) {
    return NextResponse.json({ ok:false, error:'Blind acceptance manifest drift detected; this run cannot be scored by a changed generator.' }, { status:409 })
  }
  const test = suite.cases.find(candidate => candidate.key === body.caseKey)
  if (!test) return NextResponse.json({ ok:false, error:'A valid blind acceptance case is required.' }, { status:400 })

  const prior = await readStoredCase(db, runId, test.key)
  if (prior) {
    await attachStoredOutcome(prior)
    const final = await finalizeBlindRunIfComplete(db, runId, suite.cases.length)
    return NextResponse.json({ ok:true, runId, caseKey:test.key, completed:final.completed, replayed:true, ...(final.report ? { report:{ ...final.report, profile:CHIEF_OF_STAFF_BLIND_PROFILE } } : {}) })
  }
  if (run.data.status !== 'running') return NextResponse.json({ ok:false, error:'Blind acceptance run is already final.' }, { status:409 })

  const claim = await acquireCaseClaim(db, runId, test.key)
  if (!claim.owned) {
    const stored = await waitForStoredCase(db, runId, test.key)
    if (stored) {
      await attachStoredOutcome(stored)
      const final = await finalizeBlindRunIfComplete(db, runId, suite.cases.length)
      return NextResponse.json({ ok:true, runId, caseKey:test.key, completed:final.completed, replayed:true, ...(final.report ? { report:{ ...final.report, profile:CHIEF_OF_STAFF_BLIND_PROFILE } } : {}) })
    }
    return NextResponse.json({ ok:false, runId, caseKey:test.key, error:'This blind acceptance case is already executing; retry the same run and case.' }, { status:425 })
  }

  try {
    let row
    try {
      const outcome = await runPrivateCapabilityCase({
        id:CASE_IDS[test.key],
        track:'chief_of_staff_blind_acceptance',
        prompt:test.prompt,
        requiredTerms:[],
        forbiddenTerms:[],
        requiresProvenance:true,
        requiresLocalReasoning:true,
      }, {
        attachOutcome:false,
        outcomeSource:'chief_of_staff_blind_acceptance',
        evaluation:{
          source:'controlled_comparison',
          runId,
          candidateId:test.key,
          workerRole:CASE_WORKER_ROLES[test.key],
        },
      })
      const freshExecution = isFreshReleasedAcceptanceOutcome({
        handled:outcome.handled,
        responseSource:String(outcome.provenance.responseSource || ''),
        localModelInvoked:outcome.provenance.localModelInvoked === true,
        externalAiInvoked:Boolean(outcome.provenance.externalAiInvoked),
      })
      const provenanceRecorded = Boolean(outcome.turnId)
      const observation = evaluateBlindChiefOfStaffAcceptanceCase({ runId, test, reply:outcome.replyExcerpt, freshExecution, provenanceRecorded })
      const passed = Object.values(observation.verdicts).every(verdict => verdict.passed) && freshExecution && provenanceRecorded
      row = {
        run_id:runId,
        case_key:test.key,
        title:test.title,
        verdicts:observation.verdicts,
        response_excerpt:outcome.replyExcerpt,
        response_source:outcome.provenance.responseSource,
        local_model_invoked:outcome.provenance.localModelInvoked,
        external_ai_invoked:outcome.provenance.externalAiInvoked,
        fresh_execution:freshExecution,
        provenance_recorded:provenanceRecorded,
        turn_id:outcome.turnId,
        latency_ms:outcome.latencyMs,
        passed,
      }
    } catch (error) {
      const observation = evaluateBlindChiefOfStaffAcceptanceCase({ runId, test, reply:'', freshExecution:false, provenanceRecorded:false })
      row = {
        run_id:runId,
        case_key:test.key,
        title:test.title,
        passed:false,
        verdicts:observation.verdicts,
        response_excerpt:`Execution failed: ${errorText(error)}`,
        response_source:'none',
        local_model_invoked:false,
        external_ai_invoked:false,
        fresh_execution:false,
        provenance_recorded:false,
        turn_id:null,
        latency_ms:0,
      }
    }

    const stored = await db.from('cos_chief_of_staff_acceptance_results').upsert(row, { onConflict:'run_id,case_key' })
    if (stored.error) throw stored.error
    await attachStoredOutcome({
      case_key:test.key,
      passed:Boolean(row.passed),
      turn_id:typeof row.turn_id === 'string' ? row.turn_id : null,
      fresh_execution:Boolean(row.fresh_execution),
    })
    const final = await finalizeBlindRunIfComplete(db, runId, suite.cases.length)
    return NextResponse.json({ ok:true, runId, caseKey:test.key, completed:final.completed, replayed:false, ...(final.report ? { report:{ ...final.report, profile:CHIEF_OF_STAFF_BLIND_PROFILE } } : {}) })
  } catch (error) {
    const message = errorText(error)
    await db.from('cos_chief_of_staff_acceptance_runs').update({ status:'failed', completed_at:new Date().toISOString(), error:message }).eq('id', runId).eq('profile', CHIEF_OF_STAFF_BLIND_PROFILE)
    return NextResponse.json({ ok:false, runId, error:message }, { status:503 })
  } finally {
    await releaseCaseClaim(db, runId, test.key, claim.token)
  }
}
