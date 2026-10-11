// saas/app/api/lab/training/callback/[token]/route.ts
// Reports from the worker running a customer LAB job on the CUSTOMER's Hugging Face account.
// The path token is single-use and exists only inside that job; the database stores its hash. The worker signs each
// report with a secret derived from the token. Redeeming the token is the only way this route gets the run's
// compute credential. The next paid job is reserved in the database BEFORE it is submitted (runReservedJob).
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/service-db'
import { openCustomerCredential } from '@/lib/ai/cos/labCustomerCredentialVault'
import {
  interpretWorkerCallback, newStageToken, planCustomerJob, runReservedJob, stageCallbackSecret, stageTokenHash, verifyWorkerCallback,
  type JobBookkeeping,
} from '@/lib/ai/cos/labCustomerTraining'
import { customerHfPorts, listArtifactFiles } from '@/lib/ai/cos/labCustomerHfPorts'
import { installHfWorkerDeliveryEnv } from '@/lib/ai/cos/cosUniversityHfWorkerDelivery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
const reply = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } })

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token || '')) return reply(404, { ok: false })
  const rawBody = await req.text()
  const timestamp = req.headers.get('x-itmounts-training-timestamp') || ''
  const idempotencyKey = req.headers.get('x-itmounts-training-idempotency-key') || ''
  const signature = req.headers.get('x-itmounts-training-signature') || ''
  let payload: any = null
  try { payload = JSON.parse(rawBody) } catch { return reply(400, { ok: false }) }
  const runId = String(payload?.candidateId ?? '').replace(/^lab-/, '')
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return reply(400, { ok: false })
  if (!verifyWorkerCallback({ secret: stageCallbackSecret(runId, token), timestamp, idempotencyKey, rawBody, signature })) {
    return reply(401, { ok: false })
  }

  const db = cosServiceDb()
  if (!db) return reply(503, { ok: false, error: 'service_database_unavailable' })
  const { data: run, error } = await db.rpc('itmounts_lab_worker_redeem_stage_token', { p_token_hash: stageTokenHash(token) })
  if (error) return reply(503, { ok: false })
  if (!run) {
    // Token already used. The trainer sends a trailing "rollback_artifact_registered" right after the model report;
    // acknowledge it (signature already proved it came from this job) without changing anything.
    return reply(payload?.claim === 'rollback_artifact_registered' ? 200 : 410, { ok: payload?.claim === 'rollback_artifact_registered' })
  }

  const record = async (expected: string, stage: string, progress: number | null, message: string, patch: Record<string, unknown>, cost: number, nextHash: string | null) =>
    db.rpc('itmounts_lab_worker_record_stage', {
      p_run_id: run.runId, p_organization_id: run.organizationId, p_expected_stage: expected, p_stage: stage,
      p_progress: progress, p_message: message, p_patch: patch, p_add_committed_cost_usd: cost, p_next_stage_token_hash: nextHash,
    }).then(({ error: e }: { error: any }) => { if (e) throw new Error(String(e.message ?? 'lab_worker_record_failed')) })

  const decision = interpretWorkerCallback(run, payload)
  if (decision.kind === 'acknowledge') {
    await record(run.stage, run.stage, null, 'Worker reported progress.', {}, 0, stageTokenHash(token)).catch(() => undefined) // re-arm
    return reply(200, { ok: true })
  }
  if (decision.kind === 'reject') {
    await record(run.stage, 'failed', null, `Worker report rejected: ${decision.reason}`, { failureCode: `lab_worker_${decision.reason}` }, 0, null).catch(() => undefined)
    return reply(409, { ok: false })
  }

  if (!run.compute) {
    await record(run.stage, 'failed', null, 'Hugging Face key was removed.', { failureCode: 'lab_customer_compute_credential_unavailable' }, 0, null).catch(() => undefined)
    return reply(200, { ok: true, nextStage: 'failed' })
  }
  const hfToken = openCustomerCredential({ organizationId: run.organizationId, credentialId: run.compute.id, sealed: run.compute })

  if (decision.kind === 'complete') {
    // Record the exact file manifest (paths, sizes, hashes) at the pinned revision; downloads are verified against it.
    try {
      const files = await listArtifactFiles({ repo: String(decision.patch.artifactRepo), revision: String(decision.patch.artifactRevision), token: hfToken })
      if (!files.length) throw new Error('lab_artifact_manifest_empty')
      await record('training', 'completed', 100, 'Your model is ready to download.', { ...decision.patch, artifactFiles: files }, 0, null)
    } catch (caught) {
      const code = caught instanceof Error ? caught.message.split(':')[0] : 'lab_artifact_manifest_failed'
      await record('training', 'failed', null, `Model was trained but its files could not be verified: ${code}`, { ...decision.patch, failureCode: code }, 0, null).catch(() => undefined)
    }
    return reply(200, { ok: true })
  }

  // start_training: plan (no spend) -> reserve -> submit -> attach, on the customer's account with the customer's token.
  try {
    installHfWorkerDeliveryEnv()
    const next = newStageToken()
    const plan = await planCustomerJob({
      runId: run.runId, envelope: decision.train, customerHfToken: hfToken, stageToken: next.token,
      origin: req.nextUrl.origin, platformEnv: process.env, maxHourlyUsd: Number(run.maxHourlyUsd),
      remainingBudgetUsd: Number(run.approvedBudgetUsd) - Number(run.committedMaxCostUsd), ports: customerHfPorts,
    })
    const book: JobBookkeeping = {
      reserve: p => record('preparing_dataset', 'training', 55, `Reserved up to $${p.maxCostUsd.toFixed(2)}; submitting training.`,
        { ...decision.patch, hfPendingJobName: p.jobName, jobSubmissionState: 'reserved' }, p.maxCostUsd, next.hash),
      attach: job => record('training', 'training', 60, 'Training your model on your Hugging Face account.',
        { hfJobId: job.jobId, hfJobUrl: job.jobUrl, jobSubmissionState: 'submitted' }, 0, next.hash),
      release: async reason => db.rpc('itmounts_lab_worker_release_reservation', { p_run_id: run.runId, p_organization_id: run.organizationId, p_reason: reason })
        .then(({ error: e }: { error: any }) => { if (e) throw new Error('lab_release_failed') }),
    }
    const outcome = await runReservedJob({ plan, customerHfToken: hfToken, ports: customerHfPorts, book })
    return reply(200, { ok: true, nextStage: outcome.status })
  } catch (caught) {
    // Reached only before a reservation exists (planning failed or the reservation write failed): nothing was spent.
    const code = caught instanceof Error ? caught.message.split(':')[0].slice(0, 120) : 'lab_training_submit_failed'
    await record('preparing_dataset', 'failed', null, `Could not start training: ${code}`, { ...decision.patch, failureCode: code }, 0, null).catch(() => undefined)
    return reply(200, { ok: true, nextStage: 'failed' })
  }
}
