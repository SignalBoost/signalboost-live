// saas/lib/cos-backup/runtime.ts
// Read-only Backup COS provider and sanitized recovery logging. This module may
// reason and log, but it cannot call business tools or mutate provider state.

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { callModelDetailed } from '@/lib/ai/modelRouter'
import { getAdminSupabase } from '@/utils/supabase/server'
import type { BackupCosAnswer } from './policy.ts'
import type { CosBackupRuntimeConfig, DecisionLogSink } from '@/cos-backup-core'

export type { BackupCosAnswer } from './policy.ts'

export const COS_CONTINUITY_SCHEMA = 'signalboost-cos-continuity-v1' as const

const DEFAULT_BACKUP_TIMEOUT_MS = 12_000

export type CosRecoveryLog = {
  ok: boolean
  sourceCommit: string
  action: 'Activated Backup Read-Only Continuity' | 'Flagged Primary for Review'
  reason: string
  timestamp: string
  divergenceDetails: string[]
  recoveryStatus: 'backup_read_only_active' | 'backup_failed' | 'primary_returned_shadow_alert'
}

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function backupTimeoutMs(): number {
  const configured = Number(process.env.COS_BACKUP_TIMEOUT_MS)
  if (!Number.isFinite(configured)) return DEFAULT_BACKUP_TIMEOUT_MS
  return Math.max(2_000, Math.min(30_000, Math.trunc(configured)))
}

async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Backup COS deadline exceeded')), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function loadApprovedBrain(): Promise<string> {
  // next.config.mjs explicitly includes the root governance snapshot for
  // /api/concierge. Keep each fs expression statically scoped so Turbopack does
  // not widen NFT tracing to the entire repository.
  try {
    const value = await readFile(
      path.join(/* turbopackIgnore: true */ process.cwd(), '../cos-core/brain.md'),
      'utf8',
    )
    if (value.includes('signalboost-cos-brain-v1')) return value
  } catch {
    // Local fallback below.
  }

  try {
    const value = await readFile(
      path.join(/* turbopackIgnore: true */ process.cwd(), 'cos-core/brain.md'),
      'utf8',
    )
    if (value.includes('signalboost-cos-brain-v1')) return value
  } catch {
    // Fail closed below.
  }

  throw new Error('Approved COS brain snapshot is unavailable.')
}

