import { createHash } from 'node:crypto'
import { createDynamicPipelineCandidate, rankDynamicPipelineCandidates } from '../../dynamic-pipeline-router/index.ts'
import {
  universityTeacherPoolStatus,
  type UniversityTeacherDefinition,
  type UniversityTeacherTransport,
} from './cosUniversityTeacherPool.ts'
import { generateWithUniversityTeacher } from './cosUniversityTeacherAdapters.ts'

const HOSTED_TRANSPORTS: readonly UniversityTeacherTransport[] = Object.freeze([
  'openai_responses',
  'openai_compatible',
  'anthropic_messages',
  'gemini_generate_content',
])
const MIN_TEACHER_ROWS = 20
const DEFAULT_MAX_CALLS = 20
const HARD_MAX_CALLS = 20
const DEFAULT_MAX_OUTPUT_TOKENS = 384
const HARD_MAX_OUTPUT_TOKENS = 512
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
  // Eligibility is declared by the provider definition rather than a vendor-ID whitelist. This
  // keeps protocol-compatible hosted teachers working while allowing a buyer to add another provider
  // without changing the mass-distillation engine. Dynamic providers remain excluded by default
  // unless the buyer explicitly marks that provider as eligible for the bounded mass stage.
  return universityTeacherPoolStatus(env).activeProviders
    .filter(item => HOSTED_TRANSPORTS.includes(item.transport) && item.massDistillationEligible === true)
    .map(item => Object.freeze({
      id: item.id,
      provider: item.provider,
      transport: item.transport,
      model: item.model,
      credentialEnv: item.credentialEnv,
      enabledEnv: item.enabledEnv,
      adapterReadyEnv: item.adapterReadyEnv,
      modelEnv: item.modelEnv,
      endpointEnv: item.endpointEnv,
      defaultEndpoint: item.defaultEndpoint,
      massDistillationEligible: true,
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
    return Object.freeze({
      ok: true, skipped: true, reason: 'mass_hosted_teacher_disabled', completed: false,
      rows: 0, minimumRows: MIN_TEACHER_ROWS, activeProviders: [], providerMix: Object.freeze({}),
      failures: Object.freeze([]), outputHashes: Object.freeze([]), datasetHash: null, config,
      authorityExpanded: false, silentFallbackAllowed: false,
    })
  }
  if (!teachers.length) {
    return Object.freeze({
      ok: true, skipped: true, reason: 'no_active_hosted_teacher_provider', completed: false,
      rows: 0, minimumRows: MIN_TEACHER_ROWS, activeProviders: [], providerMix: Object.freeze({}),
      failures: Object.freeze([]), outputHashes: Object.freeze([]), datasetHash: null, config,
      authorityExpanded: false, silentFallbackAllowed: false,
    })
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
  const failures: Array<{ promptId: string; teacherId: string; error: string }> = []

  // The shared Dynamic Pipeline Router owns selection policy. This stage only supplies active,
  // authorized teacher pipelines and executes the returned order. Provider names are data, not
  // routing branches.
  const teacherByPipeline = new Map(teachers.map(teacher => [teacher.id, teacher] as const))
  const routerCandidates = teachers.map(teacher => createDynamicPipelineCandidate({
    pipelineId: teacher.id,
    providerId: teacher.provider,
    capabilityIds: Object.freeze(['ai.teacher.generate']),
    availability: 'available',
    maxConcurrency: config.parallelism,
    activeLeases: 0,
    queueDepth: 0,
    recentFailureRate: 0,
    environments: Object.freeze(['production']),
    metadata: Object.freeze({ transport: teacher.transport }),
  }))
  const rankedByPrompt = new Map<string, readonly UniversityTeacherDefinition[]>()
  for (const prompt of missing) {
    const promptId = clean(prompt.id, 64).toLowerCase()
    const ranked = rankDynamicPipelineCandidates({
      workloadId: promptId,
      capabilityId: 'ai.teacher.generate',
      environment: 'production',
    }, routerCandidates)
    rankedByPrompt.set(promptId, Object.freeze(
      ranked.map(item => teacherByPipeline.get(item.candidate.pipelineId)).filter((item): item is UniversityTeacherDefinition => Boolean(item)),
    ))
  }

  // maxCalls is a per-invocation attempt budget, not a lifetime row cap. Allocate attempts in
  // waves so every missing prompt gets one fair first route before spare budget is used for
  // another compatible pipeline.
  const providerChains = new Map<string, UniversityTeacherDefinition[]>()
  let remainingAttempts = config.maxCalls
  for (let wave = 0; wave < teachers.length && remainingAttempts > 0; wave += 1) {
    for (const prompt of missing) {
      if (remainingAttempts <= 0) break
      const promptId = clean(prompt.id, 64).toLowerCase()
      const teacher = rankedByPrompt.get(promptId)?.[wave]
      if (!teacher) continue
      const chain = providerChains.get(promptId) || []
      if (chain.some(item => item.id === teacher.id)) continue
      chain.push(teacher)
      providerChains.set(promptId, chain)
      remainingAttempts -= 1
    }
  }

  const callTargets = missing.filter(prompt => providerChains.has(clean(prompt.id, 64).toLowerCase()))
  let reroutedPrompts = 0
  let attemptedCalls = 0

  for (let offset = 0; offset < callTargets.length; offset += config.parallelism) {
    const chunk = callTargets.slice(offset, offset + config.parallelism)
    const settled = await Promise.all(chunk.map(async prompt => {
      const promptId = clean(prompt.id, 64).toLowerCase()
      const chain = providerChains.get(promptId) || []
      const localFailures: Array<{ promptId: string; teacherId: string; error: string }> = []

      for (let attempt = 0; attempt < chain.length; attempt += 1) {
        const teacher = chain[attempt]
        attemptedCalls += 1
        try {
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
              prompt: String(prompt.prompt || '').slice(0, 3000),
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
            prompt_id: promptId,
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
          if (attempt > 0) reroutedPrompts += 1
          return { promptId, row: stored.data, failures: localFailures }
        } catch (error) {
          localFailures.push({
            promptId,
            teacherId: teacher.id,
            error: clean(error instanceof Error ? error.message : error, 300) || 'unknown_error',
          })
        }
      }

      return { promptId, row: null, failures: localFailures }
    }))

    for (const entry of settled) {
      failures.push(...entry.failures)
      if (entry.row) byPrompt.set(entry.promptId, entry.row)
    }
  }

  const rows = input.prompts
    .map(prompt => byPrompt.get(clean(prompt.id, 64).toLowerCase()))
    .filter(Boolean)

  const providerMix: Record<string, number> = {}
  for (const row of rows) providerMix[row.teacher_id] = (providerMix[row.teacher_id] || 0) + 1

  if (failures.length > 0) {
    console.error('[cos-university-mass-hosted-teacher-failures]', JSON.stringify({
      runId: String(input.run.id || ''),
      candidateId: String(input.run.candidate_id || ''),
      activeProviders: teachers.map(item => item.id),
      completedRows: rows.length,
      failures: failures.slice(0, 20),
      authorityExpanded: false,
    }))
  }

  return Object.freeze({
    ok: rows.length >= MIN_TEACHER_ROWS,
    skipped: false,
    completed: rows.length >= MIN_TEACHER_ROWS,
    rows: rows.length,
    minimumRows: MIN_TEACHER_ROWS,
    activeProviders: teachers.map(item => item.id),
    providerMix: Object.freeze(providerMix),
    routingMode: 'dynamic-pipeline-router-v1' as const,
    attemptedCalls,
    reroutedPrompts,
    failures: Object.freeze(failures),
    outputHashes: Object.freeze(rows.map(row => clean(row.response_hash, 64).toLowerCase())),
    datasetHash: rows.length >= MIN_TEACHER_ROWS ? hash({ items: rows.map(row => clean(row.response_hash, 64).toLowerCase()).sort() }) : null,
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
