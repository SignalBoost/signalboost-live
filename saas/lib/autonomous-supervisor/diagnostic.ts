// saas/lib/autonomous-supervisor/diagnostic.ts
import {
  SUPERVISOR_THINKER_RESPONSE_SCHEMA,
  SUPERVISOR_THINKER_SYSTEM_PROMPT,
  assertIncidentIdMatches,
  type SupervisorThinkerResponse,
} from '@/lib/cos/supervisor-thinker-prompt'
import { createPlatformAiPort } from '@/lib/cos/aiPort'
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

export interface DiagnosticThinker {
  id: string
  think(incident: NormalizedIncidentPayload, systemPrompt: string, responseSchema: unknown): Promise<string>
}

const THINKERS = new Map<string, DiagnosticThinker>()

export function registerDiagnosticThinker(thinker: DiagnosticThinker): void {
  if (!thinker?.id || typeof thinker.think !== 'function') throw new Error('A diagnostic thinker needs an id and a think() method')
  THINKERS.set(thinker.id, thinker)
}

export function listDiagnosticThinkers(): string[] {
  return Array.from(THINKERS.keys()).sort()
}

// Intentionally disabled while COS independence is being measured. The Vercel
// GEMINI_API_KEY may remain configured, but this runtime will not consume it.
export function createGeminiThinker(): DiagnosticThinker | null {
  return null
}

export function createModelRouterThinker(): DiagnosticThinker | null {
  const preference = process.env.ANTHROPIC_API_KEY ? 'claude' : process.env.OPENAI_API_KEY ? 'openai' : ''
  if (!preference) return null
  return {
    id: preference,
    async think(incident, systemPrompt, responseSchema) {
      const system = [
        systemPrompt,
        '',
        'Return ONLY raw JSON — no prose, no markdown fences — matching this schema exactly:',
        JSON.stringify(responseSchema),
      ].join('\n')
      return ai.generate({ prompt: JSON.stringify(incident), systemPrompt: system, maxTokens: 2000, modelPreference: preference as 'claude' | 'openai' })
    },
  }
}

export function resolveDiagnosticThinker(): DiagnosticThinker | null {
  const wanted = String(process.env.SUPERVISOR_THINKER_PROVIDER || '').trim().toLowerCase()
  if (wanted && THINKERS.has(wanted)) return THINKERS.get(wanted) as DiagnosticThinker
  if (wanted === 'gemini') return null
  if (wanted === 'claude' || wanted === 'openai') return createModelRouterThinker()
  if (THINKERS.size) return THINKERS.values().next().value as DiagnosticThinker
  return createModelRouterThinker()
}

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

export async function diagnoseIncidentWithGemini(incident: NormalizedIncidentPayload): Promise<DiagnosticResult> {
  return diagnoseIncident(incident, null)
}
