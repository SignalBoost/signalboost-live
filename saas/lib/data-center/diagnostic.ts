import type { DataCenterIncidentCluster } from './correlation.ts'
import { dataCenterDiagnosticEvidenceBlock } from './supervisorBridge.ts'

export type DataCenterDiagnosticHypothesis = {
  label: string
  confidence: 'low' | 'moderate' | 'high'
  rationale: string
  supportingObservationIds: string[]
}

export type DataCenterOperatorCheck = {
  priority: number
  action: string
  reason: string
}

export type DataCenterDiagnostic = {
  schema: 'signalboost-data-center-diagnostic-v1'
  clusterId: string
  summary: string
  observedFacts: string[]
  hypotheses: DataCenterDiagnosticHypothesis[]
  operatorChecks: DataCenterOperatorCheck[]
  missingEvidence: string[]
  controlAuthority: 'none'
  rootCauseStatus: 'unproven'
}

export interface DataCenterDiagnosticAiPort {
  generate(input: { prompt: string; systemPrompt?: string; maxTokens?: number }): Promise<string>
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function stringValue(value: unknown, max = 1200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function stringList(value: unknown, maxItems = 12, maxChars = 800): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => stringValue(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems)
}

function confidence(value: unknown): DataCenterDiagnosticHypothesis['confidence'] {
  const clean = stringValue(value, 40).toLowerCase()
  return clean === 'high' || clean === 'moderate' || clean === 'low' ? clean : 'low'
}

function validObservationIds(value: unknown, allowed: Set<string>): string[] {
  return stringList(value, 20, 160).filter(id => allowed.has(id))
}

function hypotheses(value: unknown, allowed: Set<string>): DataCenterDiagnosticHypothesis[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 5).flatMap(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const row = raw as Record<string, unknown>
    const label = stringValue(row.label, 240)
    const rationale = stringValue(row.rationale, 1200)
    if (!label || !rationale) return []
    return [{
      label,
      confidence: confidence(row.confidence),
      rationale,
      supportingObservationIds: validObservationIds(row.supportingObservationIds, allowed),
    }]
  })
}

function operatorChecks(value: unknown): DataCenterOperatorCheck[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 8).flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const row = raw as Record<string, unknown>
    const action = stringValue(row.action, 500)
    const reason = stringValue(row.reason, 800)
    if (!action || !reason) return []
    const candidatePriority = Number(row.priority)
    const priority = Number.isFinite(candidatePriority)
      ? Math.max(1, Math.min(8, Math.round(candidatePriority)))
      : index + 1
    return [{ priority, action, reason }]
  }).sort((a, b) => a.priority - b.priority)
}

function normalizeDiagnostic(raw: string, cluster: DataCenterIncidentCluster): DataCenterDiagnostic {
  const parsed = extractJsonObject(raw)
  if (!parsed) throw new Error('data_center_diagnostic_invalid_json')
  const allowedIds = new Set(cluster.observations.map(item => item.observationId))
  const summary = stringValue(parsed.summary, 1200)
  const observedFacts = stringList(parsed.observedFacts, 16, 800)
  const parsedHypotheses = hypotheses(parsed.hypotheses, allowedIds)
  const checks = operatorChecks(parsed.operatorChecks)
  const missingEvidence = stringList(parsed.missingEvidence, 12, 800)

  if (!summary || !observedFacts.length || !checks.length) {
    throw new Error('data_center_diagnostic_incomplete')
  }

  return {
    schema: 'signalboost-data-center-diagnostic-v1',
    clusterId: cluster.clusterId,
    summary,
    observedFacts,
    hypotheses: parsedHypotheses,
    operatorChecks: checks,
    missingEvidence,
    controlAuthority: 'none',
    rootCauseStatus: 'unproven',
  }
}

function prompt(cluster: DataCenterIncidentCluster): string {
  return [
    'Analyze the supplied data-center operations evidence for an operator.',
    '',
    'Rules:',
    '- Use ONLY the supplied evidence. Never invent sensor values, equipment state, topology, maintenance history, workload, weather, or causal facts.',
    '- Separate directly observed facts from hypotheses.',
    '- Correlation does not establish root cause. All root-cause statements must remain hypotheses.',
    '- If evidence is weak or ambiguous, say what is missing.',
    '- Recommend read-only/operator inspection checks only. Do NOT recommend changing a setpoint, opening/closing a breaker, switching UPS/ATS state, starting/stopping a generator, changing cooling controls, or writing to DCIM/BMS/BACnet/Modbus.',
    '- A check may instruct a human operator to inspect, verify, compare, review, measure, or consult an approved runbook/manual.',
    '- Return only JSON. No markdown.',
    '',
    'Required JSON shape:',
    '{"summary":"...","observedFacts":["..."],"hypotheses":[{"label":"...","confidence":"low|moderate|high","rationale":"...","supportingObservationIds":["..."]}],"operatorChecks":[{"priority":1,"action":"...","reason":"..."}],"missingEvidence":["..."]}',
    '',
    dataCenterDiagnosticEvidenceBlock(cluster),
  ].join('\n')
}

export async function diagnoseDataCenterCluster(
  cluster: DataCenterIncidentCluster,
  ai: DataCenterDiagnosticAiPort,
): Promise<DataCenterDiagnostic> {
  if (!cluster.observations.length) throw new Error('data_center_cluster_empty')
  const raw = await ai.generate({
    systemPrompt: 'You are the COS data-center operations diagnostic layer. You reason from bounded evidence, preserve uncertainty, and have no facility-control authority. Return only the requested JSON.',
    prompt: prompt(cluster),
    maxTokens: 2400,
  })
  return normalizeDiagnostic(raw, cluster)
}
