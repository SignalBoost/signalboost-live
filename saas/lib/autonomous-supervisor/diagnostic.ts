import {
  SUPERVISOR_THINKER_RESPONSE_SCHEMA,
  SUPERVISOR_THINKER_SYSTEM_PROMPT,
  assertIncidentIdMatches,
  type SupervisorThinkerResponse,
} from '@/lib/cos/supervisor-thinker-prompt'
import type { DiagnosticResult, NormalizedIncidentPayload } from './types'

const METHODS = new Set(['api', 'code_change', 'cli', 'ui_agent', 'human_action', 'no_action'])
const RISKS = new Set(['low', 'medium', 'high', 'critical'])

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('Gemini response did not contain a JSON object')
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

export async function diagnoseIncidentWithGemini(incident: NormalizedIncidentPayload): Promise<DiagnosticResult> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GEMINI_API_KEY || ''
  const model = process.env.COS_SUPERVISOR_GEMINI_MODEL || 'gemini-1.5-flash'
  if (!apiKey) return fallbackDiagnostic(incident, 'Gemini credentials are not configured')
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SUPERVISOR_THINKER_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(incident) }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: SUPERVISOR_THINKER_RESPONSE_SCHEMA },
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body?.error?.message || `Gemini returned ${res.status}`)
    const text = body?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') || ''
    return validateDiagnostic(extractJson(text), incident.incident_id)
  } catch (err) {
    return fallbackDiagnostic(incident, err instanceof Error ? err.message : 'Unknown Gemini error')
  }
}
