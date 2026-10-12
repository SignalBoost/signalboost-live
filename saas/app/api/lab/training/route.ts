// saas/app/api/lab/training/route.ts
import { observeLabRequest } from '@/lib/lab/observability'
// Customer LAB training on the customer's own training account: Hugging Face Jobs, Together AI or Fireworks AI.
// GET  ?organizationId=                         -> runs with stage/progress/artifact (any active member)
// POST { action:'start', organizationId, experimentId, teacherCredentialId, teacherModel, computeCredentialId,
//        baseModel, baseModelRevision?, source:'examples'|'teacher', examples?, prompts?, approvedBudgetUsd, maxHourlyUsd,
//        teacherBudgetUsd?  (teacher prices come from the verified rate card in the database, never from the request) }
// POST { action:'refresh', organizationId, runId }                                 (owner/admin)
// POST { action:'cancel',  organizationId, runId }   Together / Fireworks jobs only   (owner/admin)
//
// Spend rules: every paid job (Hugging Face, Together, Fireworks) is RESERVED in the database (cost, callback token, job name) before it is
// submitted (lib/ai/cos/labCustomerTraining.ts runReservedJob). Teacher API calls are reserved in the database first and
// executed inside the Platform Harness (lib/ai/cos/labCustomerGovernedTeacher.ts); the training job then gets only the
// budget the database reports after settling ACTUAL teacher spend; an overrun blocks the run. Graduation/certification is never checked.
import { NextRequest, NextResponse } from 'next/server'
import { customerSession, rpcErrorCode, UUID_RE } from '@/lib/lab/customerSession'
import { openCustomerCredential } from '@/lib/ai/cos/labCustomerCredentialVault'
import { unsupportedSelection } from '@/lib/ai/cos/labCustomerProviderCatalog'
import {
  buildChatJsonl, cancelProviderJob, findFireworksJob, findTogetherJob, isProviderTrainingKind, normalizeRateCards, prepareFireworks, prepareTogether,
  readProviderJob, submitFireworks, submitTogether, type ProviderTrainingKind,
} from '@/lib/ai/cos/labCustomerProviderTraining'
import {
  buildCustomerTeacherRows, buildPrepareEnvelope, interpretJobStage, newStageToken, parsePrompts, planCustomerJob,
  rowsFromExamples, runReservedJob, type JobBookkeeping, type TeacherRow,
} from '@/lib/ai/cos/labCustomerTraining'
import { runGovernedTeacher, type TeacherRateCard, type TeacherSettlement } from '@/lib/ai/cos/labCustomerGovernedTeacher'
import { customerHfPorts, readCustomerJob } from '@/lib/ai/cos/labCustomerHfPorts'
import { installHfWorkerDeliveryEnv } from '@/lib/ai/cos/cosUniversityHfWorkerDelivery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
const noStore = { 'cache-control': 'no-store' }
const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, error, ...extra }, { status, headers: noStore })

const errCode = (caught: unknown) => (caught instanceof Error ? caught.message : String(caught)).split(':')[0].replace(/^lab_customer_teacher_/, 'lab_teacher_')

type Session = NonNullable<Awaited<ReturnType<typeof customerSession>>>

async function getHandler(req: NextRequest) {
  const session = await customerSession()
  if (!session) return fail('unauthorized', 401)
  const organizationId = req.nextUrl.searchParams.get('organizationId') || ''
  if (!UUID_RE.test(organizationId)) return fail('lab_organization_required')
  const { data, error } = await session.supabase.rpc('itmounts_lab_customer_list_training_runs', { p_organization_id: organizationId })
  if (error) return fail(rpcErrorCode(error), 403)
  return NextResponse.json({ ok: true, runs: data ?? [] }, { headers: noStore })
}

