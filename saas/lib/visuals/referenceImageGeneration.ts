import type { VerifiedPersonReference } from './personReferences.ts'

export type ReferenceConditionedImageResult = Readonly<{
  ok: boolean
  b64?: string
  mime?: 'image/png' | 'image/jpeg' | 'image/webp'
  error?: string
}>

const REFERENCE_IMAGE_MODEL = 'black-forest-labs/FLUX-2-max'
const NATIVE_ENDPOINT = `https://api.deepinfra.com/v1/inference/${REFERENCE_IMAGE_MODEL}`
const OUTPUT_TIMEOUT_MS = 50_000
const OUTPUT_FETCH_TIMEOUT_MS = 15_000
const MAX_OUTPUT_BYTES = 14_000_000

type ProviderPayload = {
  images?: string[]
  image?: string
  output?: string | string[]
  data?: Array<{ b64_json?: string; url?: string }>
  error?: string | { message?: string }
  detail?: string | { message?: string }
  message?: string
}

function parseSize(value: string): { width: number; height: number } {
  const match = /^(\d{3,4})x(\d{3,4})$/i.exec(String(value || ''))
  let width = Number(match?.[1] || 1024)
  let height = Number(match?.[2] || 1280)

  // The Concierge route historically requested square output. Named-person scenes are materially
  // more reliable in a portrait frame because faces and bodies remain larger and separated.
  if (width === 1024 && height === 1024) height = 1280

  if (width < 256 || width > 1440 || height < 256 || height > 1440) return { width: 1024, height: 1280 }
  width = Math.round(width / 32) * 32
  height = Math.round(height / 32) * 32
  return { width, height }
}

function sniffImageMime(bytes: Uint8Array): ReferenceConditionedImageResult['mime'] | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length >= 12
    && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF'
    && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  ) return 'image/webp'
  return null
}

function decodeBase64Image(value: string, hintedMime?: string): ReferenceConditionedImageResult | null {
  const trimmed = String(value || '').trim()
  if (!trimmed) return null
  const dataMatch = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(trimmed)
  const b64 = (dataMatch?.[2] || trimmed).replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length < 32) return null

  try {
    const bytes = Buffer.from(b64, 'base64')
    const sniffed = sniffImageMime(bytes)
    const hinted = /^image\/(?:png|jpeg|webp)$/i.test(String(hintedMime || ''))
      ? hintedMime as ReferenceConditionedImageResult['mime']
      : undefined
    const mime = sniffed || dataMatch?.[1] as ReferenceConditionedImageResult['mime'] | undefined || hinted
    return mime ? { ok: true, b64, mime } : null
  } catch {
    return null
  }
}

async function readBoundedBytes(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_OUTPUT_BYTES) throw new Error('reference_generation_output_too_large')
  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_OUTPUT_BYTES) {
      await reader.cancel()
      throw new Error('reference_generation_output_too_large')
    }
    chunks.push(value)
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

function isApprovedOutputUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return url.protocol === 'https:' && (host === 'deepinfra.com' || host.endsWith('.deepinfra.com'))
  } catch {
    return false
  }
}

async function imageFromUrl(value: string): Promise<ReferenceConditionedImageResult | null> {
  if (!isApprovedOutputUrl(value)) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OUTPUT_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(value, { signal: controller.signal, redirect: 'error', cache: 'no-store' })
    if (!response.ok) return null
    const bytes = await readBoundedBytes(response)
    const mime = sniffImageMime(bytes)
    return mime ? { ok: true, b64: Buffer.from(bytes).toString('base64'), mime } : null
  } finally {
    clearTimeout(timeout)
  }
}

function payloadValues(payload: ProviderPayload): string[] {
  const values: string[] = []
  if (Array.isArray(payload.images)) values.push(...payload.images)
  if (typeof payload.image === 'string') values.push(payload.image)
  if (Array.isArray(payload.output)) values.push(...payload.output)
  else if (typeof payload.output === 'string') values.push(payload.output)
  for (const item of payload.data || []) {
    if (item.b64_json) values.push(item.b64_json)
    if (item.url) values.push(item.url)
  }
  return values
}

