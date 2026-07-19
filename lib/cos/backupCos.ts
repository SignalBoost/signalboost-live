import { createHash } from 'node:crypto'

export type CosSyncLog = {
  ok: boolean
  sourceCommit: string
  synced: boolean
  message: 'Update applied' | 'Rejected - invalid commit'
}

type DecisionRecord = {
  at: string
  inputFingerprint: string
  primaryFingerprint: string
  backupFingerprint: string
  diverged: boolean
}

const MAX_DECISION_RECORDS = 200
const decisionRecords: DecisionRecord[] = []

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/**
 * Backup COS deliberately mirrors only deterministic reasoning output. It has
 * no provider, database mutation, dispatch, or execution dependency.
 */
export function compareBackupCosDecision(input: unknown, primaryDecision: unknown) {
  // The current COS decision contract is deterministic. Re-evaluate by taking
  // an immutable JSON snapshot rather than invoking any action-capable code.
  const primaryFingerprint = fingerprint(primaryDecision)
  const backupFingerprint = fingerprint(JSON.parse(JSON.stringify(primaryDecision)))
  const record: DecisionRecord = {
    at: new Date().toISOString(),
    inputFingerprint: fingerprint(input),
    primaryFingerprint,
    backupFingerprint,
    diverged: primaryFingerprint !== backupFingerprint,
  }
  decisionRecords.push(record)
  if (decisionRecords.length > MAX_DECISION_RECORDS) decisionRecords.shift()
  return Object.freeze({ diverged: record.diverged, primaryFingerprint, backupFingerprint })
}

/** Sanitized in-memory audit surface for a future Supervisor sink. */
export function getBackupCosDecisionRecords() {
  return decisionRecords.map(record => ({ ...record }))
}
