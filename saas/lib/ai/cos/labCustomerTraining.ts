// Customer LAB training: teacher data → dataset preparation → training → downloadable model, on the CUSTOMER's
// Hugging Face account with the CUSTOMER's credentials and approved budget.
//
// Pure orchestration with injected ports, so every rule here is unit-tested without network or database.
// Graduation, Residency and certification are intentionally NOT inputs anywhere in this file.
import { createHash, createHmac, randomBytes } from 'node:crypto'
import {
  buildHuggingFaceJobSpec, huggingFaceJobsConfigFromEnv, type HuggingFaceJobSpec,
} from './cosUniversityHuggingFaceJobs.ts'
// Same value as COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE (the worker signs callbacks with this profile header).
// Inlined so this module does not pull the platform University executor into customer code.
const COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE = 'cos_university_training_executor_v1' as const

export const LAB_CUSTOMER_CALLBACK_PREFIX = '/api/lab/training/callback'
export const LAB_TEACHER_SYSTEM_PROMPT = 'You are an expert teacher. Answer the request completely, correctly and concisely. Do not mention that you are a teacher or that this is training data.'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const HEX64 = /^[a-f0-9]{64}$/

// --- Stage tokens and callback signing ----------------------------------------------------------------------------
/** Single-use token handed ONLY to the customer's own HF job (in its callback URL). The database keeps the hash. */
export function newStageToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: sha256(token) }
}
export const stageTokenHash = (token: string) => sha256(String(token ?? ''))
/** The worker's callback signing secret is derived from the stage token: no extra server secret, nothing to leak. */
export function stageCallbackSecret(runId: string, token: string): string {
  return createHmac('sha256', token).update(`itmounts:lab-customer-callback:v1:${runId}`).digest('hex')
}
export function verifyWorkerCallback(input: { secret: string; timestamp: string; idempotencyKey: string; rawBody: string; signature: string; now?: number }): boolean {
  const at = Date.parse(input.timestamp)
  if (!Number.isFinite(at) || Math.abs((input.now ?? Date.now()) - at) > 15 * 60_000) return false
  const expected = createHmac('sha256', input.secret).update([input.timestamp, input.idempotencyKey, input.rawBody].join('\n')).digest('hex')
  const given = String(input.signature ?? '')
  if (given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  return diff === 0
}

// --- Teacher data -------------------------------------------------------------------------------------------------
export type TeacherRow = Readonly<{
  promptId: string; teacherId: string; provider: string; model: string
  prompt: string; response: string; text: string; itemHash: string
}>

export function parsePrompts(raw: unknown): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const prompt = line.trim().slice(0, 4000)
    if (prompt && !seen.has(prompt)) { seen.add(prompt); out.push(prompt) }
  }
  return out
}

export async function buildCustomerTeacherRows(input: {
  teacher: { id: string; provider: string; model: string }
  prompts: readonly string[]
  generate: (prompt: string) => Promise<string>
  concurrency?: number
  onProgress?: (done: number, total: number) => void
}): Promise<{ rows: TeacherRow[]; failures: number; datasetHash: string }> {
  const prompts = input.prompts.slice(0, 128)
  const results: (TeacherRow | null)[] = new Array(prompts.length).fill(null)
  let next = 0
  let done = 0
  let failures = 0
  const worker = async () => {
    while (next < prompts.length) {
      const index = next++
      const prompt = prompts[index]
      try {
        const response = String(await input.generate(prompt) ?? '').trim()
        if (!response) throw new Error('empty')
        const text = `<user>\n${prompt}\n\n<assistant>\n${response}`
        results[index] = Object.freeze({
          promptId: sha256(prompt), teacherId: input.teacher.id, provider: input.teacher.provider,
          model: input.teacher.model, prompt, response, text, itemHash: sha256(text),
        })
      } catch {
        failures++
      }
      input.onProgress?.(++done, prompts.length)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(8, input.concurrency ?? 4)) }, worker))
  const rows = results.filter((row): row is TeacherRow => row !== null)
  // Dedupe identical answers: the worker rejects duplicate item hashes.
  const unique = [...new Map(rows.map(row => [row.itemHash, row])).values()]
  const datasetHash = sha256(JSON.stringify({ items: unique.map(row => row.itemHash).sort() }))
  return { rows: unique, failures, datasetHash }
}

