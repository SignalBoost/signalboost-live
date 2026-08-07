import type { IncidentEvidence, SupervisorIncident } from '../incident-schema.ts'
import type { CognitiveContext } from './types.ts'

export class ContextBuilder {
  build(incident: SupervisorIncident, evidence: IncidentEvidence[]): CognitiveContext {
    return {
      incidentId: incident.incidentId,
      provider: incident.provider,
      environment: incident.environment,
      severity: incident.severity,
      source: incident.source,
      affectedResource: incident.affectedResource ?? incident.provider,
      detectedAt: incident.detectedAt,
      evidence: [...evidence],
      evidenceTypes: [...new Set(evidence.map(item => item.type))].sort(),
      ...(incident.errorCode ? { errorCode: incident.errorCode } : {}),
      metadata: { ...incident.metadata },
    }
  }

  enrichIncident(incident: SupervisorIncident, context: CognitiveContext): SupervisorIncident {
    return {
      ...incident,
      evidence: [...context.evidence],
      metadata: {
        ...incident.metadata,
        cognitiveEvidenceCount: context.evidence.length,
        cognitiveEvidenceTypes: context.evidenceTypes,
      },
    }
  }
}