async function postHandler(req: NextRequest) {
  const session = await customerSession()
  if (!session) return fail('unauthorized', 401)
  const body = await req.json().catch(() => null)
  if (body?.action === 'refresh') return refresh(session, body)
  if (body?.action === 'cancel') return cancel(session, body)
  if (body?.action !== 'start') return fail('lab_action_invalid')

  const organizationId = String(body.organizationId ?? '')
  const experimentId = String(body.experimentId ?? '')
  if (body.source !== 'teacher' && body.source !== 'examples') return fail('lab_training_source_invalid')
  const source: 'teacher' | 'examples' = body.source
  const teacherCredentialId = String(body.teacherCredentialId ?? '')
  const computeCredentialId = String(body.computeCredentialId ?? '')
  const teacherModel = source === 'teacher' ? String(body.teacherModel ?? '').trim() : 'customer-examples'
  const baseModel = String(body.baseModel ?? '').trim()
  const baseModelRevision = String(body.baseModelRevision ?? '').trim().toLowerCase() || null
  // Explicit per-run authorization is mandatory independently of any UI checkbox.
  if (body.approvedBudgetConfirmed !== true) return fail('lab_training_budget_not_authorized', 403)
  const approvedBudgetUsd = Number(body.approvedBudgetUsd)
  const computeKind = String(body.computeProviderKind ?? '')
  // The hourly GPU cap only exists for Hugging Face Jobs; Together and Fireworks bill per training token.
  const hourlyApplies = !isProviderTrainingKind(computeKind)
  const maxHourlyUsd = hourlyApplies ? Number(body.maxHourlyUsd) : null
  // For examples mode the teacher credential is not used; the HF key stands in so the run row stays well-formed.
  if (!baseModel || baseModel.length > 200 || (source === 'teacher' && (!teacherModel || teacherModel.length > 200))) return fail('lab_training_model_invalid')
  const teacherIdForRun = source === 'teacher' ? teacherCredentialId : computeCredentialId
  if (![organizationId, experimentId, teacherIdForRun, computeCredentialId].every(id => UUID_RE.test(id))) return fail('lab_training_request_invalid')
  if (!Number.isFinite(approvedBudgetUsd) || !(approvedBudgetUsd > 0 && approvedBudgetUsd <= 1000) ||
      (hourlyApplies && !(Number.isFinite(maxHourlyUsd) && maxHourlyUsd > 0 && maxHourlyUsd <= 1000))) return fail('lab_training_budget_invalid')
  if (baseModelRevision && !/^[a-f0-9]{40}$/.test(baseModelRevision)) return fail('lab_base_model_revision_invalid')

  // Validate everything that needs no spend BEFORE the run exists.
  let rows: TeacherRow[] = []
  let datasetHash = ''
  const prompts = source === 'teacher' ? parsePrompts(body.prompts) : []
  if (source === 'examples') {
    const parsed = rowsFromExamples(body.examples)
    if (parsed.rows.length < 20) return fail('lab_examples_insufficient', 400, { problems: [`Found ${parsed.rows.length} usable examples (20–128 needed); ${parsed.invalidLines} lines were not {"prompt","response"} JSON.`] })
    rows = parsed.rows; datasetHash = parsed.datasetHash
  }
  const teacherBudgetUsd = Number(body.teacherBudgetUsd)
  // Teacher prices are NOT accepted from the request: they come from the platform-verified rate card in the database.
  if (source === 'teacher') {
    if (prompts.length < 20 || prompts.length > 128) return fail('lab_prompts_count_invalid')
    if (!(teacherBudgetUsd > 0 && teacherBudgetUsd < approvedBudgetUsd)) return fail('lab_teacher_budget_invalid')
  }

  const { data: created, error } = await session.supabase.rpc('itmounts_lab_customer_create_training_run', {
    p_organization_id: organizationId, p_experiment_id: experimentId, p_teacher_credential_id: teacherIdForRun,
    p_teacher_model: teacherModel, p_compute_credential_id: computeCredentialId, p_base_model: baseModel,
    p_base_model_revision: baseModelRevision, p_approved_budget_usd: approvedBudgetUsd, p_max_hourly_usd: maxHourlyUsd,
  })
  if (error || !created) return fail(rpcErrorCode(error), 403)
  const runId: string = created.runId
  const record = async (stage: string, progress: number | null, message: string, patch: Record<string, unknown> = {}, cost = 0, tokenHash: string | null = null) =>
    session.supabase.rpc('itmounts_lab_customer_record_stage', {
      p_organization_id: organizationId, p_run_id: runId, p_stage: stage, p_progress: progress, p_message: message,
      p_patch: patch, p_add_committed_cost_usd: cost, p_next_stage_token_hash: tokenHash,
    }).then(({ error: e }) => { if (e) throw new Error(rpcErrorCode(e)) })

  const problems = unsupportedSelection({
    teacherKind: source === 'teacher' ? created.teacher.providerKind : 'huggingface', computeKind: created.compute.providerKind,
    baseModel, promptCount: source === 'teacher' ? prompts.length : rows.length,
  })
  // The browser's provider hint must match the account the database released; the database is authoritative.
  if (computeKind && computeKind !== created.compute.providerKind) problems.push('The training account does not belong to the selected provider.')
  if (problems.length) {
    await record('failed', 0, problems.join(' '), { failureCode: 'lab_selection_unsupported' }).catch(() => undefined)
    return fail('lab_selection_unsupported', 400, { runId, problems })
  }

  let hfToken: string
  try { hfToken = openCustomerCredential({ organizationId, credentialId: created.compute.id, sealed: created.compute }) }
  catch { await record('failed', 0, 'Training key could not be opened.', { failureCode: 'lab_credential_unavailable' }).catch(() => undefined); return fail('lab_credential_unavailable', 500, { runId }) }

  try {
    let remainingBudgetUsd = approvedBudgetUsd
    if (source === 'teacher') {
      let apiKey: string
      try { apiKey = openCustomerCredential({ organizationId, credentialId: created.teacher.id, sealed: created.teacher }) }
      catch { await record('failed', 0, 'Teacher key could not be opened.', { failureCode: 'lab_credential_unavailable' }).catch(() => undefined); return fail('lab_credential_unavailable', 500, { runId }) }
      await record('generating_teacher_data', 10, `Asking ${teacherModel} to answer ${prompts.length} prompts.`)
      let built
      try {
        built = await runGovernedTeacher({
          organizationId, trainingRunId: runId,
          teacher: { providerKind: created.teacher.providerKind, model: teacherModel, endpoint: created.teacher.endpoint, apiKey },
          prompts, teacherBudgetUsd,
          budget: {
            rateCard: async () => session.supabase.rpc('itmounts_lab_customer_teacher_rate_card', { p_organization_id: organizationId, p_run_id: runId })
              .then(({ data, error: e }) => { if (e) throw new Error(rpcErrorCode(e)); return data as TeacherRateCard }),
            reserve: async b => session.supabase.rpc('itmounts_lab_customer_reserve_teacher', {
              p_organization_id: organizationId, p_run_id: runId, p_rate_card_id: b.rateCardId,
              p_input_token_bound: b.inputTokenBound, p_output_token_bound: b.outputTokenBound, p_cap_usd: b.capUsd,
            }).then(({ data, error: e }) => { if (e) throw new Error(rpcErrorCode(e)); return { reservedUsd: Number(data) } }),
            settle: async t => session.supabase.rpc('itmounts_lab_customer_settle_teacher', {
              p_organization_id: organizationId, p_run_id: runId, p_input_tokens: t.inputTokens, p_output_tokens: t.outputTokens,
              p_detail: { calls: t.calls, skipped: t.skipped, unmetered: t.unmetered, boundExceeded: t.boundExceeded },
            }).then(({ data, error: e }) => { if (e) throw new Error(rpcErrorCode(e)); return data as TeacherSettlement }),
          },
        })
      } catch (caught) {
        const code = errCode(caught)
        await record('failed', 15, `Teacher step stopped (${code}).`, { failureCode: code }).catch(() => undefined)
        return fail(code, code === 'lab_teacher_budget_exceeded' || code === 'lab_teacher_rate_unverified' ? 400 : code === 'lab_teacher_budget_overrun' ? 409 : 502, { runId })
      }
      rows = built.rows; datasetHash = built.datasetHash; remainingBudgetUsd = built.settlement.remainingUsd // database figure, after actual teacher spend
      if (rows.length < 20) {
        await record('failed', 30, `The teacher answered only ${rows.length} of ${prompts.length} prompts (20 needed).`, { failureCode: 'lab_teacher_answers_insufficient' })
        return fail('lab_teacher_answers_insufficient', 502, { runId })
      }
    }

    if (isProviderTrainingKind(created.compute.providerKind)) {
      return await startProviderJob({ session, organizationId, runId, kind: created.compute.providerKind, key: hfToken, baseModel, rows, datasetHash, remainingBudgetUsd, record })
    }

    installHfWorkerDeliveryEnv()
    const stage = newStageToken()
    const plan = await planCustomerJob({
      runId, envelope: buildPrepareEnvelope({ runId, rows, baseModel, baseModelRevision, datasetHash }),
      customerHfToken: hfToken, stageToken: stage.token, origin: req.nextUrl.origin, platformEnv: process.env,
      maxHourlyUsd, remainingBudgetUsd, ports: customerHfPorts,
    })
    const book: JobBookkeeping = {
      reserve: p => record('preparing_dataset', 35, `Reserved up to $${p.maxCostUsd.toFixed(2)}; submitting the dataset job.`,
        { datasetHash, teacherRows: rows.length, hfNamespace: p.namespace, hfPendingJobName: p.jobName, jobSubmissionState: 'reserved' }, p.maxCostUsd, stage.hash),
      attach: job => record('preparing_dataset', 40, `Preparing ${rows.length} examples on your Hugging Face account.`,
        { hfJobId: job.jobId, hfJobUrl: job.jobUrl, jobSubmissionState: 'submitted' }, 0, stage.hash),
      release: async reason => session.supabase.rpc('itmounts_lab_customer_release_reservation', { p_organization_id: organizationId, p_run_id: runId, p_reason: reason })
        .then(({ error: e }) => { if (e) throw new Error(rpcErrorCode(e)) }),
    }
    const outcome = await runReservedJob({ plan, customerHfToken: hfToken, ports: customerHfPorts, book })
    if (outcome.status === 'not_submitted') return fail(outcome.reason, 502, { runId })
    if (outcome.status === 'unknown') return fail('lab_job_state_unknown', 202, { runId, problems: ['We could not confirm whether Hugging Face created the job. Its cost stays reserved; use "Check status" in a minute.'] })
    return NextResponse.json({ ok: true, runId, hfJobUrl: outcome.jobUrl, attached: outcome.status === 'submitted' }, { headers: noStore })
  } catch (caught) {
    // Only reached before any reservation (planning/teacher errors) or when the reservation write itself failed.
    const code = caught instanceof Error ? caught.message.split(':')[0].slice(0, 120) : 'lab_training_start_failed'
    await record('failed', null, `Could not start: ${code}`, { failureCode: code }).catch(() => undefined)
    return fail(code, 502, { runId })
  }
}

