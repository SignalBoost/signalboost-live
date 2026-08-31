import type { UserReferenceImage } from './userReference.ts'

export type VisualOutputVerification = Readonly<{
  ok: boolean
  reasonCodes: readonly string[]
  model?: string
  error?: string
}>

const PRIMARY_VISION_MODEL = 'Qwen/Qwen2.5-VL-32B-Instruct'
const TECHNICAL_FALLBACK_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct'
const VERIFY_ENDPOINT = 'https://api.deepinfra.com/v1/openai/chat/completions'
const VERIFY_TIMEOUT_MS = 25_000
const TECHNICAL_REASON_CODES = new Set([
  'verification_runtime_unavailable',
  'verification_transport_failure',
  'verification_timeout',
  'verification_invalid_response',
  'verification_invalid_schema',
])

type GeneratedImage = Readonly<{
  b64: string
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
}>

function dataUri(value: Pick<GeneratedImage, 'b64' | 'mime'>): string {
  return `data:${value.mime};base64,${value.b64}`
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  const text = String(value || '').trim()
  const candidates = [text]
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1]
  if (fenced) candidates.push(fenced.trim())
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch { /* try the next bounded candidate */ }
  }
  return null
}

function expectedPassExample(): string {
  return JSON.stringify({
    pass: true,
    requested_content_present: true,
    explicit_count_correct: true,
    no_unrequested_principal_people: true,
    reference_preserved: true,
    requested_edit_applied: true,
    reason_codes: [],
  })
}

function verificationPrompt(input: {
  objective: string
  hasReference: boolean
  technicalFallback: boolean
}): string {
  return [
    input.technicalFallback
      ? 'You are a strict backup visual-output verifier. The primary verifier was technically unavailable or malformed. Apply the same standard; do not lower it.'
      : 'You are the final strict visual-output QA gate.',
    input.hasReference
      ? 'Image 1 is the newly generated edit. Image 2 is the exact user-supplied source image.'
      : 'Image 1 is the newly generated visual.',
    'Judge only the supplied image or images and the user request. Do not use outside knowledge.',
    'Confirm that every explicit subject and action requested by the user is visibly present.',
    'If the request gives an explicit numeric count, named list, or one-instance requirement, reject any missing, duplicated, substituted, or extra principal subject.',
    'Reject unrelated dominant foreground people, faces, logos, text, or objects that materially contradict the request.',
    input.hasReference
      ? 'Confirm that the requested edit is visibly applied while every unedited principal subject, identity, count, and composition remains recognizably preserved. Reject substitutions or unrelated additions.'
      : 'For a generic scene, set reference_preserved and requested_edit_applied to true because no source-image edit is required.',
    '',
    'USER REQUEST:',
    input.objective,
    '',
    'Return JSON only, with exactly these keys and no prose:',
    expectedPassExample(),
  ].join('\n')
}

function decisionFromParsed(parsed: Record<string, unknown>, model: string): VisualOutputVerification {
  const required = [
    parsed.requested_content_present,
    parsed.explicit_count_correct,
    parsed.no_unrequested_principal_people,
    parsed.reference_preserved,
    parsed.requested_edit_applied,
  ]
  const structurallyValid = required.every((value) => typeof value === 'boolean')
    && Array.isArray(parsed.reason_codes)
  const declaredPass = parsed.pass === true
  const ok = structurallyValid && declaredPass && required.every((value) => value === true)
  const reasons = Array.isArray(parsed.reason_codes)
    ? parsed.reason_codes.filter((value): value is string => typeof value === 'string').slice(0, 8)
    : []

  return {
    ok,
    model,
    reasonCodes: ok ? [] : reasons.length ? reasons : [
      !structurallyValid ? 'verification_invalid_schema'
        : parsed.requested_content_present !== true ? 'requested_content_missing'
          : parsed.explicit_count_correct !== true ? 'explicit_count_mismatch'
            : parsed.no_unrequested_principal_people !== true ? 'unrequested_principal_subject'
              : parsed.reference_preserved !== true ? 'reference_not_preserved'
                : parsed.requested_edit_applied !== true ? 'requested_edit_not_applied'
                  : 'verification_rejected',
    ],
  }
}

async function invokeVerifier(input: {
  model: string
  technicalFallback: boolean
  objective: string
  generated: GeneratedImage
  reference?: UserReferenceImage
  key: string
}): Promise<VisualOutputVerification> {
  const content: Array<Record<string, unknown>> = [
    { type: 'image_url', image_url: { url: dataUri(input.generated) } },
    ...(input.reference ? [{ type: 'image_url', image_url: { url: dataUri(input.reference) } }] : []),
    {
      type: 'text',
      text: verificationPrompt({
        objective: input.objective,
        hasReference: Boolean(input.reference),
        technicalFallback: input.technicalFallback,
      }),
    },
  ]

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)
  try {
    const response = await fetch(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: 'user', content }],
        temperature: 0,
        max_tokens: 260,
      }),
    })
    const raw = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        model: input.model,
        reasonCodes: ['verification_transport_failure'],
        error: raw.slice(0, 240) || `HTTP ${response.status}`,
      }
    }

    let payload: { choices?: Array<{ message?: { content?: string } }> } = {}
    try { payload = JSON.parse(raw) } catch {
      return {
        ok: false,
        model: input.model,
        reasonCodes: ['verification_invalid_response'],
        error: 'Vision verifier returned invalid JSON.',
      }
    }
    const parsed = parseJsonObject(String(payload.choices?.[0]?.message?.content || ''))
    if (!parsed) {
      return {
        ok: false,
        model: input.model,
        reasonCodes: ['verification_invalid_response'],
        error: 'Vision verifier returned no decision object.',
      }
    }
    return decisionFromParsed(parsed, input.model)
  } catch (error) {
    return {
      ok: false,
      model: input.model,
      reasonCodes: [controller.signal.aborted ? 'verification_timeout' : 'verification_transport_failure'],
      error: controller.signal.aborted
        ? 'Visual output verification timed out.'
        : error instanceof Error ? error.message : 'Visual output verification failed.',
    }
  } finally {
    clearTimeout(timeout)
  }
}

function isTechnicalFailure(result: VisualOutputVerification): boolean {
  return !result.ok && result.reasonCodes.some((code) => TECHNICAL_REASON_CODES.has(code))
}

/**
 * Verifies generic generations and user-reference edits. A smaller model is used only after a
 * technical/schema failure and never to override a valid semantic rejection.
 */
export async function verifyGeneratedVisualOutput(input: {
  objective: string
  generated: GeneratedImage
  reference?: UserReferenceImage
}): Promise<VisualOutputVerification> {
  const key = process.env.LOCAL_AI_API_KEY?.trim()
  const baseUrl = (process.env.LOCAL_AI_BASE_URL || '').replace(/\/$/, '')
  if (!key || !/^https:\/\/api\.deepinfra\.com\/v1\/openai$/i.test(baseUrl)) {
    return {
      ok: false,
      reasonCodes: ['verification_runtime_unavailable'],
      error: 'Approved visual verification runtime is not configured.',
    }
  }

  const primary = await invokeVerifier({
    model: PRIMARY_VISION_MODEL,
    technicalFallback: false,
    objective: input.objective,
    generated: input.generated,
    reference: input.reference,
    key,
  })
  if (primary.ok || !isTechnicalFailure(primary)) return primary

  return invokeVerifier({
    model: TECHNICAL_FALLBACK_MODEL,
    technicalFallback: true,
    objective: input.objective,
    generated: input.generated,
    reference: input.reference,
    key,
  })
}