/** Same formula as manifest_hash() in scripts/cos-university-hf-worker-base.py. */
export function manifestHash(items: readonly string[]): string {
  return sha256(JSON.stringify({ items: [...items].sort() }))
}

// --- Envelopes ----------------------------------------------------------------------------------------------------
export function buildPrepareEnvelope(input: {
  runId: string; rows: readonly TeacherRow[]; baseModel: string; baseModelRevision: string | null; datasetHash: string
}) {
  if (input.rows.length < 20) throw new Error('lab_teacher_rows_too_few')
  return Object.freeze({
    profile: COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
    authorityExpanded: false,
    operation: 'prepare_dataset',
    candidateId: `lab-${input.runId}`,
    baseModel: input.baseModel,
    baseModelRevision: input.baseModelRevision,
    datasetHash: input.datasetHash,
    candidate: {
      source: `itmounts://cos-university/mass-hosted-teacher/${input.runId}`,
      teacherRows: input.rows,
    },
  })
}

export function buildTrainEnvelope(input: {
  runId: string; baseModel: string; baseModelRevision: string | null; datasetHash: string
  trainingDataRef: string; holdoutDataRef: string; trainingManifestHash: string; holdoutManifestHash: string
}) {
  return Object.freeze({
    profile: COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
    authorityExpanded: false,
    operation: 'train',
    candidateId: `lab-${input.runId}`,
    trainingMode: 'fine_tune',
    trainingDataRef: input.trainingDataRef,
    holdoutDataRef: input.holdoutDataRef,
    revision: {
      baseModel: input.baseModel,
      baseModelRevision: input.baseModelRevision,
      datasetHash: input.datasetHash,
      trainingManifestHash: input.trainingManifestHash,
      holdoutManifestHash: input.holdoutManifestHash,
    },
  })
}

// --- Job submission on the customer's account ---------------------------------------------------------------------
// Order is fixed and tested: PLAN (no spend) -> RESERVE in the database (cost, callback token, job name) -> SUBMIT ->
// ATTACH job id. If submission errors, look the job up by its deterministic name before releasing anything: a job
// that HF accepted but whose response was lost is attached, never forgotten. If ATTACH fails, the reservation and job
// name are already saved, so "Check status" reconciles it.
export type HfPorts = Readonly<{
  resolveNamespace: (token: string) => Promise<string>
  resolveHourlyUsd: (flavor: string, token: string) => Promise<number>
  submit: (namespace: string, token: string, spec: HuggingFaceJobSpec) => Promise<{ jobId: string; jobUrl: string }>
  findByName: (namespace: string, token: string, name: string) => Promise<{ jobId: string; jobUrl: string } | null>
}>

export type PlannedJob = Readonly<{
  spec: HuggingFaceJobSpec; namespace: string; jobName: string; hourlyUsd: number; maxCostUsd: number
}>

