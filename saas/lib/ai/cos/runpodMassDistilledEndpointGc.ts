import { cosServiceDb } from '../../cos-core/storage/service-db.ts'
import {
  activeResidencyRunpodEndpointNames,
  protectedRunpodEndpointIds,
} from './cosUniversityGraduateEndpointProtection.ts'
import {
  deleteTerminalMassDistilledRunpodEndpoint,
  listMassDistilledRunpodEndpoints,
} from './runpodMassDistilledProvisionV2.ts'

const MASS_PREFIX = 'itmounts-mass-distilled-'
const PROFILE = 'cos_local_distilled_runtime_deploy_v1'
const TERMINAL_ARTIFACT_STATUSES = new Set(['quarantined'])
const MAX_DELETIONS_PER_RUN = 20

const clean = (value: unknown, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

type Endpoint = { id?: string; name?: string; workers?: { min?: number; max?: number } }

export async function garbageCollectTerminalMassDistilledEndpoints(input: { dryRun?: boolean; maxDeletes?: number } = {}) {
  const db = cosServiceDb()
  if (!db) throw new Error('runpod_endpoint_gc_database_unavailable')

  const [endpoints, protectedIds, protectedResidencyNames] = await Promise.all([
    listMassDistilledRunpodEndpoints(),
    protectedRunpodEndpointIds(),
    activeResidencyRunpodEndpointNames(),
  ])

  const mass = (endpoints as readonly Endpoint[]).filter(endpoint =>
    clean(endpoint.name, 240).toLowerCase().startsWith(MASS_PREFIX))
  const endpointIds = mass.map(endpoint => clean(endpoint.id, 160).toLowerCase()).filter(Boolean)
  if (!endpointIds.length) return Object.freeze({ inventoried: endpoints.length, massEndpoints: 0, eligible: 0, deleted: 0, dryRun: input.dryRun === true })

  // Ownership is positive evidence, never inferred from endpoint names alone.
  const ownership = new Map<string, { candidateId: string; artifactHash: string }>()
  const chunkSize = 75
  for (let offset = 0; offset < endpointIds.length; offset += chunkSize) {
    const chunk = endpointIds.slice(offset, offset + chunkSize)
    const rows = await db.from('cos_university_learning_assurance_events')
      .select('candidate_id,evidence,observed_at')
      .eq('event_type', 'fine_tune')
      .contains('evidence', { profile: PROFILE })
      .in('evidence->>endpointId', chunk)
      .order('observed_at', { ascending: false })
      .limit(1000)
    if (rows.error) throw rows.error
    for (const row of rows.data || []) {
      const evidence = (row as { evidence?: Record<string, unknown> }).evidence || {}
      const endpointId = clean(evidence.endpointId, 160).toLowerCase()
      const candidateId = clean((row as { candidate_id?: unknown }).candidate_id, 300)
      const artifactHash = clean(evidence.artifactHash, 64).toLowerCase()
      if (!endpointId || ownership.has(endpointId) || !candidateId.startsWith('mass:') || !/^[a-f0-9]{64}$/.test(artifactHash)) continue
      ownership.set(endpointId, { candidateId, artifactHash })
    }
  }

  const candidateIds = [...new Set([...ownership.values()].map(value => value.candidateId))]
  const terminal = new Set<string>()
  for (let offset = 0; offset < candidateIds.length; offset += 75) {
    const chunk = candidateIds.slice(offset, offset + 75)
    const rows = await db.from('cos_local_distillation_artifacts')
      .select('candidate_id,trained_artifact_hash,status')
      .in('candidate_id', chunk)
      .limit(1000)
    if (rows.error) throw rows.error
    for (const row of rows.data || []) {
      const candidateId = clean((row as any).candidate_id, 300)
      const artifactHash = clean((row as any).trained_artifact_hash, 64).toLowerCase()
      const status = clean((row as any).status, 80)
      if (candidateId && /^[a-f0-9]{64}$/.test(artifactHash) && TERMINAL_ARTIFACT_STATUSES.has(status)) {
        terminal.add(`${candidateId}\u0000${artifactHash}`)
      }
    }
  }

  const eligible = mass.filter(endpoint => {
    const id = clean(endpoint.id, 160).toLowerCase()
    const name = clean(endpoint.name, 240)
    const owner = ownership.get(id)
    if (!id || !owner) return false
    if (protectedIds.has(id) || protectedResidencyNames.has(name)) return false
    if (Number(endpoint.workers?.min ?? 0) !== 0 || Number(endpoint.workers?.max ?? 0) !== 0) return false
    return terminal.has(`${owner.candidateId}\u0000${owner.artifactHash}`)
  })

  const maxDeletes = Math.max(1, Math.min(MAX_DELETIONS_PER_RUN, Math.floor(Number(input.maxDeletes || MAX_DELETIONS_PER_RUN))))
  const selected = eligible.slice(0, maxDeletes)
  if (input.dryRun === true) {
    return Object.freeze({ inventoried: endpoints.length, massEndpoints: mass.length, owned: ownership.size, eligible: eligible.length, selected: selected.length, deleted: 0, dryRun: true })
  }

  let deleted = 0
  for (const endpoint of selected) {
    await deleteTerminalMassDistilledRunpodEndpoint(clean(endpoint.id, 160))
    deleted += 1
  }
  return Object.freeze({ inventoried: endpoints.length, massEndpoints: mass.length, owned: ownership.size, eligible: eligible.length, selected: selected.length, deleted, dryRun: false })
}
