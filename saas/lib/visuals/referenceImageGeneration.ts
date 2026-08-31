import type { VerifiedPersonReference } from './personReferences.ts'

export type ReferenceConditionedImageResult = Readonly<{
  ok: boolean
  b64?: string
  mime?: 'image/png' | 'image/jpeg' | 'image/webp'
  error?: string
}>

const REFERENCE_IMAGE_MODEL = 'black-forest-labs/FLUX-2-klein-4b'
const NATIVE_ENDPOINT = `https://api.deepinfra.com/v1/inference/${REFERENCE_IMAGE_MODEL}`
const EDIT_ENDPOINT = 'https://api.deepinfra.com/v1/images/edits'
const OUTPUT_TIMEOUT_MS = 45_000
const OUTPUT_FETCH_TIMEOUT_MS = 15_000
const MAX_OUTPUT_BYTES = 12_000_000

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
  const width = Number(match?.[1] || 1024)
  const height = Number(match?.[2] || 1024)
  if (width < 128 || width > 1920 || height < 128 || height > 1920) return { width: 1024, height: 1024 }
  return { width, height }
}

function sniffImageMime(bytes: Uint8Array): ReferenceConditionedImageResult['mime'] | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP') return 'image/webp'
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
    const mime = sniffed || (dataMatch?.[1] as ReferenceConditionedImageResult['mime'] | undefined)
      || (/^image\/(?:png|jpeg|webp)$/i.test(String(hintedMime || '')) ? hintedMime as ReferenceConditionedImageResult['mime'] : undefined)
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

function strengthenMultiPersonPrompt(prompt: string, references: readonly VerifiedPersonReference[]): string {
  if (references.length < 2) return prompt
  return [
    prompt,
    '',
    'MULTI-PERSON IDENTITY DELIVERY REQUIREMENTS:',
    `Show exactly ${references.length} dominant foreground people and no other visible human faces.`,
    'Use a clean, uncluttered background with no crowd, bystanders, portraits, posters, screens, statues, mirrors, or reflections containing people.',
    'Use a medium three-quarter composition so every principal face is large, unobstructed, and visually separated from the others.',
    'Keep one-to-one identity mapping in reference order. Each reference may control only one principal person.',
    'Prioritize recognizable identity and distinct faces over scenery, dramatic lighting, or stylistic effects.',
  ].join('\n')
}

async function callNative(key: string, prompt: string, size: string, references: readonly VerifiedPersonReference[]): Promise<ReferenceConditionedImageResult> {
  const { width, height } = parseSize(size)
  const body: Record<string, unknown> = {
    prompt,
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
    return { ok: false, error: controller.signal.aborted ? 'Reference image generation timed out.' : error instanceof Error ? error.message : 'Reference image generation failed.' }
  } finally {
    clearTimeout(timeout)
  }
}

async function callOpenAiEdits(key: string, prompt: string, size: string, references: readonly VerifiedPersonReference[]): Promise<ReferenceConditionedImageResult> {
  const form = new FormData()
  form.append('model', REFERENCE_IMAGE_MODEL)
  form.append('prompt', prompt)
  form.append('size', size)
  form.append('n', '1')
  form.append('response_format', 'b64_json')
  references.forEach((reference, index) => {
    const bytes = Buffer.from(reference.b64, 'base64')
    const extension = reference.mime === 'image/png' ? 'png' : reference.mime === 'image/webp' ? 'webp' : 'jpg'
    form.append('image', new Blob([new Uint8Array(bytes)], { type: reference.mime }), `reference-${index + 1}.${extension}`)
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OUTPUT_TIMEOUT_MS)
  try {
    const response = await fetch(EDIT_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: controller.signal,
    })
    const raw = await response.text()
    let payload: ProviderPayload = {}
    try { payload = JSON.parse(raw) } catch { /* handled below */ }
    if (!response.ok) return { ok: false, error: providerError(payload, raw, response.status) }
    return await parseProviderImage(payload) || { ok: false, error: 'Reference image provider returned no image.' }
  } catch (error) {
    return { ok: false, error: controller.signal.aborted ? 'Reference image generation timed out.' : error instanceof Error ? error.message : 'Reference image generation failed.' }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Generates a synthetic scene from verified person references. Multi-person requests stay on the
 * native multi-reference endpoint; the OpenAI-compatible edit endpoint documents only a single
 * image input and therefore cannot safely preserve more than one named identity. there is no text-only identity fallback.
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

  const size = input.size || '1024x1024'
  const prompt = strengthenMultiPersonPrompt(input.prompt, references)
  const native = await callNative(key, prompt, size, references)
  if (native.ok) return native

  console.warn('[concierge-reference-image-native-failure]', JSON.stringify({
    model: REFERENCE_IMAGE_MODEL,
    referenceCount: references.length,
    error: native.error || 'unknown',
  }))

  if (references.length > 1) return native

  const edits = await callOpenAiEdits(key, prompt, size, references)
  if (!edits.ok) {
    console.warn('[concierge-reference-image-edit-failure]', JSON.stringify({
      model: REFERENCE_IMAGE_MODEL,
      referenceCount: references.length,
      error: edits.error || 'unknown',
    }))
  }
  return edits
}
