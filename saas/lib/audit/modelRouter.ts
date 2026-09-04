// Canonical Audit reasoning seam. Audit is a COS capability and therefore uses
// only the configured LOCAL_AI_* runtime. There is no external-provider fallback.

import { randomUUID } from 'node:crypto'
import {
  callLocalModel,
  checkLocalInferenceHealth,
  localInferenceConfigFromEnv,
} from '@/lib/ai/local-inference'
import { resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { TurnRecorder, extractQueryFeatures } from '@/lib/ai/cos/turnExperience'
import { hashPrompt, recordTurnExperience } from '@/lib/ai/cos/turnExperienceStore'
import { getAdminSupabase } from '@/utils/supabase/server'
import { AUDIT_UNTRUSTED_DATA_RULE } from '@/lib/audit/untrustedData'

export interface AuditModelArgs {
  prompt: string
  systemPrompt?: string
  maxTokens?: number
}

export interface AuditRuntimeIdentity {
  provider: 'cos'
  model: string
  reasoner: string
  runtimeProvider: 'independent-local' | 'managed-open-model'
}

const DEFAULT_MAX = 8192
const AUDIT_SYSTEM_DEFAULT =
  'You are the COS software-audit specialist. Analyze the provided source rigorously for ' +
  'vulnerabilities, RLS/authorization bypasses, injection, secret leakage, logic flaws, and ' +
  'standards violations. When asked for findings, return ONLY valid JSON in the exact shape ' +
  `requested — no prose and no markdown fences. ${AUDIT_UNTRUSTED_DATA_RULE}`

function auditRuntimeConfigFromEnv() {
  const reasoner = resolveCosReasoner()
  if ('reason' in reasoner) throw new Error(reasoner.reason)
  const config = localInferenceConfigFromEnv()
  return {
    config,
    identity: {
      provider: 'cos' as const,
      model: config.model,
      reasoner: reasoner.config.label,
      runtimeProvider: reasoner.config.kind,
    },
  }
}

export function auditRuntimeIdentityFromEnv(): AuditRuntimeIdentity {
  return auditRuntimeConfigFromEnv().identity
}

export async function preflightAuditCos(): Promise<
  { ok: true; identity: AuditRuntimeIdentity } | { ok: false; error: string }
> {
  try {
    const { config, identity } = auditRuntimeConfigFromEnv()
    const health = await checkLocalInferenceHealth(config)
    if (!health.ok) return { ok: false, error: health.error || 'Configured COS model is unavailable.' }
    return { ok: true, identity }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'COS Audit preflight failed.' }
  }
}

async function logAuditTask(row: {
  identity: AuditRuntimeIdentity
  status: 'success' | 'error'
  durationMs: number
  promptLen: number
}) {
  try {
    const admin = getAdminSupabase()
    await admin.from('ai_task_log').insert({
      task_type: 'audit',
      provider: row.identity.provider,
      model: row.identity.model,
      status: row.status,
      duration_ms: row.durationMs,
      fallback_used: false,
      error_message: row.status === 'error' ? 'cos_audit_reasoner_no_text' : null,
      metadata: {
        promptLength: row.promptLen,
        orchestrator: 'cos',
        specialistFamily: 'software',
        reasoner: row.identity.reasoner,
        runtimeProvider: row.identity.runtimeProvider,
      },
    })
  } catch {
    // Observability must never replace the Audit result.
  }
}

export async function callAuditModel(args: AuditModelArgs): Promise<string | null> {
  const startedAt = Date.now()
  const { config, identity } = auditRuntimeConfigFromEnv()
  const recorder = new TurnRecorder()
  const turnId = randomUUID()
  let text: string | null = null
  try {
    // The general prose reasoner may repair output into an {answer, confidence} envelope.
    // Audit requires several different strict JSON schemas, so it uses the same COS-only
    // LOCAL_AI transport while recording a COS-owned specialist turn directly.
    text = await recorder.time('audit_specialist_reasoning', () => callLocalModel({
      prompt: args.prompt,
      systemPrompt: args.systemPrompt ?? AUDIT_SYSTEM_DEFAULT,
      maxTokens: args.maxTokens ?? DEFAULT_MAX,
      temperature: 0,
    }, config), 'model')
  } finally {
    recordTurnExperience(recorder.snapshot({
      turnId,
      promptHash: hashPrompt(args.prompt),
      problemClass: 'software_audit',
      features: extractQueryFeatures(args.prompt),
      reasonerLabel: identity.reasoner,
      answered: Boolean(text?.trim()),
      confidence: null,
      confidenceThreshold: null,
    }))
  }
  await logAuditTask({
    identity,
    status: text ? 'success' : 'error',
    durationMs: Date.now() - startedAt,
    promptLen: args.prompt.length,
  })
  return text
}
