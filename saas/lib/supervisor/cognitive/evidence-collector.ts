import type { IncidentEvidence, SupervisorIncident } from '../incident-schema.ts'
import type { CognitiveEvidenceSource } from './types.ts'

function stableEvidence(items: IncidentEvidence[]): IncidentEvidence[] {
  const byId = new Map<string, IncidentEvidence>()
  for (const item of items) if (!byId.has(item.evidenceId)) byId.set(item.evidenceId, item)
  return [...byId.values()].sort((a, b) => {
    const time = a.capturedAt.localeCompare(b.capturedAt)
    return time !== 0 ? time : a.evidenceId.localeCompare(b.evidenceId)
  })
}

export class EvidenceCollector {
  private readonly sources: readonly CognitiveEvidenceSource[]

  constructor(sources: readonly CognitiveEvidenceSource[] = []) {
    const ids = new Set<string>()
    for (const source of sources) {
      if (!source.sourceId.trim()) throw new Error('Cognitive evidence source requires sourceId')
      if (ids.has(source.sourceId)) throw new Error(`Duplicate cognitive evidence source: ${source.sourceId}`)
      ids.add(source.sourceId)
    }
    this.sources = [...sources].sort((a, b) => a.sourceId.localeCompare(b.sourceId))
  }

  async collect(incident: SupervisorIncident): Promise<IncidentEvidence[]> {
    const gathered: IncidentEvidence[] = [...incident.evidence]
    for (const source of this.sources) {
      const items = await source.collect({ incident })
      if (!Array.isArray(items)) throw new Error(`Evidence source ${source.sourceId} returned a non-array result`)
      for (const item of items) {
        if (!item?.evidenceId || !item.type || !item.capturedAt || !item.summary) {
          throw new Error(`Evidence source ${source.sourceId} returned invalid evidence`)
        }
        gathered.push(item)
      }
    }
    return stableEvidence(gathered)
  }
}
