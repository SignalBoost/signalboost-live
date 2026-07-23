import { createHash } from 'node:crypto'
import type { CodeRepairContextPackage } from './contracts.ts'
import type { CodeRepairDiagnosis, CodeRepairEvidence, CodeRepairRootCauseCandidate } from './diagnosis-contracts.ts'

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort())
}

function evidenceFor(context: CodeRepairContextPackage): readonly CodeRepairEvidence[] {
  const evidence: CodeRepairEvidence[] = []
  evidence.push({ kind: 'workflow', reference: context.failure.workflowName ?? 'unknown', summary: `${context.failure.failedJob ?? 'unknown job'} / ${context.failure.failedStep ?? 'unknown step'}`, weight: 20 })
  for (const file of context.failure.changedFiles) evidence.push({ kind: 'changed_file', reference: file, summary: 'File changed in the failing commit.', weight: 20 })
  for (const file of context.selectedContext.files) {
    evidence.push({ kind: file.relativePath.includes('test') ? 'test' : 'selected_file', reference: file.relativePath, summary: file.reasons.join('; '), weight: Math.min(40, Math.max(1, file.score)) })
  }
  if (context.failure.sanitizedLogs.trim()) evidence.push({ kind: 'log', reference: context.failure.failedStep ?? context.failure.failedJob ?? 'workflow', summary: context.failure.sanitizedLogs.slice(0, 500), weight: 30 })
  return Object.freeze(evidence.slice(0, 100))
}

function title(context: CodeRepairContextPackage): string {
  switch (context.failure.category) {
    case 'typecheck': return 'Type contract or import mismatch'
    case 'unit_test': return 'Behavioral regression in the tested unit'
    case 'integration_test': return 'Cross-module contract or integration regression'
    case 'build': return 'Compilation or framework build regression'
    case 'lint': return 'Repository convention or static-quality violation'
    case 'security': return 'Security policy or dependency finding'
    case 'deployment': return 'Deployment configuration or runtime packaging failure'
    default: return 'Unclassified repository regression'
  }
}

function candidate(context: CodeRepairContextPackage, evidence: readonly CodeRepairEvidence[], confidence: number, suffix = 'primary'): CodeRepairRootCauseCandidate {
  const suspectedFiles = unique([
    ...context.failure.changedFiles,
    ...context.selectedContext.files.slice(0, 8).map(file => file.relativePath),
  ]).slice(0, 12)
  const id = createHash('sha256').update(`${context.failure.fingerprint}:${suffix}:${suspectedFiles.join('|')}`).digest('hex').slice(0, 20)
  return Object.freeze({
    id,
    title: title(context),
    explanation: `The ${context.failure.category} failure is most strongly associated with the changed and dependency-selected files supported by the workflow evidence.`,
    confidence,
    category: context.failure.category,
    suspectedFiles: Object.freeze(suspectedFiles),
    evidence: Object.freeze(evidence.slice(0, 20)),
  })
}

export function analyzeCodeRepairRootCause(context: CodeRepairContextPackage): CodeRepairDiagnosis {
  const evidence = evidenceFor(context)
  const hasChangedFiles = context.failure.changedFiles.length > 0
  const hasSelectedFiles = context.selectedContext.files.length > 0
  const confidence = Math.min(0.95, 0.45 + (hasChangedFiles ? 0.2 : 0) + (hasSelectedFiles ? 0.2 : 0) + (context.failure.category !== 'unknown' ? 0.1 : 0))
  const primaryCause = candidate(context, evidence, confidence)
  const alternatives = context.failure.category === 'unknown'
    ? [candidate(context, evidence.filter(item => item.kind !== 'changed_file'), Math.max(0.2, confidence - 0.25), 'alternative')]
    : []
  return Object.freeze({
    incidentId: context.failure.incidentId,
    primaryCause,
    alternativeCauses: Object.freeze(alternatives),
    evidence,
    context,
  })
}
