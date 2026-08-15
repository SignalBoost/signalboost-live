// saas/lib/autonomous-supervisor/diagnostic.ts
import {
  SUPERVISOR_THINKER_RESPONSE_SCHEMA,
  SUPERVISOR_THINKER_SYSTEM_PROMPT,
  assertIncidentIdMatches,
  type SupervisorThinkerResponse,
} from '@/lib/cos/supervisor-thinker-prompt'
import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { callLocalModel, checkLocalInferenceHealth, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease'
import { runpodLifecycleEnabled } from '@/lib/ai/cos/runpodLifecycle'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { SupabaseExactCacheStore } from '@/lib/cos-core/storage/exactSupabase'
import { supervisorDiagnosticCacheKey } from './diagnostic-cache-key.ts'
import type { DiagnosticResult, NormalizedIncidentPayload } from './types.ts'

const METHODS = new Set(['api', 'code_change', 'cli', 'ui_agent', 'human_action', 'no_action'])
const RISKS = new Set(['low', 'medium', 'high', 'critical'])
const ai = createPlatformAiPort()
const DIAGNOSTIC_IN_FLIGHT = new Map<string, Promise<DiagnosticResult>>()

function boundedNumber(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name] ?? fallback)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

function supervisorLocalTimeoutMs(): number {
  return Math.round(boundedNumber('COS_SUPERVISOR_LOCAL_TIMEOUT_MS', 35_000, 5_000, 60_000))
}

function supervisorLocalMaxTokens(): number {
  return Math.round(boundedNumber('COS_SUPERVISOR_LOCAL_MAX_TOKENS', 1_800, 512, 3_000))
}

function diagnosticCacheTtlMs(): number {
  return Math.round(boundedNumber('COS_SUPERVISOR_DIAGNOSTIC_CACHE_MS', 60 * 60_000, 60_000, 6 * 60 * 60_000))
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('Thinker response did not contain a JSON object')
  return JSON.parse(cleaned.slice(start, end + 1))
}

export function validateDiagnostic(value: unknown, incidentId: string): DiagnosticResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Diagnostic must be an object')
  const v = value as Record<string, any>
  const requiredStrings = ['incident_id', 'incident_summary', 'diagnosis', 'confidence_reason']
  for (const key of requiredStrings) if (typeof v[key] !== 'string' || !v[key]) throw new Error(`Diagnostic ${key} is required`)
  if (!Number.isInteger(v.confidence_score) || v.confidence_score < 0 || v.confidence_score > 100) throw new Error('Invalid confidence_score')
  if (!METHODS.has(v.recommended_execution_method)) throw new Error('Invalid recommended_execution_method')
  if (!RISKS.has(v.risk_level)) throw new Error('Invalid risk_level')
  if (typeof v.requires_ui_agent !== 'boolean' || typeof v.requires_human_approval !== 'boolean') throw new Error('Invalid approval flags')
  for (const key of ['evidence', 'missing_information', 'risk_reasons', 'repair_plan', 'verification_plan', 'rollback_plan']) {
    if (!Array.isArray(v[key])) throw new Error(`Diagnostic ${key} must be an array`)
  }
  if (v.repair_plan.some((step: any) => !step || !Number.isInteger(step.step) || typeof step.action !== 'string' || typeof step.requires_approval !== 'boolean')) throw new Error('Invalid repair_plan')
  const result = v as SupervisorThinkerResponse
  assertIncidentIdMatches(incidentId, result)
  return result
}

function fallbackDiagnostic(incident: NormalizedIncidentPayload, reason: string): DiagnosticResult {
  return {
    incident_id: incident.incident_id,
    incident_summary: `${incident.project} reported a ${incident.trigger.toLowerCase().replaceAll('_', ' ')} incident from ${incident.provider}.`,
    diagnosis: `The supplied evidence confirms an incident but automated diagnosis was unavailable: ${reason}`,
    confidence_score: 25,
    confidence_reason: 'Diagnosis is based only on the normalized incident evidence because no diagnostic thinker completed the contract.',
    evidence: [
      { source: 'error_summary', finding: incident.error_summary },
      { source: 'supplied_evidence', finding: incident.raw_logs.slice(0, 700) },
    ],
    missing_information: ['Validated COS or fallback diagnostic response'],
    recommended_execution_method: 'human_action',
    requires_ui_agent: false,
    requires_human_approval: true,
    risk_level: 'critical',
    risk_reasons: ['Automated diagnosis unavailable', 'No mutation may execute from an unvalidated diagnostic'],
    repair_plan: [],
    verification_plan: [],
    rollback_plan: [],
    escalation_reason: reason,
  }
}

