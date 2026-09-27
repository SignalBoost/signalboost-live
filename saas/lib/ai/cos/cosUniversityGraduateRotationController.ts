import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { resolveGraduateRuntimeProfile, proveGraduateServedIdentity } from '@/lib/ai/cos/cosUniversityGraduateRuntime'
import { GRADUATE_ROTATION_VERSION, selectGraduateFor24HourLease } from '@/lib/ai/cos/cosUniversityGraduateRotation'

export type GraduateRotationControllerResult = Readonly<{
  status: number
  body: Record<string, unknown>
}>

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const clean = (v: unknown, n = 1000) => String(v ?? '').trim().slice(0, n)

export async function runGraduateRotationController(now = new Date()): Promise<GraduateRotationControllerResult> {
  const db = cosServiceDb()
  if (!db) return { status: 503, body: { ok: false, error: 'service_database_unavailable' } }

  const rows = await db.from('cos_university_graduate_model_registry')
    .select('id,candidate_id,trained_artifact_hash,status,runtime_profile,runtime_provider,runtime_model_id,runtime_health_evidence_hash,activation_evidence_hash,platform_scope,rollback_artifact_ref')
    .eq('status', 'active').eq('authority_expanded', false).limit(100)
  if (rows.error) return { status: 503, body: { ok: false, error: 'graduate_registry_read_failed' } }

  const eligible = (rows.data || []).filter((r: any) =>
    /^[a-f0-9]{64}$/i.test(clean(r.trained_artifact_hash, 64)) &&
    /^[a-f0-9]{64}$/i.test(clean(r.runtime_health_evidence_hash, 64)) &&
    /^[a-f0-9]{64}$/i.test(clean(r.activation_evidence_hash, 64)) &&
    clean(r.rollback_artifact_ref).length > 0 &&
    ['local_ai', 'graduate_ai'].includes(clean(r.runtime_profile, 40)) &&
    clean(r.runtime_model_id, 240).length > 0
  ).map((r: any) => ({ registryId: r.id, candidateId: r.candidate_id, trainedArtifactHash: r.trained_artifact_hash, row: r }))

  const decision = selectGraduateFor24HourLease(eligible, now)
  if (!decision.selected) {
    return { status: 200, body: { ok: true, rotated: false, reason: decision.reason, eligibleCount: eligible.length, authorityExpanded: false } }
  }

  const selected: any = decision.selected
  const row: any = selected.row
  const scope = row.platform_scope && typeof row.platform_scope === 'object' ? row.platform_scope : {}
  const runtimeConfig = resolveGraduateRuntimeProfile(row.runtime_profile, row.runtime_model_id, scope.runtimeBaseUrl)
  const health = row.runtime_profile === 'graduate_ai'
    ? await proveGraduateServedIdentity(runtimeConfig.inference, row.runtime_model_id, { waitMs: 240_000 })
    : { ok: true, model: row.runtime_model_id }

  if (!health.ok || health.model !== row.runtime_model_id) {
    const evidence = { ok: false, reason: 'selected_runtime_unhealthy', candidateId: selected.candidateId, artifactHash: selected.trainedArtifactHash, authorityExpanded: false }
    console.error('[cos-graduate-24h-rotation-controller]', JSON.stringify(evidence))
    return { status: 503, body: { ok: false, error: 'selected_runtime_unhealthy', authorityExpanded: false } }
  }

  const previous: any = decision.previous
  const healthEvidenceHash = hash({ version: GRADUATE_ROTATION_VERSION, candidateId: selected.candidateId, artifactHash: selected.trainedArtifactHash, model: row.runtime_model_id, health })
  const inserted = await db.from('cos_university_graduate_rotation_leases').insert({
    lease_number: decision.leaseNumber,
    candidate_id: selected.candidateId,
    registry_id: selected.registryId,
    trained_artifact_hash: selected.trainedArtifactHash,
    previous_candidate_id: previous?.candidateId ?? null,
    previous_artifact_hash: previous?.trainedArtifactHash ?? null,
    rollback_artifact_ref: row.rollback_artifact_ref,
    runtime_health_evidence_hash: healthEvidenceHash,
    controller_version: GRADUATE_ROTATION_VERSION,
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    lease_started_at: decision.leaseStartedAt,
    lease_expires_at: decision.leaseExpiresAt,
    authority_expanded: false,
  })
  if (inserted.error && inserted.error.code !== '23505') {
    return { status: 503, body: { ok: false, error: 'rotation_lease_persist_failed', authorityExpanded: false } }
  }

  const evidence = {
    ok: true,
    reason: decision.reason,
    leaseNumber: decision.leaseNumber,
    leaseStartedAt: decision.leaseStartedAt,
    leaseExpiresAt: decision.leaseExpiresAt,
    candidateId: selected.candidateId,
    artifactHash: selected.trainedArtifactHash,
    previousCandidateId: previous?.candidateId ?? null,
    previousArtifactHash: previous?.trainedArtifactHash ?? null,
    eligibleCount: eligible.length,
    healthEvidenceHash,
    authorityExpanded: false,
  }
  console.info('[cos-graduate-24h-rotation-controller]', JSON.stringify(evidence))
  return {
    status: 200,
    body: {
      ok: true,
      rotated: decision.reason === 'scheduled_24h_rotation',
      reason: decision.reason,
      leaseNumber: decision.leaseNumber,
      candidateId: selected.candidateId,
      artifactHash: selected.trainedArtifactHash,
      eligibleCount: eligible.length,
      healthVerified: true,
      authorityExpanded: false,
    },
  }
}
