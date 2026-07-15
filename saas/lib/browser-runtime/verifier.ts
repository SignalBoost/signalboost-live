import { createHash } from 'crypto'
import type { BrowserEvidencePackage, BrowserPagePort, BrowserTask, BrowserVerificationResult } from './contracts.ts'

function normalizeOrigin(value: string): string {
  return new URL(value).origin
}

export function stableEvidenceHash(pkg: Omit<BrowserEvidencePackage, 'evidenceHash'>): string {
  return createHash('sha256').update(JSON.stringify(pkg)).digest('hex')
}

export async function verifyBrowserEvidencePackage(input: {
  task: BrowserTask
  evidencePackage: BrowserEvidencePackage
  page: BrowserPagePort
  successSelector: string
  savedValueSelector: string
  approvedValue: string
  now?: Date
}): Promise<BrowserVerificationResult> {
  const errors: string[] = []
  const { task, evidencePackage, page } = input

  if (evidencePackage.taskId !== task.taskId) errors.push('Evidence task_id does not match task')
  if (evidencePackage.incidentId !== task.incidentId) errors.push('Evidence incident_id does not match task')
  if (evidencePackage.provider !== task.provider) errors.push('Evidence provider is missing or mismatched')
  if (evidencePackage.adapterId !== task.adapterId) errors.push('Evidence adapter_id is missing or mismatched')
  if (!evidencePackage.approvalTokenDigest) errors.push('Approval token digest is missing')
  if (!evidencePackage.startedAt) errors.push('started_at is missing')
  if (!evidencePackage.completedAt) errors.push('completed_at is missing')
  if (!evidencePackage.finalUrl) errors.push('final URL is missing')
  if (!evidencePackage.browserRuntimeVersion) errors.push('browser/runtime version is missing')
  if (!Array.isArray(evidencePackage.orderedActionLog) || evidencePackage.orderedActionLog.length === 0) errors.push('ordered action log is missing')
  if (!Array.isArray(evidencePackage.screenshots) || evidencePackage.screenshots.length === 0) errors.push('screenshots are missing')

  const { evidenceHash: _ignoredHash, ...hashableEvidence } = evidencePackage
  const expectedHash = stableEvidenceHash(hashableEvidence)
  if (evidencePackage.evidenceHash !== expectedHash) errors.push('Evidence hash mismatch')

  const finalOrigin = normalizeOrigin(evidencePackage.finalUrl)
  const allowedOrigins = task.allowedOrigins.map(normalizeOrigin)
  if (!allowedOrigins.includes(finalOrigin)) errors.push('Final URL is outside allowedOrigins')

  try {
    await page.waitForSelector(input.successSelector)
  } catch {
    errors.push('Success marker does not exist')
  }

  try {
    const saved = await page.textContent?.(input.savedValueSelector)
    if (!saved || !saved.includes(input.approvedValue)) errors.push('Saved value does not match approved value')
  } catch {
    errors.push('Saved value could not be verified')
  }

  return {
    ok: errors.length === 0,
    checkedAt: (input.now ?? new Date()).toISOString(),
    errors,
  }
}