async function readCachedDiagnostic(incident: NormalizedIncidentPayload): Promise<DiagnosticResult | null> {
  const db = cosServiceDb()
  if (!db) return null
  try {
    const entry = await new SupabaseExactCacheStore(db).get<DiagnosticResult>(supervisorDiagnosticCacheKey(incident))
    if (!entry?.value) return null
    return validateDiagnostic(entry.value, incident.incident_id)
  } catch {
    return null
  }
}

async function writeCachedDiagnostic(incident: NormalizedIncidentPayload, diagnostic: DiagnosticResult, ttlMs = diagnosticCacheTtlMs()): Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  try {
    const now = Date.now()
    await new SupabaseExactCacheStore(db).set(supervisorDiagnosticCacheKey(incident), {
      value: diagnostic,
      createdAt: now,
      expiresAt: now + ttlMs,
    })
  } catch (error) {
    console.warn('[cos-supervisor-diagnostic] cache write failed', error instanceof Error ? error.message : String(error))
  }
}

export interface DiagnosticThinker {
  id: string
  think(incident: NormalizedIncidentPayload, systemPrompt: string, responseSchema: unknown): Promise<string>
}

const THINKERS = new Map<string, DiagnosticThinker>()
export function registerDiagnosticThinker(thinker: DiagnosticThinker): void {
  if (!thinker?.id || typeof thinker.think !== 'function') throw new Error('A diagnostic thinker needs an id and a think() method')
  THINKERS.set(thinker.id, thinker)
}
export function listDiagnosticThinkers(): string[] { return Array.from(THINKERS.keys()).sort() }

/**
 * COS Primary is the first diagnostic brain, but background supervisor work is intentionally
 * single-pass. It must not fan out through the interactive Cognitive Council or trigger answer
 * repair/citation passes. One incident gets at most one bounded local Qwen request.
 */
export function createCosPrimaryDiagnosticThinker(): DiagnosticThinker {
  return {
    id: 'cos-primary',
    async think(incident, systemPrompt, responseSchema) {
      const prompt = [
        'INCIDENT EVIDENCE:',
        JSON.stringify(incident),
        '',
        'REQUIRED RESPONSE SCHEMA:',
        JSON.stringify(responseSchema),
        '',
        'Return only the diagnostic JSON object. Preserve incident_id exactly.',
      ].join('\n')

      const baseConfig = localInferenceConfigFromEnv()
      const timeoutMs = supervisorLocalTimeoutMs()
      const maxTokens = supervisorLocalMaxTokens()

      // When lifecycle control is unavailable, do a cheap health probe first. A stopped/unreachable
      // pod should fail in ~5 seconds and move to the governed fallback, not occupy a 35s inference slot.
      if (!runpodLifecycleEnabled()) {
        const health = await checkLocalInferenceHealth({ ...baseConfig, timeoutMs: Math.min(baseConfig.timeoutMs, 5_000) })
        if (!health.ok) throw new Error(`COS local reasoner unavailable: ${health.error || 'health check failed'}`)
      }

      await touchRunpodActivityLease('supervisor_diagnostic').catch(() => undefined)
      const text = await callLocalModel(
        {
          prompt,
          systemPrompt,
          maxTokens,
          temperature: 0,
        },
        { ...baseConfig, timeoutMs },
      )
      if (!text) throw new Error(`COS local diagnostic returned no response within ${timeoutMs}ms`)
      return text
    },
  }
}

export function createGeminiThinker(): DiagnosticThinker | null {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GEMINI_API_KEY || ''
  if (!apiKey) return null
  const model = process.env.COS_SUPERVISOR_GEMINI_MODEL || 'gemini-1.5-flash'
  return {
    id: 'gemini',
    async think(incident, systemPrompt, responseSchema) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: JSON.stringify(incident) }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema } }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || `Gemini returned ${res.status}`)
      return body?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').join('') || ''
    },
  }
}

