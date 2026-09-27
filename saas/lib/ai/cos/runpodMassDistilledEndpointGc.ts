import { cosServiceDb } from '../../cos-core/storage/service-db.ts'
import {
  activeResidencyRunpodEndpointNames,
  protectedRunpodEndpointIds,
} from './cosUniversityGraduateEndpointProtection.ts'
import { deleteTerminalMassDistilledRunpodEndpoint } from './runpodMassDistilledProvisionV2.ts'

const PROFILE = 'cos_local_distilled_runtime_deploy_v1'
const MAX_DELETIONS_PER_RUN = 20
const PAGE_SIZE = 500
const clean = (value: unknown, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export async function garbageCollectTerminalMassDistilledEndpoints(input: { dryRun?: boolean; maxDeletes?: number } = {}) {
  const db = cosServiceDb()
  if (!db) throw new Error('runpod_endpoint_gc_database_unavailable')

  // DB-first by design. The incident we repair is the account-wide RunPod /serverless list failing
  // under endpoint accumulation, so GC must not require that list in order to make progress.
  const terminalArtifacts: Array<{ candidate_id: string; trained_artifact_hash: string }> = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = await db.from('cos_local_distillation_artifacts')
      .select('candidate_id,trained_artifact_hash')
      .eq('status', 'quarantined')
      .like('candidate_id', 'mass:%')
      .order('updated_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (rows.error) throw rows.error
    terminalArtifacts.push(...((rows.data || []) as any[]))
    if ((rows.data || []).length < PAGE_SIZE) break
  }

  const terminalKeys = new Set(terminalArtifacts
    .map(row => {
      const candidateId = clean(row.candidate_id, 300)
      const artifactHash = clean(row.trained_artifact_hash, 64).toLowerCase()
      return candidateId.startsWith('mass:') && /^[a-f0-9]{64}$/.test(artifactHash)
        ? `${candidateId}\u0000${artifactHash}` : ''
    }).filter(Boolean))
  const candidateIds = [...new Set(terminalArtifacts.map(row => clean(row.candidate_id, 300)).filter(Boolean))]
  if (!candidateIds.length) return Object.freeze({ terminalArtifacts: 0, ownedEndpoints: 0, eligible: 0, deleted: 0, dryRun: input.dryRun === true })

  const ownership = new Map<string, { candidateId: string; artifactHash: string; endpointName: string }>()
  for (let offset = 0; offset < candidateIds.length; offset += 75) {
    const chunk = candidateIds.slice(offset, offset + 75)
    const rows = await db.from('cos_university_learning_assurance_events')
      .select('candidate_id,evidence,observed_at')
      .eq('event_type', 'fine_tune')
      .contains('evidence', { profile: PROFILE })
      .in('candidate_id', chunk)
      .order('observed_at', { ascending: false })
      .limit(5000)
    if (rows.error) throw rows.error
    for (const row of rows.data || []) {
      const evidence = (row as { evidence?: Record<string, unknown> }).evidence || {}
      const candidateId = clean((row as { candidate_id?: unknown }).candidate_id, 300)
      const artifactHash = clean(evidence.artifactHash, 64).toLowerCase()
      const endpointId = clean(evidence.endpointId, 160).toLowerCase()
      const endpointName = clean(evidence.endpointName, 240)
      if (!terminalKeys.has(`${candidateId}\u0000${artifactHash}`)) continue
      if (!endpointId || !endpointName.startsWith('itmounts-mass-distilled-')) continue
      // A durable retirement marker advances later runs past endpoints already deleted. Provider 404s
      // are also persisted below so stale ownership evidence cannot pin the first batch forever.
      if (evidence.endpointRetired === true) { ownership.delete(endpointId); continue }
      if (!ownership.has(endpointId)) ownership.set(endpointId, { candidateId, artifactHash, endpointName })
    }
  }

  const [protectedIds, protectedResidencyNames] = await Promise.all([
    protectedRunpodEndpointIds(),
    activeResidencyRunpodEndpointNames(),
  ])
  const eligible = [...ownership.entries()].filter(([id, owner]) =>
    !protectedIds.has(id) && !protectedResidencyNames.has(owner.endpointName))
  const maxDeletes = Math.max(1, Math.min(MAX_DELETIONS_PER_RUN, Math.floor(Number(input.maxDeletes || MAX_DELETIONS_PER_RUN))))
  const selected = eligible.slice(0, maxDeletes)

  if (input.dryRun === true) {
    return Object.freeze({ terminalArtifacts: terminalKeys.size, ownedEndpoints: ownership.size, eligible: eligible.length, selected: selected.length, deleted: 0, dryRun: true })
  }

  let deleted = 0
  let alreadyGone = 0
  const failures: string[] = []
  const recordRetired = async (endpointId: string, owner: { candidateId: string; artifactHash: string; endpointName: string }, reason: 'deleted' | 'already_gone') => {
    const evidence = { profile: PROFILE, claim: 'local_distilled_runtime_endpoint_retired', candidateId: owner.candidateId, artifactHash: owner.artifactHash, endpointId, endpointName: owner.endpointName, endpointRetired: true, reason, authorityExpanded: false }
    const result = await db.from('cos_university_learning_assurance_events').insert({
      event_key: `endpoint-retired:${endpointId}`,
      event_type: 'fine_tune',
      subject_id: null,
      candidate_id: owner.candidateId,
      evidence_hash: `endpoint-retired:${endpointId}`,
      evidence,
      verifier: 'host_controller',
      observed_at: new Date().toISOString(),
    })
    if (result.error && !String(result.error.message || '').toLowerCase().includes('duplicate')) throw result.error
  }
  for (const [endpointId, owner] of selected) {
    try {
      await deleteTerminalMassDistilledRunpodEndpoint(endpointId)
      await recordRetired(endpointId, owner, 'deleted')
      deleted += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/HTTP 404\b/.test(message)) {
        await recordRetired(endpointId, owner, 'already_gone')
        alreadyGone += 1
        continue
      }
      failures.push(message.slice(0, 180))
    }
  }
  return Object.freeze({
    terminalArtifacts: terminalKeys.size,
    ownedEndpoints: ownership.size,
    eligible: eligible.length,
    selected: selected.length,
    deleted,
    alreadyGone,
    failed: failures.length,
    failures: Object.freeze(failures.slice(0, 5)),
    dryRun: false,
  })
}
