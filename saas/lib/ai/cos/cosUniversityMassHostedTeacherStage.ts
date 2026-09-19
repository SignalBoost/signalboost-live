import { createHash } from 'node:crypto'
import {
  universityTeacherPoolStatus,
  type UniversityTeacherDefinition,
  type UniversityTeacherTransport,
} from './cosUniversityTeacherPool.ts'
import { generateWithUniversityTeacher } from './cosUniversityTeacherAdapters.ts'

const HOSTED_TRANSPORTS: readonly UniversityTeacherTransport[] = Object.freeze([
  'openai_compatible',
  'anthropic_messages',
  'custom_adapter',
])
const MIN_TEACHER_ROWS = 20
const DEFAULT_MAX_CALLS = 24
const HARD_MAX_CALLS = 64
const DEFAULT_MAX_OUTPUT_TOKENS = 512
const HARD_MAX_OUTPUT_TOKENS = 1024
const DEFAULT_PARALLELISM = 8
const HARD_MAX_PARALLELISM = 16

type Env = Record<string, string | undefined>
type Prompt = Readonly<{ id: string; prompt: string }>

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function hash(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
}

function truthy(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

function hostedActiveTeachers(env: Env): UniversityTeacherDefinition[] {
  return universityTeacherPoolStatus(env).activeProviders
    .filter(item => HOSTED_TRANSPORTS.includes(item.transport))
    .map(item => ({
      id: item.id,
      provider: item.provider,
      transport: item.transport,
      model: item.model,
      credentialEnv: item.credentialEnv,
      enabledEnv: item.enabledEnv,
      buyerOwnedCredential: true,
      provenanceRequired: true,
      costCeilingRequired: true,
      silentFallbackAllowed: false,
    }))
}

export function massHostedTeacherStageConfig(env: Env = process.env) {
  return Object.freeze({
    enabled: truthy(env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_ENABLED),
    maxCalls: boundedInt(env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_MAX_CALLS, DEFAULT_MAX_CALLS, MIN_TEACHER_ROWS, HARD_MAX_CALLS),
    maxOutputTokens: boundedInt(env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS, 128, HARD_MAX_OUTPUT_TOKENS),
    parallelism: boundedInt(env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_PARALLELISM, DEFAULT_PARALLELISM, 1, HARD_MAX_PARALLELISM),
    minimumRows: MIN_TEACHER_ROWS,
  })
}

export async function runMassHostedTeacherStage(input: {
  db: any
  run: any
  prompts: readonly Prompt[]
  promptSetHash: string
  env?: Env
  fetchImpl?: typeof fetch
}) {
  const env = input.env || process.env
  const config = massHostedTeacherStageConfig(env)
  const teachers = hostedActiveTeachers(env)

  if (!config.enabled) {
    return Object.freeze({ ok: true, skipped: true, reason: 'mass_hosted_teacher_disabled', completed: false, rows: 0, activeProviders: [] })
  }
  if (!teachers.length) {
    return Object.freeze({ ok: true, skipped: true, reason: 'no_active_hosted_teacher_provider', completed: false, rows: 0, activeProviders: [] })
  }

  const existing = await input.db.from('cos_university_mass_hosted_teacher_rows')
    .select('prompt_id,teacher_id,provider,model,response_text,response_hash,input_tokens,output_tokens,request_id')
    .eq('run_id', input.run.id)
    .eq('prompt_set_hash', input.promptSetHash)
    .order('created_at', { ascending: true })
  if (existing.error) throw existing.error

  const byPrompt = new Map<string, any>()
  for (const row of existing.data || []) {
    const promptId = clean(row.prompt_id, 64).toLowerCase()
    if (promptId) byPrompt.set(promptId, row)
  }

  const missing = input.prompts.filter(prompt => !byPrompt.has(clean(prompt.id, 64).toLowerCase()))
  const callTargets = missing.slice(0, Math.max(0, config.maxCalls - byPrompt.size))
  const failures: Array<{ promptId: string; teacherId: string; error: string }> = []

  for (let offset = 0; offset < callTargets.length; offset += config.parallelism) {
    const chunk = callTargets.slice(offset, offset + config.parallelism)
    const settled = await Promise.allSettled(chunk.map(async (prompt, localIndex) => {
      const globalIndex = offset + localIndex + byPrompt.size
      const teacher = teachers[globalIndex % teachers.length]
      const result = await generateWithUniversityTeacher({
        teacher,
        env,
        fetchImpl: input.fetchImpl,
        request: {
          system: [
            'You are one governed teacher in the COS University mass-distillation faculty.',
            'Use the supplied rights-cleared learning case only.',
            'Return a rigorous final teaching response without hidden chain-of-thought, citations, private data, or claims of external access.',
          ].join(' '),
          prompt: prompt.prompt,
          maxOutputTokens: config.maxOutputTokens,
          temperature: 0.2,
        },
      })
      const responseText = clean(result.text, 50_000)
      if (!responseText) throw new Error('mass_hosted_teacher_empty_response')
      const responseHash = hash(responseText)
      const row = {
        run_id: input.run.id,
        candidate_id: input.run.candidate_id,
        batch_key: input.run.batch_key,
        prompt_id: clean(prompt.id, 64).toLowerCase(),
        prompt_set_hash: input.promptSetHash,
        teacher_id: teacher.id,
        provider: result.provider,
        model: result.model,
        request_id: result.requestId,
        response_text: responseText,
        response_hash: responseHash,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        authority_expanded: false,
        silent_fallback_allowed: false,
      }
      const stored = await input.db.from('cos_university_mass_hosted_teacher_rows')
        .upsert(row, { onConflict: 'run_id,prompt_id' })
        .select('prompt_id,teacher_id,provider,model,response_text,response_hash,input_tokens,output_tokens,request_id')
        .single()
      if (stored.error) throw stored.error
      return stored.data
    }))

    settled.forEach((entry, index) => {
      const prompt = chunk[index]
      const teacher = teachers[(offset + index + byPrompt.size) % teachers.length]
      if (entry.status === 'fulfilled') {
        byPrompt.set(clean(prompt.id, 64).toLowerCase(), entry.value)
      } else {
        failures.push({
          promptId: clean(prompt.id, 64).toLowerCase(),
          teacherId: teacher.id,
          error: clean(entry.reason instanceof Error ? entry.reason.message : entry.reason, 300) || 'unknown_error',
        })
      }
    })
  }

  const rows = input.prompts
    .map(prompt => byPrompt.get(clean(prompt.id, 64).toLowerCase()))
    .filter(Boolean)

  const providerMix: Record<string, number> = {}
  for (const row of rows) providerMix[row.teacher_id] = (providerMix[row.teacher_id] || 0) + 1

  return Object.freeze({
    ok: rows.length >= MIN_TEACHER_ROWS,
    skipped: false,
    completed: rows.length >= MIN_TEACHER_ROWS,
    rows: rows.length,
    minimumRows: MIN_TEACHER_ROWS,
    activeProviders: teachers.map(item => item.id),
    providerMix: Object.freeze(providerMix),
    failures: Object.freeze(failures),
    outputHashes: Object.freeze(rows.map(row => clean(row.response_hash, 64).toLowerCase())),
    datasetHash: rows.length >= MIN_TEACHER_ROWS ? hash(rows.map(row => clean(row.response_hash, 64).toLowerCase())) : null,
    config,
    authorityExpanded: false,
    silentFallbackAllowed: false,
  })
}

export async function readMassHostedTeacherRows(input: {
  db: any
  runId: string
  promptSetHash: string
}) {
  const rows = await input.db.from('cos_university_mass_hosted_teacher_rows')
    .select('prompt_id,teacher_id,provider,model,response_text,response_hash,input_tokens,output_tokens,request_id')
    .eq('run_id', input.runId)
    .eq('prompt_set_hash', input.promptSetHash)
    .order('prompt_id', { ascending: true })
  if (rows.error) throw rows.error
  return Object.freeze((rows.data || []).map((row: any) => Object.freeze({
    promptId: clean(row.prompt_id, 64).toLowerCase(),
    teacherId: clean(row.teacher_id, 80),
    provider: clean(row.provider, 80),
    model: clean(row.model, 240),
    text: clean(row.response_text, 50_000),
    itemHash: clean(row.response_hash, 64).toLowerCase(),
    requestId: clean(row.request_id, 240) || null,
    inputTokens: Number.isInteger(row.input_tokens) ? row.input_tokens : null,
    outputTokens: Number.isInteger(row.output_tokens) ? row.output_tokens : null,
  })))
}
