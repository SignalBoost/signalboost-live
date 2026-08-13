// saas/lib/autonomous-supervisor/diagnostic.ts
import {
  SUPERVISOR_THINKER_RESPONSE_SCHEMA,
  SUPERVISOR_THINKER_SYSTEM_PROMPT,
  assertIncidentIdMatches,
  type SupervisorThinkerResponse,
} from '@/lib/cos/supervisor-thinker-prompt'
import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswer'
import type { DiagnosticResult, NormalizedIncidentPayload } from './types.ts'

const METHODS = new Set(['api', 'code_change', 'cli', 'ui_agent', 'human_action', 'no_action'])
const RISKS = new Set(['low', 'medium', 'high', 'critical'])
const ai = createPlatformAiPort()

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

/** COS Primary is the first diagnostic brain. External models are fallback, not the default. */
export function createCosPrimaryDiagnosticThinker(): DiagnosticThinker {
  return {
    id: 'cos-primary',
    async think(incident, systemPrompt, responseSchema) {
      const prompt = [
        systemPrompt,
        '',
        'INCIDENT EVIDENCE:',
        JSON.stringify(incident),
        '',
        'REQUIRED RESPONSE SCHEMA:',
        JSON.stringify(responseSchema),
        '',
        'Return only the diagnostic JSON object. Preserve incident_id exactly.',
      ].join('\n')
      const result = await tryCOSFirstAnswer({ prompt, userId: null, language: 'en', privileged: true })
      if (!result.handled) {
        const detail = 'reason' in result ? result.reason : 'COS Primary did not satisfy the diagnostic contract'
        throw new Error(`COS Primary confidence ${result.confidence.toFixed(2)}: ${detail}`)
      }
      return result.reply
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

export async function diagnoseIncident(incident: NormalizedIncidentPayload, thinker?: DiagnosticThinker | null): Promise<DiagnosticResult> {
  // An explicitly supplied thinker is deterministic test/override behavior. Otherwise COS is first.
  if (thinker !== undefined) {
    if (!thinker) return fallbackDiagnostic(incident, 'No diagnostic thinker is configured')
    try { return await runThinker(incident, thinker) }
    catch (err) { return fallbackDiagnostic(incident, `${thinker.id}: ${err instanceof Error ? err.message : 'Unknown thinker error'}`) }
  }

  const failures: string[] = []
  for (const candidate of [createCosPrimaryDiagnosticThinker(), resolveDiagnosticThinker()].filter(Boolean) as DiagnosticThinker[]) {
    try { return await runThinker(incident, candidate) }
    catch (err) { failures.push(`${candidate.id}: ${err instanceof Error ? err.message : 'Unknown thinker error'}`) }
  }
  return fallbackDiagnostic(incident, failures.length ? failures.join(' | ') : 'No diagnostic thinker is configured')
}

export async function diagnoseIncidentWithGemini(incident: NormalizedIncidentPayload): Promise<DiagnosticResult> {
  return diagnoseIncident(incident, createGeminiThinker())
}