export async function planCustomerJob(input: {
  runId: string
  envelope: Readonly<Record<string, unknown>>
  customerHfToken: string
  stageToken: string
  origin: string
  platformEnv: Record<string, string | undefined>
  maxHourlyUsd: number
  remainingBudgetUsd: number
  ports: HfPorts
}): Promise<PlannedJob> {
  // The worker script is delivered by THIS deployment; its URL comes from the platform configuration.
  // Everything cost-bearing and every write uses the customer's own token.
  const platform = huggingFaceJobsConfigFromEnv(input.platformEnv)
  if (!platform) throw new Error('lab_training_worker_delivery_unconfigured')
  const config = huggingFaceJobsConfigFromEnv({
    ...input.platformEnv,
    HF_TOKEN: input.customerHfToken,
    // Only the customer LAB uses its approved hourly cap; internal COS retains independent safety defaults.
    COS_UNIVERSITY_HF_MAX_HOURLY_COST_USD: String(input.maxHourlyUsd),
    COS_UNIVERSITY_HF_WORKER_URL: platform.workerUrl,
  })
  if (!config) throw new Error('lab_customer_hf_token_invalid')
  const callbackUrl = new URL(`${LAB_CUSTOMER_CALLBACK_PREFIX}/${input.stageToken}`, input.origin).toString()
  const operation = String(input.envelope.operation ?? '')
  const spec = buildHuggingFaceJobSpec({
    envelope: input.envelope as any,
    callbackUrl,
    idempotencyKey: sha256(`lab-customer:${input.runId}:${operation}`),
    callbackSecret: stageCallbackSecret(input.runId, input.stageToken),
    config,
  })
  const hourlyUsd = await input.ports.resolveHourlyUsd(spec.flavor, input.customerHfToken)
  const hourlyCap = Math.min(config.maxHourlyCostUsd, input.maxHourlyUsd)
  if (!(hourlyUsd <= hourlyCap)) throw new Error('lab_training_hourly_cost_cap_exceeded')
  const maxCostUsd = Number((hourlyUsd * spec.timeoutSeconds / 3600).toFixed(6))
  if (!(maxCostUsd <= input.remainingBudgetUsd)) throw new Error('lab_training_budget_insufficient')
  const namespace = await input.ports.resolveNamespace(input.customerHfToken)
  return Object.freeze({ spec, namespace, jobName: spec.labels.name, hourlyUsd, maxCostUsd })
}

export type JobBookkeeping = Readonly<{
  /** Saves cost reservation + callback token hash + job name + namespace. Must succeed before any spend. */
  reserve: (plan: PlannedJob) => Promise<void>
  attach: (job: { jobId: string; jobUrl: string }) => Promise<void>
  release: (reason: string) => Promise<void>
}>

export type JobOutcome =
  | { status: 'submitted'; jobId: string; jobUrl: string; recoveredByName: boolean }
  | { status: 'submitted_unattached'; jobId: string; jobUrl: string }
  | { status: 'not_submitted'; reason: string }
  | { status: 'unknown'; reason: string }

export async function runReservedJob(input: { plan: PlannedJob; customerHfToken: string; ports: HfPorts; book: JobBookkeeping }): Promise<JobOutcome> {
  const { plan, customerHfToken: token, ports, book } = input
  await book.reserve(plan) // throws -> nothing was spent, nothing to undo
  let job: { jobId: string; jobUrl: string } | null = null
  let recoveredByName = false
  try {
    job = await ports.submit(plan.namespace, token, plan.spec)
  } catch (submitError) {
    const reason = submitError instanceof Error ? submitError.message.split(':')[0].slice(0, 120) : 'lab_job_submit_failed'
    try {
      job = await ports.findByName(plan.namespace, token, plan.jobName)
    } catch {
      // Cannot prove the job does not exist: keep the reservation; "Check status" reconciles by job name.
      return { status: 'unknown', reason }
    }
    if (!job) {
      await book.release(reason).catch(() => undefined)
      return { status: 'not_submitted', reason }
    }
    recoveredByName = true
  }
  try {
    await book.attach(job)
  } catch {
    return { status: 'submitted_unattached', ...job }
  }
  return { status: 'submitted', ...job, recoveredByName }
}

// --- Worker callbacks ---------------------------------------------------------------------------------------------
export type RedeemedRun = Readonly<{
  runId: string; organizationId: string; stage: string; baseModel: string; baseModelRevision: string | null
  datasetHash: string | null; hfNamespace: string | null
}>

const DATASET_REF = (ns: string) => new RegExp(`^hf://datasets/${ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[A-Za-z0-9_.-]+@[A-Za-z0-9._-]+#(train|holdout)$`)
const MODEL_REF = /^hf:\/\/models\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([A-Za-z0-9._-]+)$/

export type CallbackDecision =
  | { kind: 'start_training'; train: ReturnType<typeof buildTrainEnvelope>; patch: Record<string, unknown> }
  | { kind: 'complete'; patch: Record<string, unknown> }
  | { kind: 'acknowledge' }
  | { kind: 'reject'; reason: string }

