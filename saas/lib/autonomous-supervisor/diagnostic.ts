// saas/lib/autonomous-supervisor/diagnostic.ts
import {
  SUPERVISOR_THINKER_RESPONSE_SCHEMA,
  SUPERVISOR_THINKER_SYSTEM_PROMPT,
  assertIncidentIdMatches,
  type SupervisorThinkerResponse,
} from '@/lib/cos/supervisor-thinker-prompt'
import type { DiagnosticResult, NormalizedIncidentPayload } from './types.ts'

const METHODS = new Set(['api', 'code_change', 'cli', 'ui_agent', 'human_action', 'no_action'])
const RISKS = new Set(['low', 'medium', 'high', 'critical'])

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
  if (v.repair_plan.some((step: any) => !step || !Number.isInteger(step.step) || typeof step.action !== 'string' || typeof step.requires_approval !== 'boolean')) {
    throw new Error('Invalid repair_plan')
  }
  const result = v as SupervisorThinkerResponse
  assertIncidentIdMatches(incidentId, result)
  return result
}

function fallbackDiagnostic(incident: NormalizedIncidentPayload, reason: string): DiagnosticResult {
  return {
    incident_id: incident.incident_id,
    incident_summary: `${incident.project} deployment failed on Vercel.`,
    diagnosis: `The supplied payload indicates a Vercel deployment failure. Automated LLM diagnosis was unavailable: ${reason}`,
    confidence_score: 35,
    confidence_reason: 'Diagnosis is based only on the normalized incident payload.',
    evidence: [
      { source: 'error_summary', finding: incident.error_summary },
      { source: 'raw_logs', finding: incident.raw_logs.slice(0, 500) },
    ],
    missing_information: ['Validated LLM diagnostic response'],
    recommended_execution_method: 'human_action',
    requires_ui_agent: false,
    requires_human_approval: true,
    risk_level: 'critical',
    risk_reasons: ['Production deployment failure', 'No repair may execute without owner approval'],
    repair_plan: [{ step: 1, action: 'Review the failed deployment and approve a bounded investigation.', executor: 'human', target: 'Vercel deployment and environment settings', expected_result: 'A safe repair path is confirmed before any production change.', requires_approval: true }],
    verification_plan: [{ step: 1, check: 'Confirm a replacement deployment reaches READY.', success_condition: 'The latest production deployment is READY.' }],
    rollback_plan: [],
    escalation_reason: reason,
  }
}

// ── THINKER PORT ─────────────────────────────────────────────────────────────
// The supervisor's diagnosis must not be welded to one vendor. A "thinker" is any
// model, agent, or service that can read an incident and return the diagnostic JSON.
// Gemini is simply the first adapter; a buyer plugs in their own with one call to
// registerDiagnosticThinker(). Validation, fallback and the response contract stay
// provider-neutral, so swapping the thinker never weakens the governance.
export interface DiagnosticThinker {
  id: string
  think(incident: NormalizedIncidentPayload, systemPrompt: string, responseSchema: unknown): Promise<string>
}

const THINKERS = new Map<string, DiagnosticThinker>()

/** Bring your own thinker: any model, agent, or endpoint that returns the diagnostic JSON. */
export function registerDiagnosticThinker(thinker: DiagnosticThinker): void {
  if (!thinker?.id || typeof thinker.think !== 'function') throw new Error('A diagnostic thinker needs an id and a think() method')
  THINKERS.set(thinker.id, thinker)
}

export function listDiagnosticThinkers(): string[] {
  return Array.from(THINKERS.keys()).sort()
}

// Adapter 1 — Google Gemini (structured-output mode).
export function createGeminiThinker(): DiagnosticThinker | null {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GEMINI_API_KEY || ''
  if (!apiKey) return null
  const model = process.env.COS_SUPERVISOR_GEMINI_MODEL || 'gemini-1.5-flash'
  return {
    id: 'gemini',
    async think(incident, systemPrompt, responseSchema) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(incident) }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema },
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || `Gemini returned ${res.status}`)
      return body?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').join('') || ''
    },
  }
}

// Adapter 2 — the platform's own model router (Claude / OpenAI), so the supervisor
// still thinks when no Gemini key exists. Uses keys the platform already has.
export function createModelRouterThinker(): DiagnosticThinker | null {
  const preference = process.env.ANTHROPIC_API_KEY ? 'claude' : process.env.OPENAI_API_KEY ? 'openai' : ''
  if (!preference) return null
  return {
    id: preference,
    async think(incident, systemPrompt, responseSchema) {
      const { callModel } = await import('@/lib/ai/modelRouter')
      const system = [
        systemPrompt,
        '',
        'Return ONLY raw JSON — no prose, no markdown fences — matching this schema exactly:',
        JSON.stringify(responseSchema),
      ].join('\n')
      const text = await callModel({ prompt: JSON.stringify(incident), systemPrompt: system, maxTokens: 2000, modelPreference: preference as 'claude' | 'openai' })
      return String(text || '')
    },
  }
}

/**
 * Pick the thinker: an explicitly registered one wins (BYO), then the provider named
 * by SUPERVISOR_THINKER_PROVIDER, then whatever credentials exist. Returns null only
 * when nothing at all is configured — in which case the caller degrades honestly.
 */
export function resolveDiagnosticThinker(): DiagnosticThinker | null {
  const wanted = String(process.env.SUPERVISOR_THINKER_PROVIDER || '').trim().toLowerCase()
  if (wanted && THINKERS.has(wanted)) return THINKERS.get(wanted) as DiagnosticThinker
  if (wanted === 'gemini') return createGeminiThinker()
  if (wanted === 'claude' || wanted === 'openai') return createModelRouterThinker()
  if (THINKERS.size) return THINKERS.values().next().value as DiagnosticThinker
  return createGeminiThinker() || createModelRouterThinker()
}

/** Provider-neutral diagnosis. Same validation and same honest fallback for every thinker. */
export async function diagnoseIncident(
  incident: NormalizedIncidentPayload,
  thinker: DiagnosticThinker | null = resolveDiagnosticThinker(),
): Promise<DiagnosticResult> {
  if (!thinker) return fallbackDiagnostic(incident, 'No diagnostic thinker is configured')
  try {
    const text = await thinker.think(incident, SUPERVISOR_THINKER_SYSTEM_PROMPT, SUPERVISOR_THINKER_RESPONSE_SCHEMA)
    return validateDiagnostic(extractJson(text), incident.incident_id)
  } catch (err) {
    return fallbackDiagnostic(incident, `${thinker.id}: ${err instanceof Error ? err.message : 'Unknown thinker error'}`)
  }
}

/** Back-compatible alias — existing callers keep working, now vendor-neutral underneath. */
export async function diagnoseIncidentWithGemini(incident: NormalizedIncidentPayload): Promise<DiagnosticResult> {
  return diagnoseIncident(incident)
}
