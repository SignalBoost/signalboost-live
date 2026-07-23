import { createHash } from 'node:crypto'
import type { CodeRepairContextPolicy, CodeRepairFailureCategory, CodeRepairFailureInput, NormalizedCodeRepairFailure } from './contracts.ts'

const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(?:api[_-]?key|token|secret|password|passwd)\s*[:=]\s*[^\s,;]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+/gi,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /https?:\/\/[^\s/@:]+:[^\s/@]+@/gi,
]

function boundedUnique(values: readonly string[] | undefined, maximum: number): readonly string[] {
  return Object.freeze([...new Set((values ?? []).map(value => value.trim()).filter(Boolean))].sort().slice(0, maximum))
}

function sanitizeLogs(logs: string, maximum: number): string {
  let sanitized = logs.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  for (const pattern of SECRET_PATTERNS) sanitized = sanitized.replace(pattern, '[REDACTED]')
  if (sanitized.length > maximum) sanitized = `${sanitized.slice(0, maximum)}\n[TRUNCATED]`
  return sanitized
}

function classify(input: CodeRepairFailureInput): CodeRepairFailureCategory {
  if (input.category) return input.category
  const text = `${input.workflowName ?? ''} ${input.failedJob ?? ''} ${input.failedStep ?? ''} ${input.logs}`.toLowerCase()
  if (/tsc|typecheck|type error|typescript/.test(text)) return 'typecheck'
  if (/integration/.test(text)) return 'integration_test'
  if (/unit test|node --test|jest|vitest|assertionerror/.test(text)) return 'unit_test'
  if (/next build|build failed|compile|compilation/.test(text)) return 'build'
  if (/eslint|lint/.test(text)) return 'lint'
  if (/security|vulnerability|secret scan|codeql/.test(text)) return 'security'
  if (/deploy|deployment|vercel/.test(text)) return 'deployment'
  return 'unknown'
}

export function normalizeCodeRepairFailure(input: CodeRepairFailureInput, policy: CodeRepairContextPolicy): NormalizedCodeRepairFailure {
  const changedFiles = boundedUnique(input.changedFiles, policy.maximumChangedFiles)
  const symbolHints = boundedUnique(input.symbolHints, policy.maximumSymbolHints)
  const sanitizedLogs = sanitizeLogs(input.logs, policy.maximumLogCharacters)
  const category = classify(input)
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ repository: input.repository, commitSha: input.commitSha, category, changedFiles, sanitizedLogs }))
    .digest('hex')
  return Object.freeze({
    incidentId: input.incidentId,
    repository: input.repository,
    commitSha: input.commitSha,
    workflowName: input.workflowName?.trim() || null,
    failedJob: input.failedJob?.trim() || null,
    failedStep: input.failedStep?.trim() || null,
    category,
    sanitizedLogs,
    changedFiles,
    symbolHints,
    fingerprint,
  })
}
