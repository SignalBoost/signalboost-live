 // saas/cos-backup-core/ports.ts
// saas/cos-backup-core/ports.ts
// Host-agnostic contract for Backup COS continuity. Zero imports, zero
// platform assumptions — a buyer implements these three ports against their
// own approved playbook, their own model provider, and their own audit
// store. The algorithm that uses them lives in saas/lib/cos-backup/runtime.ts
// (runBackupCosWithConfig / recordCosRecoveryWithConfig), which defaults to
// the SignalBoost behavior when no config is supplied — nothing existing
// changes.

export interface CosReasoner {
  ask(prompt: string, opts: { maxTokens: number }): Promise<string>
}

export interface DecisionLogSink {
  record(entry: Record<string, unknown>): Promise<void>
}

export interface CosBackupRuntimeConfig {
  /** Loads the buyer's own approved continuity playbook/brain text. */
  loadBrain?: () => Promise<string>
  /** The buyer's model provider for read-only backup reasoning. */
  reasoner?: CosReasoner
  /** Where recovery/divergence events are recorded (their datastore/SIEM). */
  log?: DecisionLogSink
  /** Overrides the default backup-reasoning deadline. */
  timeoutMs?: number
}
