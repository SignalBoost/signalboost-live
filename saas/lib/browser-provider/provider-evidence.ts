export type EvidenceId =
  | 'deployment-failure'
  | 'deployment-success'
  | 'dashboard-overview'
  | 'project-metadata'
  | 'environment-metadata'
  | 'domain-state'

export interface EvidenceProfile {
  id: EvidenceId
  expectedScreenshots: readonly string[]
  expectedReads: readonly string[]
  expectedMetadata: readonly string[]
  schemaVersion: '1.0.0'
}

export function createEvidenceRegistry(items: readonly EvidenceProfile[]) {
  const values = [...items]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(item =>
      Object.freeze({
        ...item,
        expectedScreenshots: Object.freeze([...item.expectedScreenshots]),
        expectedReads: Object.freeze([...item.expectedReads]),
        expectedMetadata: Object.freeze([...item.expectedMetadata]),
      }),
    )
  const map = new Map(values.map(item => [item.id, item]))

  return Object.freeze({
    get(id: EvidenceId) {
      const value = map.get(id)
      if (!value) throw new Error('unknown_evidence')
      return value
    },
    list() {
      return [...values]
    },
  })
}
