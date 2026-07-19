import { createHash } from 'node:crypto'

export const BACKUP_COS_SCHEMA = 'signalboost-backup-cos-v1' as const

export type CosDecision = {
  intent: string
  proposedTool: string | null
  requiresApproval: boolean
  confidence: number
  summary: string
}

export type BackupCosResult = {
  schema: typeof BACKUP_COS_SCHEMA
  advisoryOnly: true
  executionAllowed: false
  inputDigest: string
  brainDigest: string
  primary: CosDecision
  backup: CosDecision
  diverged: boolean
  divergenceReasons: string[]
  supervisorFlagRequired: boolean
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function normalizeDecision(value: CosDecision): CosDecision {
  return {
    intent: String(value.intent || '').trim().toLowerCase(),
    proposedTool: value.proposedTool ? String(value.proposedTool).trim() : null,
    requiresApproval: Boolean(value.requiresApproval),
    confidence: Math.max(0, Math.min(100, Number.isFinite(value.confidence) ? value.confidence : 0)),
    summary: String(value.summary || '').replace(/\s+/g, ' ').trim().slice(0, 500),
  }
}

export function compareCosDecisions(input: {
  normalizedInput: string
  approvedBrain: string
  primary: CosDecision
  backup: CosDecision
}): BackupCosResult {
  const primary = normalizeDecision(input.primary)
  const backup = normalizeDecision(input.backup)
  const reasons: string[] = []

  if (primary.intent !== backup.intent) reasons.push('intent_mismatch')
  if (primary.proposedTool !== backup.proposedTool) reasons.push('tool_mismatch')
  if (primary.requiresApproval !== backup.requiresApproval) reasons.push('approval_mismatch')
  if (Math.abs(primary.confidence - backup.confidence) > 25) reasons.push('confidence_gap')

  return {
    schema: BACKUP_COS_SCHEMA,
    advisoryOnly: true,
    executionAllowed: false,
    inputDigest: digest(String(input.normalizedInput || '')),
    brainDigest: digest(String(input.approvedBrain || '')),
    primary,
    backup,
    diverged: reasons.length > 0,
    divergenceReasons: reasons,
    supervisorFlagRequired: reasons.length > 0,
  }
}

export type CosSyncLog = {
  ok: boolean
  sourceCommit: string
  synced: boolean
  message: 'Update applied' | 'Rejected - invalid commit'
}

export function createCosSyncLog(sourceCommit: string, signatureValid: boolean): CosSyncLog {
  return signatureValid
    ? { ok: true, sourceCommit, synced: true, message: 'Update applied' }
    : { ok: false, sourceCommit, synced: false, message: 'Rejected - invalid commit' }
}