type RecordStage = (stage: string, progress: number | null, message: string, patch?: Record<string, unknown>, cost?: number, tokenHash?: string | null) => Promise<void>

// Together / Fireworks: free steps -> RESERVE the maximum cost in the database -> create the paid job -> attach its id.
// A job whose creation cannot be proven absent keeps its reservation; "Check status" reconciles it.
async function startProviderJob(input: {
  session: Session; organizationId: string; runId: string; kind: ProviderTrainingKind; key: string; baseModel: string
  rows: TeacherRow[]; datasetHash: string; remainingBudgetUsd: number; record: RecordStage
}) {
  const { session, organizationId, runId, kind, key, baseModel, rows, datasetHash, remainingBudgetUsd, record } = input
  const jsonl = buildChatJsonl(rows)
  const name = kind === 'together' ? 'Together AI' : 'Fireworks AI'
  let maxCostUsd: number
  let patch: Record<string, unknown>
  let submit: () => Promise<{ jobId: string; jobUrl: string | null }>
  let find: () => Promise<{ jobId: string; jobUrl: string | null } | null>
  if (kind === 'together') {
    const prepared = await prepareTogether({ key, runId, baseModel, jsonl, fetcher: fetch })
    maxCostUsd = prepared.maxCostUsd
    patch = { providerFileRef: prepared.fileId }
    submit = () => submitTogether({ key, runId, baseModel, fileId: prepared.fileId, fetcher: fetch })
    find = () => findTogetherJob({ key, runId, fileId: prepared.fileId, fetcher: fetch })
  } else {
    const cards = await session.supabase.rpc('itmounts_lab_customer_training_rate_cards', { p_organization_id: organizationId })
    if (cards.error) throw new Error(rpcErrorCode(cards.error))
    const prepared = await prepareFireworks({ key, baseModel, jsonl, cards: normalizeRateCards(cards.data), fetcher: fetch })
    maxCostUsd = prepared.maxCostUsd
    patch = { providerAccount: prepared.account }
    submit = () => submitFireworks({ key, runId, account: prepared.account, baseModel, jsonl, rows: rows.length, fetcher: fetch })
    find = () => findFireworksJob({ key, runId, account: prepared.account, fetcher: fetch })
  }
  if (!(maxCostUsd <= remainingBudgetUsd)) throw new Error('lab_training_budget_insufficient')
  // RESERVE: throws -> nothing was spent.
  await record('preparing_dataset', 35, `Reserved up to $${maxCostUsd.toFixed(2)}; creating the ${name} training job.`,
    { ...patch, datasetHash, teacherRows: rows.length, jobSubmissionState: 'reserved' }, maxCostUsd, null)
  let job: { jobId: string; jobUrl: string | null } | null = null
  try {
    job = await submit()
  } catch (submitError) {
    const reason = errCode(submitError)
    if (reason !== 'lab_provider_job_rejected') {
      try { job = await find() } catch { return fail('lab_provider_job_state_unknown', 202, { runId }) }
      // Together's job list may lag a creation it is still processing: keep the reservation; refresh reconciles it.
      // Fireworks looks up its deterministic job id, so "not found" proves no job exists.
      if (!job && kind === 'together') return fail('lab_provider_job_state_unknown', 202, { runId })
    }
    if (!job) {
      await session.supabase.rpc('itmounts_lab_customer_release_reservation', { p_organization_id: organizationId, p_run_id: runId, p_reason: reason })
      return fail(reason, 502, { runId })
    }
  }
  try {
    await record('training', 45, `Training on your ${name} account.`, { providerJobId: job.jobId, providerJobUrl: job.jobUrl, jobSubmissionState: 'submitted' }, 0, null)
  } catch {
    return fail('lab_provider_job_state_unknown', 202, { runId })
  }
  return NextResponse.json({ ok: true, runId, attached: true }, { headers: noStore })
}

