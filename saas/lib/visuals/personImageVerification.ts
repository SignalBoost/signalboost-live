import type { VerifiedPersonReference } from './personReferences.ts'

export type PersonImageVerification = Readonly<{
  ok: boolean
  reasonCodes: readonly string[]
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

function dataUri(value: Pick<VerifiedPersonReference, 'b64' | 'mime'> | { b64: string; mime: string }): string {
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

function expectedPassExample(referenceCount: number): string {
  return JSON.stringify({
    pass: true,
    principal_people: referenceCount,
    reference_matches: Array.from({ length: referenceCount }, () => true),
    duplicate_or_substitution: false,
    reason_codes: [],
  })
}

function verificationPrompt(references: readonly VerifiedPersonReference[], technicalFallback: boolean): string {
  const mapping = references
    .map((reference, index) => `Reference image ${index + 2} = ${reference.canonicalName}`)
    .join('\n')
  const count = references.length

  return [
    technicalFallback
      ? 'You are a strict backup visual identity verifier. The primary verifier was technically unavailable or returned malformed output. Apply the same strict standard; do not lower it.'
      : 'You are the final strict visual identity and composition QA gate.',
    'Image 1 is a newly generated synthetic scene. The remaining images are verified identity references.',
    mapping,
    '',
    `The generated scene must contain exactly ${count} distinct principal ${count === 1 ? 'person' : 'people'}, once each, corresponding in reference order.`,
    'Principal people means the dominant foreground subjects. Do not count tiny, blurred, incidental, printed, reflected, or background figures as requested people.',
    'Compare visible facial structure, hair, age presentation, and other stable identity features against each supplied reference.',
    'Reject if any requested person is missing, substituted, duplicated, cloned, merged, visually ambiguous, or mapped to the wrong reference.',
    'Reject if the number of dominant foreground people differs from the requested reference count.',
    'Ignore clothing, pose, lighting, background, and normal artistic variation unless they obscure identity.',
    'Do not use outside knowledge. Judge only the generated scene against the supplied reference images.',
    '',
    'Return JSON only, with exactly these keys and no prose:',
    expectedPassExample(count),
    `principal_people must be the actual dominant foreground count. reference_matches must contain exactly ${count} booleans in reference order.`,
  ].join('\n')
}

function decisionFromParsed(parsed: Record<string, unknown>, references: readonly VerifiedPersonReference[]): PersonImageVerification {
  const principalPeople = Number(parsed.principal_people)
  const matches = Array.isArray(parsed.reference_matches) ? parsed.reference_matches : []
  const duplicate = parsed.duplicate_or_substitution === true
  const declaredPass = parsed.pass === true
  const reasons = Array.isArray(parsed.reason_codes)
    ? parsed.reason_codes.filter((value): value is string => typeof value === 'string').slice(0, 8)
    : []

  const structurallyValid = Number.isInteger(principalPeople)
    && matches.length === references.length
    && matches.every((value) => typeof value === 'boolean')
  const ok = structurallyValid
    && declaredPass
    && principalPeople === references.length
    && matches.every(Boolean)
    && !duplicate

  return {
    ok,
    reasonCodes: ok ? [] : reasons.length ? reasons : [
      !structurallyValid ? 'verification_invalid_schema'
        : principalPeople !== references.length ? 'wrong_principal_person_count'
          : duplicate ? 'duplicate_or_substitution'
            : matches.some((value) => value !== true) ? 'identity_reference_mismatch'
              : 'verification_rejected',
    ],
  }
}

async function invokeVerifier(input: {
  model: string
  technicalFallback: boolean
  generated: { b64: string; mime: 'image/png' | 'image/jpeg' | 'image/webp' }
  references: readonly VerifiedPersonReference[]
  key: string
}): Promise<PersonImageVerification> {
  const content: Array<Record<string, unknown>> = [
    { type: 'image_url', image_url: { url: dataUri(input.generated) } },
    ...input.references.map((reference) => ({ type: 'image_url', image_url: { url: dataUri(reference) } })),
    { type: 'text', text: verificationPrompt(input.references, input.technicalFallback) },
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
        reasonCodes: ['verification_transport_failure'],
        error: raw.slice(0, 240) || `HTTP ${response.status}`,
      }
    }

    let payload: { choices?: Array<{ message?: { content?: string } }> } = {}
    try { payload = JSON.parse(raw) } catch {
      return { ok: false, reasonCodes: ['verification_invalid_response'], error: 'Vision verifier returned invalid JSON.' }
    }
    const parsed = parseJsonObject(String(payload.choices?.[0]?.message?.content || ''))
    if (!parsed) {
      return { ok: false, reasonCodes: ['verification_invalid_response'], error: 'Vision verifier returned no decision object.' }
    }
    return decisionFromParsed(parsed, input.references)
  } catch (error) {
    return {
      ok: false,
      reasonCodes: [controller.signal.aborted ? 'verification_timeout' : 'verification_transport_failure'],
      error: controller.signal.aborted
        ? 'Visual identity verification timed out.'
        : error instanceof Error ? error.message : 'Visual identity verification failed.',
    }
  } finally {
    clearTimeout(timeout)
  }
}

function isTechnicalFailure(result: PersonImageVerification): boolean {
  return !result.ok && result.reasonCodes.some((code) => TECHNICAL_REASON_CODES.has(code))
}

/**
 * Compares the generated image with the exact authoritative references. The 32B vision model makes
 * the normal decision. The 7B model is used only after a transport/schema failure, never to override
 * a valid identity rejection. One-person and multi-person requests use dynamically sized schemas.
 */
export async function verifyReferenceConditionedPeopleImage(input: {
  generated: { b64: string; mime: 'image/png' | 'image/jpeg' | 'image/webp' }
  references: readonly VerifiedPersonReference[]
}): Promise<PersonImageVerification> {
  const references = input.references.slice(0, 4)
  if (!references.length) return { ok: false, reasonCodes: ['missing_references'], error: 'No references supplied.' }

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
    generated: input.generated,
    references,
    key,
  })
  if (primary.ok || !isTechnicalFailure(primary)) return primary

  return invokeVerifier({
    model: TECHNICAL_FALLBACK_MODEL,
    technicalFallback: true,
    generated: input.generated,
    references,
    key,
  })
}
