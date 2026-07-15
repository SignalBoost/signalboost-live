import type { DiagnosticResult, NormalizedIncidentPayload } from './types'

export const COS_DIAGNOSTIC_SYSTEM_PROMPT = `You are the Autonomous Chief of Staff (COS) Diagnostic Supervisor for SignalBoost. Base your diagnosis only on the supplied incident payload. If the evidence is insufficient, say so and lower the confidence score. Prefer official APIs over browser-based actions, but set requires_ui_agent to true if the action must be executed via dashboard navigation. Production-changing actions must require explicit user approval.

Return only valid JSON matching this exact structure:
{
"incident_summary": "Brief summary.",
"diagnosis": "Plain-English explanation of root cause.",
"confidence_score": 0,
"confidence_reason": "Brief explanation.",
"evidence": [{"source": "log field", "finding": "relevant text"}],
"missing_information": [],
"recommended_execution_method": "api | code_change | cli | ui_agent | human_action | no_action",
"requires_ui_agent": false,
"requires_human_approval": true,
"risk_level": "low | medium | high | critical",
"risk_reasons": [],
"repair_plan": [
{
"step": 1,
"action": "One exact and bounded action.",
"executor": "api_executor | code_agent | cli_executor | ui_agent | human",
"target": "Specific resource/URL.",
"expected_result": "Expected outcome.",
"requires_approval": true
}
],
"verification_plan": [{"step": 1, "check": "check description", "success_condition": "condition"}],
"rollback_plan": [{"step": 1, "action": "rollback step"}],
"escalation_reason": null
}`

function extractJson(text: string): any {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('Gemini response did not contain a JSON object')
  return JSON.parse(cleaned.slice(start, end + 1))
}

function fallbackDiagnostic(incident: NormalizedIncidentPayload, reason: string): DiagnosticResult {
  return {
    incident_summary: `${incident.project} deployment failed on Vercel.`,
    diagnosis: `The supplied payload indicates a Vercel build failure. Automated LLM diagnosis was unavailable: ${reason}`,
    confidence_score: 35,
    confidence_reason: 'Diagnosis is based on the normalized incident payload without model analysis.',
    evidence: [
      { source: 'error_summary', finding: incident.error_summary },
      { source: 'raw_logs', finding: incident.raw_logs.slice(0, 500) },
    ],
    missing_information: ['LLM diagnostic response'],
    recommended_execution_method: 'human_action',
    requires_ui_agent: false,
    requires_human_approval: true,
    risk_level: 'critical',
    risk_reasons: ['Production deployment failure', 'Any environment-variable repair changes infrastructure state'],
    repair_plan: [{ step: 1, action: 'Review the failed Vercel deployment and stage a gated repair.', executor: 'human', target: 'Vercel deployment / environment settings', expected_result: 'Owner-approved repair path is identified before any production change.', requires_approval: true }],
    verification_plan: [{ step: 1, check: 'Confirm a replacement deployment reaches READY.', success_condition: 'Latest production deployment is READY in Vercel.' }],
    rollback_plan: [{ step: 1, action: 'Revert any staged environment-variable change through the Infrastructure PR cockpit.' }],
    escalation_reason: reason,
  }
}

export async function diagnoseIncidentWithGemini(incident: NormalizedIncidentPayload): Promise<DiagnosticResult> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GEMINI_API_KEY || ''
  const model = process.env.COS_SUPERVISOR_GEMINI_MODEL || 'gemini-1.5-flash'
  if (!apiKey) return fallbackDiagnostic(incident, 'GOOGLE_AI_STUDIO_API_KEY/GEMINI_API_KEY is not configured')

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: COS_DIAGNOSTIC_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(incident, null, 2) }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body?.error?.message || `Gemini returned ${res.status}`)
    const text = body?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') || ''
    return extractJson(text) as DiagnosticResult
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown Gemini error'
    return fallbackDiagnostic(incident, msg)
  }
}
