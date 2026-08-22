/** Outcome-backed remediation memory. It recommends only; governance remains authoritative. */
export interface RemediationExperience {
  incidentKey: string
  remedyId: string
  verified: boolean
  succeeded: boolean
  recordedAt: number
}

export interface RemediationMemoryRecord {
  incidentKey: string
  remedyId: string
  verifiedSuccesses: number
  verifiedFailures: number
  consecutiveFailures: number
  recommendationEligible: boolean
  updatedAt: number
}

export interface RemediationMemoryStore {
  get(incidentKey: string, remedyId: string): RemediationMemoryRecord | undefined | Promise<RemediationMemoryRecord | undefined>
  set(record: RemediationMemoryRecord): void | Promise<void>
  /** Optional atomic writer for durable stores; avoids losing concurrent verified outcomes. */
  recordExperience?(experience: RemediationExperience): RemediationMemoryRecord | Promise<RemediationMemoryRecord>
}

export function createInMemoryRemediationMemoryStore(): RemediationMemoryStore {
  const records = new Map<string, RemediationMemoryRecord>()
  const key = (incidentKey: string, remedyId: string) => `${incidentKey}\n${remedyId}`
  return Object.freeze({ get: (incidentKey, remedyId) => records.get(key(incidentKey, remedyId)), set: record => { records.set(key(record.incidentKey, record.remedyId), Object.freeze({ ...record })) } })
}

export async function recordRemediationExperience(store: RemediationMemoryStore, experience: RemediationExperience): Promise<RemediationMemoryRecord | null> {
  if (!experience.verified || !experience.incidentKey.trim() || !experience.remedyId.trim()) return null
  if (store.recordExperience) return store.recordExperience(experience)
  const prior = await store.get(experience.incidentKey, experience.remedyId)
  const succeeded = prior?.verifiedSuccesses ?? 0
  const failed = prior?.verifiedFailures ?? 0
  const consecutiveFailures = experience.succeeded ? 0 : (prior?.consecutiveFailures ?? 0) + 1
  const next = Object.freeze({
    incidentKey: experience.incidentKey,
    remedyId: experience.remedyId,
    verifiedSuccesses: succeeded + (experience.succeeded ? 1 : 0),
    verifiedFailures: failed + (experience.succeeded ? 0 : 1),
    consecutiveFailures,
    // Even a proven remedy is recommendation-only. A separate policy/governance gate decides execution.
    recommendationEligible: experience.succeeded && consecutiveFailures === 0 && (prior?.recommendationEligible || succeeded + 1 >= 3),
    updatedAt: experience.recordedAt,
  })
  await store.set(next)
  return next
}

export async function recommendRemedy(store: RemediationMemoryStore, incidentKey: string, remedyId: string): Promise<RemediationMemoryRecord | null> {
  const record = await store.get(incidentKey, remedyId)
  return record?.recommendationEligible && record.consecutiveFailures === 0 ? record : null
}
