import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { resolveGraduateRuntimeProfile, proveGraduateServedIdentity } from '@/lib/ai/cos/cosUniversityGraduateRuntime'
import { GRADUATE_ROTATION_VERSION, selectGraduateFor24HourLease } from '@/lib/ai/cos/cosUniversityGraduateRotation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const clean = (v: unknown, n=1000) => String(v ?? '').trim().slice(0,n)

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok:false, error:'service_database_unavailable' }, { status:503 })
  const now = new Date()
  const rows = await db.from('cos_university_graduate_model_registry')
    .select('id,candidate_id,trained_artifact_hash,status,runtime_profile,runtime_provider,runtime_model_id,runtime_health_evidence_hash,activation_evidence_hash,platform_scope,rollback_artifact_ref')
    .eq('status','active').eq('authority_expanded',false).limit(100)
  if (rows.error) return NextResponse.json({ ok:false, error:'graduate_registry_read_failed' }, { status:503 })

  const eligible = (rows.data || []).filter((r:any) =>
    /^[a-f0-9]{64}$/i.test(clean(r.trained_artifact_hash,64)) &&
    /^[a-f0-9]{64}$/i.test(clean(r.runtime_health_evidence_hash,64)) &&
    /^[a-f0-9]{64}$/i.test(clean(r.activation_evidence_hash,64)) &&
    clean(r.rollback_artifact_ref).length > 0 &&
    ['local_ai','graduate_ai'].includes(clean(r.runtime_profile,40)) &&
    clean(r.runtime_model_id,240).length > 0
  ).map((r:any)=>({ registryId:r.id, candidateId:r.candidate_id, trainedArtifactHash:r.trained_artifact_hash, row:r }))

  const decision = selectGraduateFor24HourLease(eligible, now)
  if (!decision.selected) return NextResponse.json({ ok:true, rotated:false, reason:decision.reason, eligibleCount:0, authorityExpanded:false })

  const selected:any = decision.selected
  const row:any = selected.row
  const scope = row.platform_scope && typeof row.platform_scope === 'object' ? row.platform_scope : {}
  const runtimeConfig = resolveGraduateRuntimeProfile(row.runtime_profile, row.runtime_model_id, scope.runtimeBaseUrl)
  const health = row.runtime_profile === 'graduate_ai'
    ? await proveGraduateServedIdentity(runtimeConfig.inference, row.runtime_model_id, { waitMs: 240_000 })
    : { ok:true, model:row.runtime_model_id }
  if (!health.ok || health.model !== row.runtime_model_id) {
    console.error('[cos-graduate-24h-rotation-controller]', JSON.stringify({ok:false,reason:'selected_runtime_unhealthy',candidateId:selected.candidateId,artifactHash:selected.trainedArtifactHash,authorityExpanded:false}))
    return NextResponse.json({ ok:false, error:'selected_runtime_unhealthy', authorityExpanded:false }, { status:503 })
  }

  const previous:any = decision.previous
  const healthEvidenceHash = hash({version:GRADUATE_ROTATION_VERSION,candidateId:selected.candidateId,artifactHash:selected.trainedArtifactHash,model:row.runtime_model_id,health})
  const inserted = await db.from('cos_university_graduate_rotation_leases').insert({
    lease_number:decision.leaseNumber, candidate_id:selected.candidateId, registry_id:selected.registryId,
    trained_artifact_hash:selected.trainedArtifactHash, previous_candidate_id:previous?.candidateId ?? null,
    previous_artifact_hash:previous?.trainedArtifactHash ?? null, rollback_artifact_ref:row.rollback_artifact_ref,
    runtime_health_evidence_hash:healthEvidenceHash, controller_version:GRADUATE_ROTATION_VERSION,
    commit_sha:process.env.VERCEL_GIT_COMMIT_SHA || null, lease_started_at:decision.leaseStartedAt,
    lease_expires_at:decision.leaseExpiresAt, authority_expanded:false,
  })
  if (inserted.error && inserted.error.code !== '23505') return NextResponse.json({ok:false,error:'rotation_lease_persist_failed'}, {status:503})

  console.info('[cos-graduate-24h-rotation-controller]', JSON.stringify({ok:true,reason:decision.reason,leaseNumber:decision.leaseNumber,leaseStartedAt:decision.leaseStartedAt,leaseExpiresAt:decision.leaseExpiresAt,candidateId:selected.candidateId,artifactHash:selected.trainedArtifactHash,previousCandidateId:previous?.candidateId??null,previousArtifactHash:previous?.trainedArtifactHash??null,eligibleCount:eligible.length,healthEvidenceHash,authorityExpanded:false}))
  return NextResponse.json({ok:true,rotated:decision.reason==='scheduled_24h_rotation',reason:decision.reason,leaseNumber:decision.leaseNumber,candidateId:selected.candidateId,artifactHash:selected.trainedArtifactHash,eligibleCount:eligible.length,healthVerified:true,authorityExpanded:false})
}