async function refreshProviderJob(session: Session, organizationId: string, runId: string, opened: any) {
  const kind = opened.computeProviderKind as ProviderTrainingKind
  const record = (stage: string, progress: number | null, message: string, patch: Record<string, unknown>) => session.supabase.rpc('itmounts_lab_customer_record_stage', {
    p_organization_id: organizationId, p_run_id: runId, p_stage: stage, p_progress: progress, p_message: message,
    p_patch: patch, p_add_committed_cost_usd: 0, p_next_stage_token_hash: null,
  }).then(({ error: e }) => { if (e) throw new Error(rpcErrorCode(e)) })
  const key = openCustomerCredential({ organizationId, credentialId: opened.compute.id, sealed: opened.compute })
  let jobId: string | null = opened.providerJobId
  if (!jobId && opened.jobSubmissionState === 'reserved') {
    // A creation whose response was lost: look the job up by what this run recorded before spending.
    const found = await findReservedProviderJob(key, runId, opened)
    if (found === 'unknown') return NextResponse.json({ ok: true, stage: opened.stage }, { headers: noStore })
    if (!found) return NextResponse.json({ ok: true, stage: opened.stage, message: 'No provider job found for this run yet.' }, { headers: noStore })
    jobId = found.jobId
    await record('training', 45, 'Found the submitted training job.', { providerJobId: found.jobId, jobSubmissionState: 'submitted' })
  }
  if (!jobId) return NextResponse.json({ ok: true, stage: opened.stage }, { headers: noStore })
  const job = await readProviderJob({ kind, key, jobId, fetcher: fetch })
  const cost = job.reportedCostUsd === null ? {} : { providerReportedCostUsd: job.reportedCostUsd }
  if (job.state === 'completed') {
    await record('completed', 100, job.tunedModelId ? `Trained model ready: ${job.tunedModelId}` : 'Training finished.', { tunedModelId: job.tunedModelId, ...cost })
    return NextResponse.json({ ok: true, stage: 'completed' }, { headers: noStore })
  }
  if (job.state === 'failed') {
    await record('failed', null, `The provider job stopped (${job.detail}).`, { failureCode: 'lab_provider_job_failed', ...cost })
    return NextResponse.json({ ok: true, stage: 'failed' }, { headers: noStore })
  }
  // Write only real changes: polling must not flood the run's event log.
  if (opened.stage !== 'training' || (job.progress !== null && job.progress !== opened.progressPercent)) {
    await record('training', job.progress, `Provider status: ${job.detail}.`, cost)
  }
  return NextResponse.json({ ok: true, stage: 'training', message: `Provider status: ${job.detail}.` }, { headers: noStore })
}

