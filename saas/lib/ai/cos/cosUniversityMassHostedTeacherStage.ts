import { createHash } from 'node:crypto'
import { persistDistillationAssetVault } from './cosUniversityDistillationAssetVault.ts'
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

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function numericMap(value: unknown, min: number, max: number, integer = false): Readonly<Record<string, number>> {
  let parsed: unknown
  try { parsed = JSON.parse(String(value ?? '').trim() || '{}') } catch { return Object.freeze({}) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return Object.freeze({})
  const result: Record<string, number> = {}
  for (const [rawKey, rawValue] of Object.entries(parsed as Record<string, unknown>)) {
    const key = clean(rawKey, 80).toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(key)) continue
    const n = boundedNumber(rawValue, Number.NaN, min, max)
    if (!Number.isFinite(n)) continue
    result[key] = integer ? Math.floor(n) : n
  }
  return Object.freeze(result)
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
    // These are planning estimates, not billing claims. The router uses them to balance expected
    // dollars across active faculty while preserving at least one governed route to each teacher.
    providerEstimatedUnitCostUsd: numericMap(
      env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_PROVIDER_COST_USD_JSON,
      0.000001,
      100,
    ),
    // A provider may need more completion headroom to finish the same concise teaching answer.
    // The global hard ceiling still wins, so this cannot expand the existing 512-token envelope.
    providerMaxOutputTokens: numericMap(
      env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_PROVIDER_MAX_OUTPUT_TOKENS_JSON,
      128,
      HARD_MAX_OUTPUT_TOKENS,
      true,
    ),
  })
}

type MassHostedTeacherConfig = ReturnType<typeof massHostedTeacherStageConfig>

function teacherTuningValue(
  values: Readonly<Record<string, number>>,
  teacher: UniversityTeacherDefinition,
): number | null {
  return values[teacher.id.toLowerCase()] ?? values[teacher.provider.toLowerCase()] ?? null
}

function teacherEstimatedCostUsd(config: MassHostedTeacherConfig, teacher: UniversityTeacherDefinition): number | null {
  return teacherTuningValue(config.providerEstimatedUnitCostUsd, teacher)
}

function teacherOutputTokenLimit(config: MassHostedTeacherConfig, teacher: UniversityTeacherDefinition): number {
  const configured = teacherTuningValue(config.providerMaxOutputTokens, teacher)
  return configured == null
    ? config.maxOutputTokens
    : boundedInt(configured, config.maxOutputTokens, 128, HARD_MAX_OUTPUT_TOKENS)
}

