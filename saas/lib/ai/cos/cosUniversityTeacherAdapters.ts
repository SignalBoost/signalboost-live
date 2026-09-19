import type { UniversityTeacherDefinition } from './cosUniversityTeacherPool.ts'

export type TeacherGenerationRequest = Readonly<{
  system: string
  prompt: string
  maxOutputTokens: number
  temperature?: number
}>

export type TeacherGenerationResult = Readonly<{
  provider: string
  model: string
  text: string
  inputTokens: number | null
  outputTokens: number | null
  requestId: string | null
}>

type Env = Record<string, string | undefined>
type FetchPort = typeof fetch

export type UniversityTeacherAdapterInput = Readonly<{
  teacher: UniversityTeacherDefinition
  request: TeacherGenerationRequest
  env: Env
  fetchImpl: FetchPort
}>
export type UniversityTeacherAdapter = (input: UniversityTeacherAdapterInput) => Promise<TeacherGenerationResult>
export type UniversityTeacherAdapterRegistry = Readonly<Record<string, UniversityTeacherAdapter>>

function clean(value: unknown, max = 200_000): string {
  return String(value ?? '').trim().slice(0, max)
}

function positiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function modelFor(teacher: UniversityTeacherDefinition, env: Env): string {
  const configured = teacher.modelEnv
    ? clean(env[teacher.modelEnv], 240) || (teacher.model === 'buyer-configured' ? '' : teacher.model)
    : teacher.model === 'buyer-configured' ? '' : clean(teacher.model, 240)

  // Production briefly advertised the non-API label "deepseek-flash". Preserve configuration
  // compatibility while sending DeepSeek's canonical chat model identifier to the API.
  if (teacher.id === 'deepseek-api' && configured.toLowerCase() === 'deepseek-flash') return 'deepseek-chat'
  return configured
}

function endpointFor(teacher: UniversityTeacherDefinition, env: Env): string {
  const configured = teacher.endpointEnv ? clean(env[teacher.endpointEnv], 2000) : ''
  return configured || clean(teacher.defaultEndpoint, 2000)
}

function credentialFor(teacher: UniversityTeacherDefinition, env: Env): string {
  return teacher.credentialEnv ? clean(env[teacher.credentialEnv], 4096) : ''
}

function validateHttpsEndpoint(raw: string): URL {
  if (!raw) throw new Error('university_teacher_endpoint_missing')
  const url = new URL(raw)
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) {
    throw new Error('university_teacher_endpoint_invalid')
  }
  return url
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text()
  try { return text ? JSON.parse(text) : {} } catch { throw new Error('university_teacher_response_invalid_json') }
}

function providerErrorDetail(payload: any): string {
  const type = clean(payload?.error?.code || payload?.error?.type || 'unknown', 80)
    .replace(/[^A-Za-z0-9._-]/g, '_')
  const message = clean(payload?.error?.message, 180)
    .replace(/[^A-Za-z0-9 _.,:;()\/'-]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return message ? `${type}:${message}` : type
}

async function callOpenAiResponses(input: UniversityTeacherAdapterInput): Promise<TeacherGenerationResult> {
  const model = modelFor(input.teacher, input.env)
  const credential = credentialFor(input.teacher, input.env)
  if (!model || credential.length < 20) throw new Error('university_teacher_not_configured')
  const endpoint = validateHttpsEndpoint(endpointFor(input.teacher, input.env))
  const timeoutMs = positiveInt(input.env.COS_UNIVERSITY_TEACHER_REQUEST_TIMEOUT_MS, 120_000, 5_000, 300_000)
  const maxOutputTokens = positiveInt(input.request.maxOutputTokens, 1200, 64, 8192)
  const response = await input.fetchImpl(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      reasoning: { effort: 'none' },
      max_output_tokens: maxOutputTokens,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: clean(input.request.system, 20_000) }] },
        { role: 'user', content: [{ type: 'input_text', text: clean(input.request.prompt, 100_000) }] },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const payload = await readJson(response)
  if (!response.ok) throw new Error(`university_teacher_http_${response.status}:${providerErrorDetail(payload)}`)
  const outputText = clean(payload?.output_text)
    || clean(Array.isArray(payload?.output)
      ? payload.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
        .filter((item: any) => item?.type === 'output_text')
        .map((item: any) => item?.text)
        .join('\n')
      : '')
  if (!outputText) throw new Error('university_teacher_empty_response')
  return Object.freeze({
    provider: input.teacher.provider,
    model,
    text: outputText,
    inputTokens: Number.isInteger(payload?.usage?.input_tokens) ? payload.usage.input_tokens : null,
    outputTokens: Number.isInteger(payload?.usage?.output_tokens) ? payload.usage.output_tokens : null,
    requestId: clean(response.headers.get('x-request-id'), 240) || clean(payload?.id, 240) || null,
  })
}