async function findReservedProviderJob(key: string, runId: string, opened: any): Promise<{ jobId: string; jobUrl: string | null } | null | 'unknown'> {
  if (opened.computeProviderKind === 'fireworks' && opened.providerAccount) return findFireworksJob({ key, runId, account: opened.providerAccount, fetcher: fetch })
  if (opened.computeProviderKind === 'together' && opened.providerFileRef) return findTogetherJob({ key, runId, fileId: opened.providerFileRef, fetcher: fetch })
  return 'unknown'
}

// Stops a Together / Fireworks job at the provider and closes the run. Idempotent: a terminal run just reports its stage.
// A reservation whose job provably does not exist is released; one that cannot be resolved stays reserved.
async function cancel(session: Session, body: any) {
  const organizationId = String(body?.organizationId ?? '')
  const runId = String(body?.runId ?? '')
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(runId)) return fail('lab_training_request_invalid')
  const { data: opened, error } = await session.supabase.rpc('itmounts_lab_customer_open_run_compute', { p_organization_id: organizationId, p_run_id: runId })
  if (error || !opened) return fail(rpcErrorCode(error), 403)
  if (['completed', 'failed', 'cancelled'].includes(opened.stage)) return NextResponse.json({ ok: true, stage: opened.stage }, { headers: noStore })
  if (!isProviderTrainingKind(String(opened.computeProviderKind ?? ''))) return fail('lab_cancel_unsupported')
  const kind = opened.computeProviderKind as ProviderTrainingKind
  const record = (stage: string, message: string, patch: Record<string, unknown>) => session.supabase.rpc('itmounts_lab_customer_record_stage', {
    p_organization_id: organizationId, p_run_id: runId, p_stage: stage, p_progress: null, p_message: message,
    p_patch: patch, p_add_committed_cost_usd: 0, p_next_stage_token_hash: null,
  }).then(({ error: e }) => { if (e) throw new Error(rpcErrorCode(e)) })
  try {
    const key = openCustomerCredential({ organizationId, credentialId: opened.compute.id, sealed: opened.compute })
    let jobId: string | null = opened.providerJobId
    if (!jobId && opened.jobSubmissionState === 'reserved') {
      const found = await findReservedProviderJob(key, runId, opened)
      if (found === 'unknown') return fail('lab_provider_cancel_pending', 409)
      if (!found) {
        const released = await session.supabase.rpc('itmounts_lab_customer_release_reservation', { p_organization_id: organizationId, p_run_id: runId, p_reason: 'lab_provider_job_cancelled' })
        if (released.error) throw new Error(rpcErrorCode(released.error))
        return NextResponse.json({ ok: true, stage: 'failed', message: 'No provider job existed; the reservation was released.' }, { headers: noStore })
      }
      jobId = found.jobId
    }
    if (!jobId) {
      await record('cancelled', 'Cancelled before any provider job was created.', { failureCode: 'lab_provider_job_cancelled' })
      return NextResponse.json({ ok: true, stage: 'cancelled' }, { headers: noStore })
    }
    const outcome = await cancelProviderJob({ kind, key, jobId, fetcher: fetch })
    if (!outcome.stopped) return fail('lab_provider_cancel_pending', 409, { problems: [`Provider status: ${outcome.detail}.`] })
    await record('cancelled', `Cancelled on the provider (${outcome.detail}).`, { providerJobId: jobId, failureCode: 'lab_provider_job_cancelled' })
    return NextResponse.json({ ok: true, stage: 'cancelled' }, { headers: noStore })
  } catch (caught) {
    return fail(errCode(caught), 502)
  }
}

