import type { RepairDiagnostic, RepairWorkflowRequest } from './repair-types.ts'

export const MAX_REPAIR_DIAGNOSTIC_LENGTH = 512
export const MAX_REPAIR_PROMPT_LENGTH = 2_048
const SECRET = /(api[_-]?key|authorization|bearer|cookie|password|secret|token|credential)\s*[:= ]\s*[^\s,;]+/gi
const CONTROL = /[\u0000-\u001f\u007f]/g
export function sanitizeRepairDiagnostic(value: string, maximumLength = MAX_REPAIR_DIAGNOSTIC_LENGTH): string {
  return value.replace(CONTROL, ' ').replace(SECRET, '$1=[redacted]').replace(/\s+/g, ' ').trim().slice(0, maximumLength)
}
export function buildRepairPrompt(input: { request: RepairWorkflowRequest; diagnostic: RepairDiagnostic; attemptNumber: number; maximumCorrectionAttempts: number }): string {
  const d = input.diagnostic
  const prompt = [
    'The previous candidate failed verification.', '',
    `Stage: ${d.stage}`, `Category: ${d.category.replace(/_/g, ' ')}`, `Exit code: ${d.exitCode}`, `Timed out: ${d.timedOut}`, `Retryable: ${d.retryable}`,
    `Attempt: ${input.attemptNumber} of ${input.maximumCorrectionAttempts}`, `Required language: ${input.request.language}`, '',
    `Safe diagnostic: ${sanitizeRepairDiagnostic(d.safeSummary)}`, '',
    'Return a complete corrected replacement solution.', 'Preserve the requested public interface.', 'Do not return a patch or partial snippet.', 'Do not include explanations outside the candidate payload.',
  ].join('\n')
  return prompt.slice(0, MAX_REPAIR_PROMPT_LENGTH)
}