export function interpretWorkerCallback(run: RedeemedRun, payload: any): CallbackDecision {
  const claim = String(payload?.claim ?? '')
  if (String(payload?.candidateId ?? '') !== `lab-${run.runId}`) return { kind: 'reject', reason: 'candidate_mismatch' }
  const ns = run.hfNamespace ?? ''
  if (!ns) return { kind: 'reject', reason: 'namespace_unknown' }
  if (claim === 'partition_manifests_registered') {
    if (run.stage !== 'preparing_dataset') return { kind: 'reject', reason: 'stage_conflict' }
    const trainingRef = String(payload?.trainingDataRef ?? '')
    const holdoutRef = String(payload?.holdoutDataRef ?? '')
    const trainHashes = Array.isArray(payload?.trainingItemHashes) ? payload.trainingItemHashes.map(String) : []
    const holdoutHashes = Array.isArray(payload?.holdoutItemHashes) ? payload.holdoutItemHashes.map(String) : []
    if (!DATASET_REF(ns).test(trainingRef) || !DATASET_REF(ns).test(holdoutRef)) return { kind: 'reject', reason: 'dataset_outside_customer_account' }
    if (String(payload?.datasetHash ?? '') !== run.datasetHash) return { kind: 'reject', reason: 'dataset_hash_mismatch' }
    if (trainHashes.length < 8 || holdoutHashes.length < 2 || ![...trainHashes, ...holdoutHashes].every((h: string) => HEX64.test(h))) {
      return { kind: 'reject', reason: 'partition_invalid' }
    }
    const trainingManifestHash = manifestHash(trainHashes)
    const holdoutManifestHash = manifestHash(holdoutHashes)
    return {
      kind: 'start_training',
      train: buildTrainEnvelope({
        runId: run.runId, baseModel: run.baseModel, baseModelRevision: run.baseModelRevision, datasetHash: run.datasetHash!,
        trainingDataRef: trainingRef, holdoutDataRef: holdoutRef, trainingManifestHash, holdoutManifestHash,
      }),
      patch: { trainingDataRef: trainingRef, holdoutDataRef: holdoutRef, trainingManifestHash, holdoutManifestHash },
    }
  }
  if (claim === 'trained_artifact_registered') {
    if (run.stage !== 'training') return { kind: 'reject', reason: 'stage_conflict' }
    const match = MODEL_REF.exec(String(payload?.evidenceRef ?? ''))
    const artifactHash = String(payload?.artifactHash ?? '')
    if (!match || !match[1].startsWith(`${ns}/`)) return { kind: 'reject', reason: 'artifact_outside_customer_account' }
    if (!HEX64.test(artifactHash)) return { kind: 'reject', reason: 'artifact_hash_invalid' }
    return { kind: 'complete', patch: { artifactRepo: match[1], artifactRevision: match[2], artifactHash } }
  }
  return { kind: 'acknowledge' }
}

// --- Customer refresh ---------------------------------------------------------------------------------------------
export function interpretJobStage(providerStage: string, logTail: string): { failed: boolean; message: string; failureCode: string | null } {
  const stage = String(providerStage ?? '').toUpperCase()
  if (stage === 'ERROR' || stage === 'CANCELED' || stage === 'CANCELLED' || stage === 'DELETED') {
    const match = /itmounts_hf_worker_error:([A-Za-z]+):([a-z0-9_:.-]{1,120})/i.exec(logTail)
    const code = match ? match[2].split(':')[0] : `hf_job_${stage.toLowerCase()}`
    return { failed: true, message: `The Hugging Face job stopped (${stage.toLowerCase()}): ${code}`, failureCode: code }
  }
  if (stage === 'RUNNING') return { failed: false, message: 'Running on your Hugging Face account.', failureCode: null }
  if (stage === 'COMPLETED') return { failed: false, message: 'Hugging Face job finished; waiting for its report.', failureCode: null }
  return { failed: false, message: `Hugging Face job status: ${stage.toLowerCase() || 'unknown'}.`, failureCode: null }
}