async function parseProviderImage(payload: ProviderPayload): Promise<ReferenceConditionedImageResult | null> {
  for (const value of payloadValues(payload)) {
    const inline = decodeBase64Image(value)
    if (inline) return inline
    const remote = await imageFromUrl(value).catch(() => null)
    if (remote) return remote
  }
  return null
}

function providerError(payload: ProviderPayload, raw: string, status: number): string {
  return typeof payload.error === 'string'
    ? payload.error
    : payload.error?.message
      || (typeof payload.detail === 'string' ? payload.detail : payload.detail?.message)
      || payload.message
      || raw.slice(0, 240)
      || `Approved reference image runtime failed (HTTP ${status}).`
}

function strengthenIdentityPrompt(prompt: string, references: readonly VerifiedPersonReference[]): string {
  const count = references.length
  const mapping = references
    .map((reference, index) => `Reference image ${index + 1} maps only to ${reference.canonicalName}.`)
    .join('\n')

  return [
    prompt,
    '',
    'IDENTITY-PRESERVING DELIVERY REQUIREMENTS:',
    mapping,
    `Show exactly ${count} dominant foreground ${count === 1 ? 'person' : 'people'}, one for each reference, and no other visible human faces.`,
    'Use a realistic, polished editorial-photography treatment with natural anatomy, skin texture, hands, clothing, and lighting.',
    'Keep every principal face large, unobstructed, front-visible or three-quarter-visible, and visually separated from every other face.',
    'Use a clean, softly blurred background with no crowd, bystanders, portraits, posters, screens, statues, mirrors, or reflections containing people.',
    'Keep one-to-one identity mapping in reference order. Never duplicate, merge, average, swap, substitute, omit, or invent a requested person.',
    'Preserve the requested action and composition. Prioritize recognizable identities and exact person count over decorative scenery.',
    'Do not add captions, labels, watermarks, logos, or interface chrome.',
  ].join('\n')
}

async function callNative(
  key: string,
  prompt: string,
  size: string,
  references: readonly VerifiedPersonReference[],
): Promise<ReferenceConditionedImageResult> {
  const { width, height } = parseSize(size)
  const body: Record<string, unknown> = {
    prompt: strengthenIdentityPrompt(prompt, references),
    width,
    height,
    output_format: 'jpeg',
    safety_tolerance: 2,
  }

  references.forEach((reference, index) => {
    const field = index === 0 ? 'input_image' : `input_image_${index + 1}`
    body[field] = reference.b64
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OUTPUT_TIMEOUT_MS)
  try {
    const response = await fetch(NATIVE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const raw = await response.text()
    let payload: ProviderPayload = {}
    try { payload = JSON.parse(raw) } catch { /* handled below */ }
    if (!response.ok) return { ok: false, error: providerError(payload, raw, response.status) }
    return await parseProviderImage(payload) || { ok: false, error: 'Reference image provider returned no image.' }
  } catch (error) {
    return {
      ok: false,
      error: controller.signal.aborted
        ? 'Reference image generation timed out.'
        : error instanceof Error ? error.message : 'Reference image generation failed.',
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Generates a synthetic scene from one to four verified person references with FLUX.2 Max.
 * Every named-person request stays on the native multi-reference endpoint. There is no
 * text-only identity fallback and no single-image edit fallback that can discard identities.
 */
export async function generateReferenceConditionedImage(input: {
  prompt: string
  size?: string
  references: readonly VerifiedPersonReference[]
}): Promise<ReferenceConditionedImageResult> {
  const references = input.references.slice(0, 4)
  if (!references.length) return { ok: false, error: 'No verified person references were supplied.' }

  const key = process.env.LOCAL_AI_API_KEY?.trim()
  const baseUrl = (process.env.LOCAL_AI_BASE_URL || '').replace(/\/$/, '')
  if (!key || !/^https:\/\/api\.deepinfra\.com\/v1\/openai$/i.test(baseUrl)) {
    return { ok: false, error: 'Approved reference image runtime is not configured.' }
  }

  const generated = await callNative(key, input.prompt, input.size || '1024x1280', references)
  if (!generated.ok) {
    console.warn('[concierge-reference-image-native-failure]', JSON.stringify({
      model: REFERENCE_IMAGE_MODEL,
      referenceCount: references.length,
      error: generated.error || 'unknown',
    }))
  }
  return generated
}
