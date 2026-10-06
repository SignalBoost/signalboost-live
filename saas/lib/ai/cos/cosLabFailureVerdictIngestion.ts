import { createHash } from 'node:crypto'
import { verifySignedLabFailureVerdict, type SignedLabFailureVerdict } from './cosLabSignedFailureVerdict.ts'

/** Signed claim identity is stable across different HTTP idempotency keys. */
export function labFailureVerdictEventKey(verdict: SignedLabFailureVerdict): string {
  return createHash('sha256').update(JSON.stringify(['lab_failure_verdict_v1', verdict.jobId,
    verdict.providerStage, verdict.verdict, verdict.verifierId, verdict.evidenceRef,
    verdict.evidenceHash.toLowerCase(), verdict.issuedAt])).digest('hex')
}

/** Authenticated ingestion only; no settlement, refund or graduation authority. */
export async function recordAuthenticatedLabFailureVerdict(input: {
  payload: unknown
  idempotencyKey: string
  now?: Date
  trustedVerifierKeys: Readonly<Record<string, string>>
}) {
  const raw = input.payload
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('lab_verdict_invalid')
  const verdict = raw as SignedLabFailureVerdict
  if (!input.idempotencyKey || input.idempotencyKey.length > 500) throw new Error('lab_verdict_idempotency_invalid')
  if (typeof verdict.jobId !== 'string' || !verdict.jobId || verdict.jobId.length > 200) throw new Error('lab_verdict_job_invalid')
  const { cosServiceDb } = await import('../../cos-core/storage/supabase.ts')
  const db = cosServiceDb()
  if (!db) throw new Error('lab_verdict_db_unavailable')
  const result = await db.from('cos_university_mass_distillation_provider_jobs')
    .select('job_id,provider_stage,candidate_id,subject_id,settled_at')
    .eq('job_id', verdict.jobId).maybeSingle()
  if (result.error) throw result.error
  const job = result.data
  if (!job || !job.settled_at) throw new Error('lab_verdict_settled_job_required')
  const classification = verifySignedLabFailureVerdict({
    verdict, expectedJobId: String(job.job_id), expectedProviderStage: String(job.provider_stage),
    trustedVerifierKeys: input.trustedVerifierKeys, now: input.now,
  })
  if (classification === 'UNATTRIBUTED') throw new Error('lab_verdict_unverified')
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  // Canonical signed claim identity: changing the transport idempotency key cannot replay it.
  const eventKey = labFailureVerdictEventKey(verdict)
  const evidence = { profile: 'lab_failure_verdict_v1', jobId: verdict.jobId,
    providerStage: verdict.providerStage, classification, verifierId: verdict.verifierId,
    evidenceRef: verdict.evidenceRef, evidenceHash: verdict.evidenceHash,
    issuedAt: verdict.issuedAt, signatureBase64: verdict.signatureBase64,
    authorityExpanded: false, financialAdjustmentAuthorized: false }
  // Atomic DB uniqueness prevents both replay and competing classifications for one job.
  // Preflight reads alone cannot protect against concurrent submissions.
  const inserted = await db.from('cos_university_learning_assurance_events').insert({
    event_key: eventKey, event_type: 'lab_failure_verdict',
    subject_id: job.subject_id, candidate_id: job.candidate_id,
    evidence_hash: hash(evidence), evidence, verifier: 'independent_scorer',
    observed_at: (input.now || new Date()).toISOString(),
  })
  if (inserted.error) {
    if (inserted.error.code === '23505') throw new Error('lab_verdict_duplicate_or_conflict_rejected')
    throw inserted.error
  }
  return { ok: true as const, eventKey, classification, financialAdjustmentAuthorized: false as const }
}