// --- Customer-supplied examples (no provider calls, no teacher spend) ----------------------------------------------
/** One JSON object per line: {"prompt": "...", "response": "..."}. Rows are built exactly like teacher rows. */
export function rowsFromExamples(raw: unknown): { rows: TeacherRow[]; invalidLines: number; datasetHash: string } {
  const rows = new Map<string, TeacherRow>()
  let invalidLines = 0
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue
    let item: any
    try { item = JSON.parse(line) } catch { invalidLines++; continue }
    const prompt = String(item?.prompt ?? '').trim().slice(0, 8000)
    const response = String(item?.response ?? '').trim().slice(0, 20000)
    if (!prompt || !response) { invalidLines++; continue }
    const text = `<user>\n${prompt}\n\n<assistant>\n${response}`
    const itemHash = sha256(text)
    if (!rows.has(itemHash) && rows.size < 128) rows.set(itemHash, Object.freeze({
      promptId: sha256(prompt), teacherId: 'customer-examples', provider: 'customer', model: 'customer-examples',
      prompt, response, text, itemHash,
    }))
  }
  const list = [...rows.values()]
  // promptId must be unique for the worker; drop repeated prompts with different answers.
  const byPrompt = [...new Map(list.map(row => [row.promptId, row])).values()]
  return { rows: byPrompt, invalidLines, datasetHash: sha256(JSON.stringify({ items: byPrompt.map(row => row.itemHash).sort() })) }
}

// Hosted-API teacher calls: see labCustomerGovernedTeacher.ts (DB reservation -> Platform Harness -> settle).

// --- Download -----------------------------------------------------------------------------------------------------
/** sha256 = LFS content hash; gitOid = git blob sha1 for small non-LFS files. One of them is always present. */
export type ArtifactFile = Readonly<{ path: string; size: number; sha256: string | null; gitOid?: string | null }>
export type DownloadDecision =
  | { allowed: true; repo: string; revision: string; file: ArtifactFile }
  | { allowed: false; reason: 'unauthorized' | 'not_ready' | 'artifact_invalid' | 'file_not_in_artifact' }

/**
 * Membership + completed run + the file is in the manifest recorded when training finished, at the pinned revision.
 * The server streams the file with the customer's stored token, so LAB membership is enough: the member does NOT need
 * their own access to the Hugging Face repository. No graduation/certification input.
 */
export function decideModelDownload(input: {
  activeMember: boolean
  run: { stage: string; artifactRepo: string | null; artifactRevision: string | null; artifactFiles: readonly ArtifactFile[] | null } | null
  path: string
}): DownloadDecision {
  if (!input.activeMember || !input.run) return { allowed: false, reason: 'unauthorized' }
  if (input.run.stage !== 'completed') return { allowed: false, reason: 'not_ready' }
  const { artifactRepo: repo, artifactRevision: revision, artifactFiles: files } = input.run
  if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !revision || !/^[a-f0-9]{40}$/.test(revision) || !Array.isArray(files) || !files.length) {
    return { allowed: false, reason: 'artifact_invalid' }
  }
  const file = files.find(item => item.path === input.path)
  if (!file || file.path.includes('..') || file.path.startsWith('/')) return { allowed: false, reason: 'file_not_in_artifact' }
  if (!file.sha256 && !file.gitOid) return { allowed: false, reason: 'artifact_invalid' }
  return { allowed: true, repo, revision, file }
}

/** Passes bytes through while hashing; errors the stream (client sees a failed download) on size or sha256 mismatch. */
export function verifyingStream(expected: ArtifactFile): TransformStream<Uint8Array, Uint8Array> {
  const content = createHash('sha256')
  const blob = createHash('sha1').update(`blob ${expected.size}\0`)
  let bytes = 0
  return new TransformStream({
    transform(chunk, controller) { bytes += chunk.byteLength; content.update(chunk); blob.update(chunk); controller.enqueue(chunk) },
    flush(controller) {
      if (bytes !== expected.size) controller.error(new Error('lab_artifact_size_mismatch'))
      else if (expected.sha256 ? content.digest('hex') !== expected.sha256 : blob.digest('hex') !== expected.gitOid) {
        controller.error(new Error('lab_artifact_integrity_failed'))
      }
    },
  })
}
