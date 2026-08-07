import type { SupervisorIncident } from '../incident-schema.ts'
import type { CognitiveContext } from '../cognitive/types.ts'
import type { DiagnosisReport, DiagnosisValidation } from './types.ts'

export class DiagnosisValidator {
  validate(incident: SupervisorIncident, context: CognitiveContext, diagnosis: DiagnosisReport, minimumConfidence = 70): DiagnosisValidation {
    const reasons: string[] = []
    const knownEvidence = new Set(context.evidence.map(item => item.evidenceId))

    if (diagnosis.incidentId !== incident.incidentId) reasons.push('incident mismatch')
    if (!diagnosis.affectedResources.includes(context.affectedResource)) reasons.push('affected resource mismatch')
    if (diagnosis.confidenceScore < minimumConfidence) reasons.push('confidence below threshold')
    if (diagnosis.evidenceIds.length === 0) reasons.push('no evidence cited')
    for (const id of diagnosis.evidenceIds) if (!knownEvidence.has(id)) reasons.push(`unknown evidence: ${id}`)

    const referenced = new Set(diagnosis.evidenceIds.filter(id => knownEvidence.has(id)))
    const evidenceCoverage = knownEvidence.size === 0 ? 0 : Math.round((referenced.size / knownEvidence.size) * 100)
    return { valid: reasons.length === 0, reasons, evidenceCoverage }
  }
}