export function createModelRouterThinker(): DiagnosticThinker | null {
  const preference = process.env.ANTHROPIC_API_KEY ? 'claude' : process.env.OPENAI_API_KEY ? 'openai' : ''
  if (!preference) return null
  return {
    id: preference,
    async think(incident, systemPrompt, responseSchema) {
      const system = [systemPrompt, '', 'Return ONLY raw JSON — no prose, no markdown fences — matching this schema exactly:', JSON.stringify(responseSchema)].join('\n')
      return ai.generate({ prompt: JSON.stringify(incident), systemPrompt: system, maxTokens: 2000, modelPreference: preference as 'claude' | 'openai' })
    },
  }
}

/** External diagnostic fallback selection. Kept public for existing tests/configuration. */
export function resolveDiagnosticThinker(): DiagnosticThinker | null {
  const wanted = String(process.env.SUPERVISOR_THINKER_PROVIDER || '').trim().toLowerCase()
  if (wanted && THINKERS.has(wanted)) return THINKERS.get(wanted) as DiagnosticThinker
  if (wanted === 'gemini') return createGeminiThinker()
  if (wanted === 'claude' || wanted === 'openai') return createModelRouterThinker()
  if (THINKERS.size) return THINKERS.values().next().value as DiagnosticThinker
  return createGeminiThinker() || createModelRouterThinker()
}

async function runThinker(incident: NormalizedIncidentPayload, thinker: DiagnosticThinker): Promise<DiagnosticResult> {
  const text = await thinker.think(incident, SUPERVISOR_THINKER_SYSTEM_PROMPT, SUPERVISOR_THINKER_RESPONSE_SCHEMA)
  return validateDiagnostic(extractJson(text), incident.incident_id)
}

async function diagnoseIncidentUncached(incident: NormalizedIncidentPayload): Promise<DiagnosticResult> {
  const failures: string[] = []
  for (const candidate of [createCosPrimaryDiagnosticThinker(), resolveDiagnosticThinker()].filter(Boolean) as DiagnosticThinker[]) {
    try {
      const result = await runThinker(incident, candidate)
      await writeCachedDiagnostic(incident, result)
      return result
    } catch (err) {
      failures.push(`${candidate.id}: ${err instanceof Error ? err.message : 'Unknown thinker error'}`)
    }
  }

  const fallback = fallbackDiagnostic(incident, failures.length ? failures.join(' | ') : 'No diagnostic thinker is configured')
  // Cache hard failure briefly so webhook retries or a persistent probe cannot immediately hammer
  // the stopped/unhealthy pod and all external fallbacks again.
  await writeCachedDiagnostic(incident, fallback, Math.min(diagnosticCacheTtlMs(), 5 * 60_000))
  return fallback
}

export async function diagnoseIncident(incident: NormalizedIncidentPayload, thinker?: DiagnosticThinker | null): Promise<DiagnosticResult> {
  // An explicitly supplied thinker is deterministic test/override behavior and bypasses cache.
  if (thinker !== undefined) {
    if (!thinker) return fallbackDiagnostic(incident, 'No diagnostic thinker is configured')
    try { return await runThinker(incident, thinker) }
    catch (err) { return fallbackDiagnostic(incident, `${thinker.id}: ${err instanceof Error ? err.message : 'Unknown thinker error'}`) }
  }

  const cached = await readCachedDiagnostic(incident)
  if (cached) {
    console.info('[cos-supervisor-diagnostic]', JSON.stringify({ at: new Date().toISOString(), incidentId: incident.incident_id, source: 'cache', modelCalls: 0 }))
    return cached
  }

  const key = supervisorDiagnosticCacheKey(incident)
  const existing = DIAGNOSTIC_IN_FLIGHT.get(key)
  if (existing) {
    console.info('[cos-supervisor-diagnostic]', JSON.stringify({ at: new Date().toISOString(), incidentId: incident.incident_id, source: 'in_flight_dedupe', modelCalls: 0 }))
    return existing
  }

  const pending = diagnoseIncidentUncached(incident)
  DIAGNOSTIC_IN_FLIGHT.set(key, pending)
  try {
    return await pending
  } finally {
    if (DIAGNOSTIC_IN_FLIGHT.get(key) === pending) DIAGNOSTIC_IN_FLIGHT.delete(key)
  }
}

export async function diagnoseIncidentWithGemini(incident: NormalizedIncidentPayload): Promise<DiagnosticResult> {
  return diagnoseIncident(incident, createGeminiThinker())
}
