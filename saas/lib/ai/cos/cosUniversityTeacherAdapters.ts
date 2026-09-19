import type { UniversityTeacherDefinition } from './cosUniversityTeacherPool.ts'

export type TeacherGenerationRequest = Readonly<{
  system: string
  prompt: string
  maxOutputTokens: number
  temperature?: number
  requestKey?: string
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

function clean(value: unknown, max = 200_000): string {
  return String(value ?? '').trim().slice(0, max)
}

function positiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

export function universityTeacherModelFor(teacher: UniversityTeacherDefinition, env: Env = process.env): string {
  if (teacher.id === 'openai') return clean(env.COS_UNIVERSITY_TEACHER_OPENAI_MODEL, 240) || teacher.model
  if (teacher.id === 'claude') return clean(env.COS_UNIVERSITY_TEACHER_ANTHROPIC_MODEL, 240)
  if (teacher.id === 'grok') return clean(env.COS_UNIVERSITY_TEACHER_XAI_MODEL, 240)
  if (teacher.id === 'custom') return clean(env.COS_UNIVERSITY_TEACHER_CUSTOM_MODEL, 240)
  return teacher.model
}

function endpointFor(teacher: UniversityTeacherDefinition, env: Env): string {
  if (teacher.id === 'openai') return clean(env.COS_UNIVERSITY_TEACHER_OPENAI_ENDPOINT, 2000) || 'https://api.openai.com/v1/chat/completions'
  if (teacher.id === 'grok') return clean(env.COS_UNIVERSITY_TEACHER_XAI_ENDPOINT, 2000) || 'https://api.x.ai/v1/chat/completions'
  if (teacher.id === 'claude') return clean(env.COS_UNIVERSITY_TEACHER_ANTHROPIC_ENDPOINT, 2000) || 'https://api.anthropic.com/v1/messages'
  if (teacher.id === 'custom') return clean(env.COS_UNIVERSITY_TEACHER_CUSTOM_ENDPOINT, 2000)
  return ''
}

function credentialFor(teacher: UniversityTeacherDefinition, env: Env): string {
  if (teacher.id === 'openai') return clean(env.OPENAI_API_KEY, 4096)
  if (teacher.id === 'grok') return clean(env.XAI_API_KEY, 4096)
  if (teacher.id === 'claude') return clean(env.ANTHROPIC_API_KEY, 4096)
  if (teacher.id === 'custom') return clean(env.COS_UNIVERSITY_TEACHER_CUSTOM_TOKEN, 4096)
  return ''
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

async function callOpenAiCompatible(input: {
  teacher: UniversityTeacherDefinition
  request: TeacherGenerationRequest
  env: Env
  fetchImpl: FetchPort
}): Promise<TeacherGenerationResult> {
  const model = universityTeacherModelFor(input.teacher, input.env)
  const credential = credentialFor(input.teacher, input.env)
  if (!model || credential.length < 20) throw new Error('university_teacher_not_configured')
  const endpoint = validateHttpsEndpoint(endpointFor(input.teacher, input.env))
  const timeoutMs = positiveInt(input.env.COS_UNIVERSITY_TEACHER_REQUEST_TIMEOUT_MS, 120_000, 5_000, 300_000)
  const response = await input.fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/json',
      ...(clean(input.request.requestKey, 128) ? { 'Idempotency-Key': clean(input.request.requestKey, 128) } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: input.request.temperature ?? 0.2,
      max_tokens: positiveInt(input.request.maxOutputTokens, 1200, 64, 8192),
      messages: [
        { role: 'system', content: clean(input.request.system, 20_000) },
        { role: 'user', content: clean(input.request.prompt, 100_000) },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const payload = await readJson(response)
  if (!response.ok) throw new Error(`university_teacher_http_${response.status}`)
  const text = clean(payload?.choices?.[0]?.message?.content)
  if (!text) throw new Error('university_teacher_empty_response')
  return Object.freeze({
    provider: input.teacher.provider,
    model,
    text,
    inputTokens: Number.isInteger(payload?.usage?.prompt_tokens) ? payload.usage.prompt_tokens : null,
    outputTokens: Number.isInteger(payload?.usage?.completion_tokens) ? payload.usage.completion_tokens : null,
    requestId: clean(response.headers.get('x-request-id'), 240) || null,
  })
}

async function callAnthropic(input: {
  teacher: UniversityTeacherDefinition
  request: TeacherGenerationRequest
  env: Env
  fetchImpl: FetchPort
}): Promise<TeacherGenerationResult> {
  const model = universityTeacherModelFor(input.teacher, input.env)
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
  if (!response.ok) throw new Error(`university_teacher_http_${response.status}`)
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

/**
 * Hosted teacher adapter. Callers must already have selected an explicitly enabled provider and
 * applied their own spend/call authorization. This function never falls back to another teacher.
 */
export async function generateWithUniversityTeacher(input: {
  teacher: UniversityTeacherDefinition
  request: TeacherGenerationRequest
  env?: Env
  fetchImpl?: FetchPort
}): Promise<TeacherGenerationResult> {
  const env = input.env || process.env
  const fetchImpl = input.fetchImpl || fetch
  if (input.teacher.transport === 'openai_compatible') {
    return callOpenAiCompatible({ teacher: input.teacher, request: input.request, env, fetchImpl })
  }
  if (input.teacher.transport === 'anthropic_messages') {
    return callAnthropic({ teacher: input.teacher, request: input.request, env, fetchImpl })
  }
  if (input.teacher.transport === 'custom_adapter') {
    return callOpenAiCompatible({ teacher: input.teacher, request: input.request, env, fetchImpl })
  }
  throw new Error('university_teacher_transport_requires_local_executor')
}