async function refresh(session: Session, body: any) {
  const organizationId = String(body?.organizationId ?? '')
  const runId = String(body?.runId ?? '')
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(runId)) return fail('lab_training_request_invalid')
  const { data: opened, error } = await session.supabase.rpc('itmounts_lab_customer_open_run_compute', { p_organization_id: organizationId, p_run_id: runId })
  if (error || !opened) return fail(rpcErrorCode(error), 403)
  if (['completed', 'failed', 'cancelled'].includes(opened.stage)) return NextResponse.json({ ok: true, stage: opened.stage }, { headers: noStore })
  if (isProviderTrainingKind(String(opened.computeProviderKind ?? ''))) {
    try { return await refreshProviderJob(session, organizationId, runId, opened) }
    catch (caught) { return fail(errCode(caught), 502) }
  }
  if (!opened.hfNamespace) return NextResponse.json({ ok: true, stage: opened.stage }, { headers: noStore })
  const record = async (stage: string, message: string, patch: Record<string, unknown>) => session.supabase.rpc('itmounts_lab_customer_record_stage', {
    p_organization_id: organizationId, p_run_id: runId, p_stage: stage, p_progress: null, p_message: message,
    p_patch: patch, p_add_committed_cost_usd: 0, p_next_stage_token_hash: stage === 'failed' ? null : 'keep',
  })
  try {
    const token = openCustomerCredential({ organizationId, credentialId: opened.compute.id, sealed: opened.compute })
    let jobId: string | null = opened.hfJobId
    // Reconcile a reserved-but-unattached job by its deterministic name.
    if (opened.jobSubmissionState === 'reserved' && opened.hfPendingJobName) {
      const found = await customerHfPorts.findByName(opened.hfNamespace, token, opened.hfPendingJobName)
      if (found) {
        jobId = found.jobId
        await record(opened.stage, 'Found the submitted job on Hugging Face.', { hfJobId: found.jobId, hfJobUrl: found.jobUrl, jobSubmissionState: 'submitted' })
      } else {
        return NextResponse.json({ ok: true, stage: opened.stage, message: 'No job found yet under its reserved name. If this persists, release the reservation.' }, { headers: noStore })
      }
    }
    if (!jobId) return NextResponse.json({ ok: true, stage: opened.stage }, { headers: noStore })
    const job = await readCustomerJob({ namespace: opened.hfNamespace, jobId, token })
    const verdict = interpretJobStage(job.stage, job.logTail)
    if (verdict.failed) await record('failed', verdict.message, { failureCode: verdict.failureCode })
    return NextResponse.json({ ok: true, stage: verdict.failed ? 'failed' : opened.stage, message: verdict.message }, { headers: noStore })
  } catch (caught) {
    return fail(caught instanceof Error ? caught.message.split(':')[0] : 'lab_refresh_failed', 502)
  }
}

export async function GET(req: NextRequest) {
  return observeLabRequest('training.list', () => getHandler(req))
}

export async function POST(req: NextRequest) {
  return observeLabRequest('training.action', () => postHandler(req))
}