function costBalancedPrimaryPlan(input: {
  prompts: readonly Prompt[]
  teachers: readonly UniversityTeacherDefinition[]
  config: MassHostedTeacherConfig
}): ReadonlyMap<string, UniversityTeacherDefinition> {
  const knownCosts = input.teachers
    .map(teacher => teacherEstimatedCostUsd(input.config, teacher))
    .filter((value): value is number => value != null && value > 0)
  // An unpriced provider is treated conservatively as the most expensive known provider. If none
  // are priced, every provider has equal planning cost and the deterministic tie-break spreads work.
  const fallbackCost = knownCosts.length ? Math.max(...knownCosts) : 1
  const plannedSpend = new Map<string, number>()
  const plan = new Map<string, UniversityTeacherDefinition>()

  for (const prompt of input.prompts) {
    const promptId = clean(prompt.id, 64).toLowerCase()
    const ranked = [...input.teachers].sort((left, right) => {
      const leftCost = teacherEstimatedCostUsd(input.config, left) ?? fallbackCost
      const rightCost = teacherEstimatedCostUsd(input.config, right) ?? fallbackCost
      const leftProjected = (plannedSpend.get(left.provider) || 0) + leftCost
      const rightProjected = (plannedSpend.get(right.provider) || 0) + rightCost
      if (leftProjected !== rightProjected) return leftProjected - rightProjected
      return hash(`${promptId}\u0000${left.id}`).localeCompare(hash(`${promptId}\u0000${right.id}`))
    })
    const selected = ranked[0]
    if (!selected) continue
    const cost = teacherEstimatedCostUsd(input.config, selected) ?? fallbackCost
    plannedSpend.set(selected.provider, (plannedSpend.get(selected.provider) || 0) + cost)
    plan.set(promptId, selected)
  }
  return plan
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

  // Balance *expected dollars*, not call counts. Equal provider balances otherwise drain at radically
  // different rates. A cost-balanced primary plan preserves faculty diversity while assigning fewer
  // first-pass calls to expensive teachers. On a partial retry, the original primary is excluded when
  // another provider exists, preventing a known failed/truncated paid attempt from being purchased
  // again before rerouting.
  const primaryPlan = costBalancedPrimaryPlan({ prompts: input.prompts, teachers, config })
  const plannedProviderMix: Record<string, number> = {}
  let plannedEstimatedCostUsd = 0
  for (const teacher of primaryPlan.values()) {
    plannedProviderMix[teacher.id] = (plannedProviderMix[teacher.id] || 0) + 1
    plannedEstimatedCostUsd += teacherEstimatedCostUsd(config, teacher) || 0
  }
  const partialRetry = (existing.data || []).length > 0
    && missing.length < input.prompts.length
    && input.prompts.length <= config.maxCalls

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
    estimatedUnitCostUsd: teacherEstimatedCostUsd(config, teacher),
    environments: Object.freeze(['production']),
    metadata: Object.freeze({ transport: teacher.transport }),
  }))
  const rankedByPrompt = new Map<string, readonly UniversityTeacherDefinition[]>()
  for (const prompt of missing) {
    const promptId = clean(prompt.id, 64).toLowerCase()
    const preferred = primaryPlan.get(promptId)
    const hasAlternative = Boolean(preferred && teachers.some(teacher => teacher.provider !== preferred.provider))
    const excludePreviousPrimary = partialRetry && hasAlternative ? [preferred!.provider] : undefined
    const ranked = rankDynamicPipelineCandidates({
      workloadId: promptId,
      capabilityId: 'ai.teacher.generate',
      environment: 'production',
      preferredProviderIds: excludePreviousPrimary || !preferred ? undefined : [preferred.provider],
      excludedProviderIds: excludePreviousPrimary,
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
                'Keep the response complete and concise: use at most 180 words, finish every sentence and list, and never pad the answer to the output limit.',
              ].join(' '),
              prompt: String(prompt.prompt || '').slice(0, 3000),
              maxOutputTokens: teacherOutputTokenLimit(config, teacher),
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

  const datasetHash = rows.length >= MIN_TEACHER_ROWS
    ? hash({ items: rows.map(row => clean(row.response_hash, 64).toLowerCase()).sort() })
    : null
  const vaulted = datasetHash
    ? await persistDistillationAssetVault({
        candidateId: input.run.candidate_id,
        runId: input.run.id,
        batchKey: input.run.batch_key,
        subjectId: input.run.subject_id,
        promptSetHash: input.promptSetHash,
        sourceRef: `itmounts://cos-university/mass-hosted-teacher/${input.run.id}`,
        trainingRights: 'governed_hosted_teacher_output',
        expectedItemHashes: rows.map(row => clean(row.response_hash, 64).toLowerCase()),
        rows: rows.map(row => {
          const promptId = clean(row.prompt_id, 64).toLowerCase()
          const prompt = input.prompts.find(item => clean(item.id, 64).toLowerCase() === promptId)?.prompt || ''
          const response = clean(row.response_text, 50_000)
          return {
            promptId,
            prompt,
            response,
            text: response,
            itemHash: clean(row.response_hash, 64).toLowerCase(),
            teacherProvider: row.provider,
            teacherModelId: row.model,
          }
        }),
      }, input.db)
    : null

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
    plannedProviderMix: Object.freeze(plannedProviderMix),
    plannedEstimatedCostUsd: Number(plannedEstimatedCostUsd.toFixed(6)),
    routingMode: 'dynamic-pipeline-router-v1-cost-balanced' as const,
    attemptedCalls,
    reroutedPrompts,
    failures: Object.freeze(failures),
    outputHashes: Object.freeze(rows.map(row => clean(row.response_hash, 64).toLowerCase())),
    datasetHash,
    assetSetKey: vaulted?.assetSetKey || null,
    portableManifestHash: vaulted?.portableManifestHash || null,
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