async function callOpenAiCompatible(input: UniversityTeacherAdapterInput): Promise<TeacherGenerationResult> {
  const model = modelFor(input.teacher, input.env)
  const credential = credentialFor(input.teacher, input.env)
  if (!model || credential.length < 20) throw new Error('university_teacher_not_configured')
  const endpoint = validateHttpsEndpoint(endpointFor(input.teacher, input.env))
  const timeoutMs = positiveInt(input.env.COS_UNIVERSITY_TEACHER_REQUEST_TIMEOUT_MS, 120_000, 5_000, 300_000)
  const maxOutputTokens = positiveInt(input.request.maxOutputTokens, 1200, 64, 8192)
  const response = await input.fetchImpl(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      reasoning_effort: input.teacher.provider === 'xai' ? 'low' : undefined,
      temperature: input.request.temperature ?? 0.2,
      max_tokens: maxOutputTokens,
      messages: [
        { role: 'system', content: clean(input.request.system, 20_000) },
        { role: 'user', content: clean(input.request.prompt, 100_000) },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const payload = await readJson(response)
  if (!response.ok) {
    const code = clean(payload?.error?.code || payload?.error?.type || 'unknown', 80).replace(/[^A-Za-z0-9._-]/g, '_')
    throw new Error(`university_teacher_http_${response.status}:${code}`)
  }
  const text = clean(payload?.choices?.[0]?.message?.content)
  if (!text) throw new Error('university_teacher_empty_response')
  return Object.freeze({
    provider: input.teacher.provider,
    model,
    text,
    inputTokens: Number.isInteger(payload?.usage?.prompt_tokens) ? payload.usage.prompt_tokens : null,
    outputTokens: Number.isInteger(payload?.usage?.completion_tokens) ? payload.usage.completion_tokens : null,
    requestId: clean(response.headers.get('x-request-id'), 240) || clean(payload?.id, 240) || null,
  })
}

async function callGeminiGenerateContent(input: UniversityTeacherAdapterInput): Promise<TeacherGenerationResult> {
  const model = modelFor(input.teacher, input.env)
  const credential = credentialFor(input.teacher, input.env)
  if (!model || credential.length < 20) throw new Error('university_teacher_not_configured')
  const baseEndpoint = validateHttpsEndpoint(endpointFor(input.teacher, input.env))
  const basePath = baseEndpoint.pathname.replace(/\/$/, '')
  baseEndpoint.pathname = `${basePath}/${encodeURIComponent(model)}:generateContent`
  const timeoutMs = positiveInt(input.env.COS_UNIVERSITY_TEACHER_REQUEST_TIMEOUT_MS, 120_000, 5_000, 300_000)
  const maxOutputTokens = positiveInt(input.request.maxOutputTokens, 1200, 64, 8192)
  const response = await input.fetchImpl(baseEndpoint, {
    method: 'POST',
    headers: { 'x-goog-api-key': credential, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: clean(input.request.system, 20_000) }] },
      contents: [{ role: 'user', parts: [{ text: clean(input.request.prompt, 100_000) }] }],
      generationConfig: {
        maxOutputTokens,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const payload = await readJson(response)
  if (!response.ok) throw new Error(`university_teacher_http_${response.status}:${providerErrorDetail(payload)}`)
  const text = clean(Array.isArray(payload?.candidates?.[0]?.content?.parts)
    ? payload.candidates[0].content.parts
      .filter((item: any) => item?.text && item?.thought !== true)
      .map((item: any) => item.text)
      .join('\n')
    : '')
  if (!text) throw new Error('university_teacher_empty_response')
  return Object.freeze({
    provider: input.teacher.provider,
    model,
    text,
    inputTokens: Number.isInteger(payload?.usageMetadata?.promptTokenCount) ? payload.usageMetadata.promptTokenCount : null,
    outputTokens: Number.isInteger(payload?.usageMetadata?.candidatesTokenCount) ? payload.usageMetadata.candidatesTokenCount : null,
    requestId: clean(response.headers.get('x-goog-request-id'), 240) || clean(response.headers.get('x-request-id'), 240) || null,
  })
}

async function callAnthropic(input: UniversityTeacherAdapterInput): Promise<TeacherGenerationResult> {
  const model = modelFor(input.teacher, input.env)
  const credential = credentialFor(input.teacher, input.env)
  if (!model || credential.length < 20) throw new Error('university_teacher_not_configured')
  const endpoint = validateHttpsEndpoint(endpointFor(input.teacher, input.env))
  const timeoutMs = positiveInt(input.env.COS_UNIVERSITY_TEACHER_REQUEST_TIMEOUT_MS, 120_000, 5_000, 300_000)
  const response = await input.fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': credential,
      'anthropic-version': clean(input.env.COS_UNIVERSITY_TEACHER_ANTHROPIC_VERSION, 40) || '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      system: clean(input.request.system, 20_000),
      max_tokens: positiveInt(input.request.maxOutputTokens, 1200, 64, 8192),
      temperature: input.request.temperature ?? 0.2,
      messages: [{ role: 'user', content: clean(input.request.prompt, 100_000) }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const payload = await readJson(response)
  if (!response.ok) throw new Error(`university_teacher_http_${response.status}:${providerErrorDetail(payload)}`)
  const text = clean(Array.isArray(payload?.content)
    ? payload.content.filter((item: any) => item?.type === 'text').map((item: any) => item.text).join('\n')
    : '')
  if (!text) throw new Error('university_teacher_empty_response')
  return Object.freeze({
    provider: input.teacher.provider,
    model,
    text,
    inputTokens: Number.isInteger(payload?.usage?.input_tokens) ? payload.usage.input_tokens : null,
    outputTokens: Number.isInteger(payload?.usage?.output_tokens) ? payload.usage.output_tokens : null,
    requestId: clean(response.headers.get('request-id'), 240) || null,
  })
}

export const BUILTIN_UNIVERSITY_TEACHER_ADAPTERS: UniversityTeacherAdapterRegistry = Object.freeze({
  openai_responses: callOpenAiResponses,
  openai_compatible: callOpenAiCompatible,
  anthropic_messages: callAnthropic,
  gemini_generate_content: callGeminiGenerateContent,
  custom_adapter: callOpenAiCompatible,
})

/**
 * Hosted teacher adapter. Provider identity is data, while transport selects the protocol adapter.
 * Buyers can add providers that speak a supported protocol through configuration only. A portable
 * host may also inject/override a transport adapter without changing the University curriculum core.
 */
export async function generateWithUniversityTeacher(input: {
  teacher: UniversityTeacherDefinition
  request: TeacherGenerationRequest
  env?: Env
  fetchImpl?: FetchPort
  adapterRegistry?: UniversityTeacherAdapterRegistry
}): Promise<TeacherGenerationResult> {
  const env = input.env || process.env
  const fetchImpl = input.fetchImpl || fetch
  if (input.teacher.transport === 'huggingface_job') throw new Error('university_teacher_transport_requires_local_executor')
  const adapter = input.adapterRegistry?.[input.teacher.transport] || BUILTIN_UNIVERSITY_TEACHER_ADAPTERS[input.teacher.transport]
  if (!adapter) throw new Error('university_teacher_transport_adapter_unavailable')
  return adapter({ teacher: input.teacher, request: input.request, env, fetchImpl })
}