function extractJson(value: string): Record<string, unknown> | null {
  const cleaned = String(value || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function finalizeBackupAnswer(
  brain: string,
  raw: string | null,
  execution: {
    provider?: string | null
    model?: string | null
    source?: 'provider' | 'cache' | 'configured_reasoner' | null
    externalAiInvoked?: boolean
  } = {},
): BackupCosAnswer {
  const parsed = extractJson(String(raw || ''))
  const answer = String(parsed?.answer || raw || '').trim()
  return {
    ok: answer.length >= 10,
    answer: answer || 'COS continuity mode is active, but the backup reasoning provider is temporarily unavailable.',
    intent: String(parsed?.intent || 'general_assistance').slice(0, 120),
    requiresApproval: Boolean(parsed?.requiresApproval),
    proposedTool: parsed?.proposedTool ? String(parsed.proposedTool).slice(0, 120) : null,
    confidence: Math.max(0, Math.min(100, Number(parsed?.confidence) || 50)),
    brainDigest: digest(brain),
    provider: execution.provider ?? null,
    model: execution.model ?? null,
    reasoningSource: execution.source ?? null,
    externalAiInvoked: execution.externalAiInvoked,
  }
}

export async function runBackupCos(normalizedInput: string, language = 'en'): Promise<BackupCosAnswer> {
  const brain = await loadApprovedBrain()
  const prompt = `${brain}\n\nBACKUP COS MODE:\n- You are read-only and advisory-only.\n- Do not call or claim to call any tool.\n- Do not claim any action was executed.\n- Do not expose secrets or internal diagnostics.\n- Answer the user's request as helpfully as possible.\n- Return strict JSON with keys answer, intent, requiresApproval, proposedTool, confidence.\n- answer must be in ${language}.\n\nUSER INPUT:\n${String(normalizedInput || '').slice(0, 12000)}`
  const execution = await withDeadline(
    callModelDetailed({ modelPreference: 'openai', prompt, maxTokens: 1200 }),
    backupTimeoutMs(),
  )
  return finalizeBackupAnswer(brain, execution?.text ?? null, {
    provider: execution?.provider ?? null,
    model: execution?.model ?? null,
    source: execution?.source ?? null,
    externalAiInvoked: execution?.source === 'provider' && execution.provider !== 'local',
  })
}

export async function recordCosRecovery(log: CosRecoveryLog): Promise<void> {
  try {
    const admin = getAdminSupabase()
    const { error } = await admin.from('cos_decisions').insert({
      decision_id: `cos_recovery_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      user_id: null,
      objective: log.action === 'Flagged Primary for Review'
        ? 'Review a material Primary and Backup COS quality divergence'
        : 'Maintain COS availability after a degraded Primary response',
      channel: 'cos_governance',
      state: log.action === 'Flagged Primary for Review' ? 'REVIEW' : 'FAILOVER_READ_ONLY',
      required_source: 'cos_continuity_router',
      must_use_tool: false,
      proposes_action: false,
      required_approval: false,
      approval_reasons: ['backup_read_only', ...log.divergenceDetails],
      confidence: log.ok ? 95 : 25,
      output: {
        schema: COS_CONTINUITY_SCHEMA,
        recovery: log,
        ownerAlertRequired: true,
        executionAllowed: false,
      },
      status: 'logged',
      created_at: new Date().toISOString(),
    })
    if (error) console.error('COS recovery log failed', error.message)
  } catch (error) {
    console.error('COS recovery log failed', error)
  }
}

/**
 * Host-agnostic entry points (additive — every function above this line is
 * unchanged and remains the default SignalBoost path: env timeout, the local
 * cos-core/brain.md snapshot, OpenAI, and the cos_decisions table). A buyer
 * supplies loadBrain / reasoner / log via CosBackupRuntimeConfig to run
 * Backup COS continuity on THEIR approved playbook, THEIR model provider,
 * and THEIR audit store, with zero change to this file. See
 * saas/cos-backup-host/signalboostCosBackupHost.ts for the reference
 * SignalBoost binding of this same config shape.
 */
export async function runBackupCosWithConfig(
  normalizedInput: string,
  language = 'en',
  config: CosBackupRuntimeConfig = {},
): Promise<BackupCosAnswer> {
  const brain = await (config.loadBrain ? config.loadBrain() : loadApprovedBrain())
  const prompt = `${brain}\n\nBACKUP COS MODE:\n- You are read-only and advisory-only.\n- Do not call or claim to call any tool.\n- Do not claim any action was executed.\n- Do not expose secrets or internal diagnostics.\n- Answer the user's request as helpfully as possible.\n- Return strict JSON with keys answer, intent, requiresApproval, proposedTool, confidence.\n- answer must be in ${language}.\n\nUSER INPUT:\n${String(normalizedInput || '').slice(0, 12000)}`

  if (config.reasoner) {
    const raw = await withDeadline(config.reasoner.ask(prompt, { maxTokens: 1200 }), config.timeoutMs ?? backupTimeoutMs())
    return finalizeBackupAnswer(brain, raw, {
      source: 'configured_reasoner',
      externalAiInvoked: undefined,
    })
  }

  const execution = await withDeadline(
    callModelDetailed({ modelPreference: 'openai', prompt, maxTokens: 1200 }),
    config.timeoutMs ?? backupTimeoutMs(),
  )
  return finalizeBackupAnswer(brain, execution?.text ?? null, {
    provider: execution?.provider ?? null,
    model: execution?.model ?? null,
    source: execution?.source ?? null,
    externalAiInvoked: execution?.source === 'provider' && execution.provider !== 'local',
  })
}

export async function recordCosRecoveryWithConfig(
  log: CosRecoveryLog,
  sink?: DecisionLogSink,
): Promise<void> {
  const row = {
    decision_id: `cos_recovery_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    user_id: null,
    objective: log.action === 'Flagged Primary for Review'
      ? 'Review a material Primary and Backup COS quality divergence'
      : 'Maintain COS availability after a degraded Primary response',
    channel: 'cos_governance',
    state: log.action === 'Flagged Primary for Review' ? 'REVIEW' : 'FAILOVER_READ_ONLY',
    required_source: 'cos_continuity_router',
    must_use_tool: false,
    proposes_action: false,
    required_approval: false,
    approval_reasons: ['backup_read_only', ...log.divergenceDetails],
    confidence: log.ok ? 95 : 25,
    output: {
      schema: COS_CONTINUITY_SCHEMA,
      recovery: log,
      ownerAlertRequired: true,
      executionAllowed: false,
    },
    status: 'logged',
    created_at: new Date().toISOString(),
  }

  if (sink) {
    try {
      await sink.record(row)
    } catch (error) {
      console.error('COS recovery log failed', error)
    }
    return
  }

  await recordCosRecovery(log)
}
