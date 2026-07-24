// saas/cos-backup-host/signalboostCosBackupHost.ts
// saas/cos-backup-host/signalboostCosBackupHost.ts
import { callModel } from '@/lib/ai/modelRouter'
import { getAdminSupabase } from '@/utils/supabase/server'
import { loadApprovedBrain, backupTimeoutMs } from '@/lib/cos-backup/runtime'
import type {
  CosBackupRuntimeConfig,
  CosReasoner,
  DecisionLogSink,
} from '@/cos-backup-core'

/**
 * Reference SignalBoost binding — reproduces exactly the default behavior in
 * saas/lib/cos-backup/runtime.ts (the local cos-core/brain.md snapshot,
 * OpenAI as the read-only reasoner, the cos_decisions table) expressed as an
 * explicit CosBackupRuntimeConfig. A buyer writes their own version of this
 * ONE file — their own approved continuity playbook, their own model
 * provider, their own audit store — and Backup COS continuity runs
 * unchanged via runBackupCosWithConfig / recordCosRecoveryWithConfig.
 *
 * NOTE: cos-core/brain.md itself currently states an identity line
 * ("COS is SignalBoost's private Chief of Staff...") and is governed by a
 * CODEOWNERS review process (see its own file header) — this binding does
 * not alter that file. A buyer supplying their own loadBrain() bypasses it
 * entirely and never inherits that line.
 */

const reasoner: CosReasoner = {
  async ask(prompt, opts) {
    return callModel({ modelPreference: 'openai', prompt, maxTokens: opts.maxTokens })
  },
}

const log: DecisionLogSink = {
  async record(entry) {
    const admin = getAdminSupabase()
    const { error } = await admin.from('cos_decisions').insert(entry)
    if (error) throw new Error(error.message)
  },
}

export function createSignalBoostCosBackupConfig(): CosBackupRuntimeConfig {
  return {
    loadBrain: loadApprovedBrain,
    reasoner,
    log,
    timeoutMs: backupTimeoutMs(),
  }
}
