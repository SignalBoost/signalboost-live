import { createClient } from '@supabase/supabase-js'
import { callModel } from '@/lib/ai/modelRouter'
import { listRepoFiles, readRepoFile } from '@/lib/ai/tools/repoReader'
import { commitFileToBranch } from '@/lib/ai/tools/repoWriter'
import { runAudit } from '@/lib/audit/runner'
import { verifyEngineeringCommit } from './engineeringVerification'

const TABLE = 'cos_autonomy_state'
const PREFIX = 'owner-engineering:'
const DEFAULT_MAX_ITERATIONS = 20
const MAX_TRACE = 40
const MAX_TOOL_OUTPUT = 45_000

type EngineeringStatus =
  | 'QUEUED'
  | 'DIAGNOSING'
  | 'PATCHING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'BLOCKED_EXCEEDED_BUDGET'
  | 'BLOCKED_MISSING_CREDENTIAL'
  | 'FAILED_UNRECOVERABLE'

interface EngineeringTrace {
  at: string
  iteration: number
  action: string
  ok: boolean
  summary: string
  output?: string
}

interface CommitEvidence {
  sha: string
  branch: string
  path: string
  prUrl: string
  prNumber: number
}

interface EngineeringState {
  schemaVersion: 'cos-owner-engineering-v1'
  missionId: string
  userId: string | null
  objective: string
  stage: EngineeringStatus
  iteration: number
  maxIterations: number
  consecutiveFailures: number
  branch: string
  readFiles: string[]
  trace: EngineeringTrace[]
  lastCommit?: CommitEvidence
  checkpoints: Record<string, boolean>
  createdAt: string
  updatedAt: string
  completedAt?: string
  blockedReason?: string
}

export interface EngineeringMissionRow {
  id: string
  user_id: string | null
  objective: string
  status: EngineeringStatus
  state: EngineeringState
  created_at: string
  updated_at: string
}

type BrainAction =
  | { type: 'repo_list'; prefix?: string; reason?: string }
  | { type: 'repo_read'; path: string; reason?: string }
  | { type: 'audit'; prefix?: string; maxFiles?: number; reason?: string }
  | { type: 'commit'; path: string; content: string; message: string; createNewFile?: boolean; reason?: string }
  | { type: 'verify'; reason?: string }
  | { type: 'wait'; reason: string }

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function branchFor(id: string): string {
  return `ai/cos-mission-${id.replace(/[^a-z0-9-]/gi, '').slice(0, 18).toLowerCase()}`
}

function initialState(id: string, objective: string, userId: string | null): EngineeringState {
  const now = new Date().toISOString()
  return {
    schemaVersion: 'cos-owner-engineering-v1',
    missionId: id,
    userId,
    objective,
    stage: 'QUEUED',
    iteration: 0,
    maxIterations: DEFAULT_MAX_ITERATIONS,
    consecutiveFailures: 0,
    branch: branchFor(id),
    readFiles: [],
    trace: [],
    checkpoints: {},
    createdAt: now,
    updatedAt: now,
  }
}

function fromStored(missionId: string, state: EngineeringState, updatedAt?: string): EngineeringMissionRow {
  const id = missionId.startsWith(PREFIX) ? missionId.slice(PREFIX.length) : missionId
  return {
    id,
    user_id: state.userId || null,
    objective: state.objective,
    status: state.stage,
    state,
    created_at: state.createdAt,
    updated_at: updatedAt || state.updatedAt,
  }
}

export function isOwnerEngineeringRequest(text: string): boolean {
  const s = String(text || '').trim()
  if (!s) return false
  const action = /\b(fix|repair|debug|patch|resolve|correct|implement|change|refactor|scan\s+(?:the\s+)?repo|audit\s+(?:the\s+)?repo)\b/i
  const broken = /\b(not\s+working|broken|failing|fails|failure|bug|error)\b/i
  const strongTechnical = /\b(repo|repository|code|platform|app|website|api|route|typescript|next\.?js|vercel|supabase|deployment|build|pipeline|dashboard|cos)\b/i
  const featureContext = /\b(outreach|email|campaign|video|audio|browser|supervisor)\b/i
  return (strongTechnical.test(s) && (action.test(s) || broken.test(s))) || (broken.test(s) && featureContext.test(s))
}

export async function createOwnerEngineeringMission(input: {
  objective: string
  userId?: string | null
}): Promise<{ ok: boolean; mission?: EngineeringMissionRow; error?: string }> {
  const db = admin()
  if (!db) return { ok: false, error: 'Supabase service role is not configured.' }
  const objective = clean(input.objective, 8000)
  if (!objective) return { ok: false, error: 'objective is required' }

  const active = await listActiveOwnerEngineeringMissions(20)
  const duplicate = active.find(item => item.objective === objective && (!input.userId || item.user_id === input.userId))
  if (duplicate) return { ok: true, mission: duplicate }

  const id = crypto.randomUUID()
  const state = initialState(id, objective, input.userId || null)
  const missionId = `${PREFIX}${id}`
  const { error } = await db.from(TABLE).upsert({ mission_id: missionId, state, updated_at: state.updatedAt }, { onConflict: 'mission_id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true, mission: fromStored(missionId, state) }
}

export async function listActiveOwnerEngineeringMissions(limit = 5): Promise<EngineeringMissionRow[]> {
  const db = admin()
  if (!db) return []
  const { data, error } = await db.from(TABLE)
    .select('mission_id,state,updated_at')
    .like('mission_id', `${PREFIX}%`)
    .order('updated_at', { ascending: true })
    .limit(50)
  if (error) return []
  return (data || [])
    .map((item: any) => item?.state?.schemaVersion === 'cos-owner-engineering-v1' ? fromStored(String(item.mission_id), item.state as EngineeringState, item.updated_at) : null)
    .filter((item): item is EngineeringMissionRow => Boolean(item && ['QUEUED', 'DIAGNOSING', 'PATCHING', 'VERIFYING'].includes(item.status)))
    .slice(0, Math.max(1, Math.min(limit, 20)))
}

export async function getOwnerEngineeringMission(id: string): Promise<EngineeringMissionRow | null> {
  const db = admin()
  if (!db) return null
  const missionId = id.startsWith(PREFIX) ? id : `${PREFIX}${id}`
  const { data } = await db.from(TABLE).select('mission_id,state,updated_at').eq('mission_id', missionId).maybeSingle()
  if (!data?.state || data.state.schemaVersion !== 'cos-owner-engineering-v1') return null
  return fromStored(String(data.mission_id), data.state as EngineeringState, data.updated_at)
}

async function saveMission(row: EngineeringMissionRow, state: EngineeringState): Promise<EngineeringMissionRow> {
  const db = admin()
  if (!db) throw new Error('Supabase service role is not configured.')
  const now = new Date().toISOString()
  const next = { ...state, updatedAt: now }
  const missionId = `${PREFIX}${row.id}`
  const { error } = await db.from(TABLE).upsert({ mission_id: missionId, state: next, updated_at: now }, { onConflict: 'mission_id' })
  if (error) throw new Error(error.message || 'mission update failed')
  return fromStored(missionId, next, now)
}

function appendTrace(state: EngineeringState, item: Omit<EngineeringTrace, 'at' | 'iteration'>): EngineeringState {
  return {
    ...state,
    trace: [...state.trace, { ...item, at: new Date().toISOString(), iteration: state.iteration }].slice(-MAX_TRACE),
  }
}

function parseAction(text: string | null): BrainAction | null {
  if (!text) return null
  const raw = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const v = JSON.parse(raw)
    if (!v || typeof v.type !== 'string') return null
    return v as BrainAction
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try { return JSON.parse(raw.slice(start, end + 1)) as BrainAction } catch { return null }
  }
}

function traceForModel(state: EngineeringState): EngineeringTrace[] {
  return state.trace.slice(-10).map(t => ({ ...t, output: t.output?.slice(0, MAX_TOOL_OUTPUT) }))
}

async function chooseAction(row: EngineeringMissionRow): Promise<BrainAction | null> {
  const state = row.state
  const prompt = JSON.stringify({
    objective: row.objective,
    missionId: row.id,
    stage: state.stage,
    branch: state.branch,
    iteration: state.iteration,
    maxIterations: state.maxIterations,
    filesAlreadyRead: state.readFiles,
    lastCommit: state.lastCommit || null,
    checkpoints: state.checkpoints,
    recentToolEvidence: traceForModel(state),
    actions: {
      repo_list: { prefix: 'optional repository path prefix' },
      repo_read: { path: 'exact path from repository evidence' },
      audit: { prefix: 'optional path prefix', maxFiles: '1-12' },
      commit: { path: 'exact path', content: 'COMPLETE replacement file', message: 'commit message', createNewFile: false },
      verify: { note: 'use only after all intended commits are finished' },
      wait: { reason: 'only for a real external dependency such as pending CI' },
    },
  })

  return parseAction(await callModel({
    systemPrompt: [
      'You are COS autonomous senior infrastructure/software engineer.',
      'Own the mission until it is verifiably resolved; do not behave like a consultant.',
      'Return exactly one JSON action and no prose.',
      'Never invent a file path, file content, tool result, commit, PR, check result, or CI result.',
      'Investigate from repository evidence. Read an existing file before committing it.',
      'If verification failed, use the exact failure evidence in recentToolEvidence to repair the same mission.',
      'Use audit when broad evidence is useful, but do not repeatedly audit the same scope.',
      'Commit only complete files to the fixed ai/* branch; never main.',
      'If more than one file is required, commit all of them to the same branch before verify.',
      'Only choose verify when you believe the code change is complete. Deterministic code, not you, decides mission completion.',
      'A commit or pull request is never proof that a fix works.',
      'Do not choose wait merely to end the turn; wait only for a real external pending state.',
    ].join(' '),
    prompt,
    maxTokens: 14000,
  }))
}

export async function processOwnerEngineeringMissionTick(input: {
  mission: EngineeringMissionRow
  maxActions?: number
  budgetMs?: number
}): Promise<EngineeringMissionRow> {
  let row = input.mission
  let state = row.state
  const started = Date.now()
  const maxActions = Math.max(1, Math.min(input.maxActions ?? 4, 8))
  const budgetMs = Math.max(10_000, Math.min(input.budgetMs ?? 220_000, 260_000))

  for (let actionNumber = 0; actionNumber < maxActions && Date.now() - started < budgetMs; actionNumber += 1) {
    if (['COMPLETED', 'BLOCKED_EXCEEDED_BUDGET', 'BLOCKED_MISSING_CREDENTIAL', 'FAILED_UNRECOVERABLE'].includes(state.stage)) break
    if (state.iteration >= state.maxIterations) {
      state = { ...state, stage: 'BLOCKED_EXCEEDED_BUDGET', blockedReason: `Exceeded ${state.maxIterations} engineering iterations without verified completion.` }
      row = await saveMission(row, state)
      break
    }

    state = { ...state, iteration: state.iteration + 1, stage: state.stage === 'QUEUED' ? 'DIAGNOSING' : state.stage }
    const action = await chooseAction({ ...row, state })
    if (!action) {
      state = appendTrace({ ...state, consecutiveFailures: state.consecutiveFailures + 1 }, { action: 'model_control', ok: false, summary: 'COS returned invalid control JSON.' })
      if (state.consecutiveFailures >= 4) state = { ...state, stage: 'FAILED_UNRECOVERABLE', blockedReason: 'COS repeatedly returned invalid mission control output.' }
      row = await saveMission(row, state)
      continue
    }

    if (action.type === 'repo_list') {
      const result = await listRepoFiles(action.prefix)
      state = appendTrace({ ...state, stage: 'DIAGNOSING' }, {
        action: 'repo_list', ok: result.ok, summary: result.ok ? `Listed ${result.files.length} repository files.` : (result.error || 'Repository list failed.'),
        output: result.ok ? result.files.join('\n') : result.error,
      })
      state.consecutiveFailures = result.ok ? 0 : state.consecutiveFailures + 1
    } else if (action.type === 'repo_read') {
      const path = String(action.path || '').trim()
      const result = await readRepoFile(path)
      state = appendTrace({
        ...state,
        stage: 'DIAGNOSING',
        readFiles: result.ok ? [...new Set([...state.readFiles, path])] : state.readFiles,
      }, {
        action: `repo_read:${path}`,
        ok: result.ok,
        summary: result.ok ? `Read ${path}${result.truncated ? ' (truncated)' : ''}.` : (result.error || 'Repository read failed.'),
        output: result.ok ? result.content : result.error,
      })
      state.consecutiveFailures = result.ok ? 0 : state.consecutiveFailures + 1
    } else if (action.type === 'audit') {
      const prefix = typeof action.prefix === 'string' ? action.prefix : ''
      const audit = await runAudit({ prefix, maxFiles: Math.max(1, Math.min(Number(action.maxFiles) || 6, 12)), lang: 'en' })
      const summary = audit.ok
        ? `Audit scanned ${audit.filesScanned.length} files and found ${audit.findings.length} findings.`
        : (audit.error || 'Audit failed.')
      const output = audit.ok
        ? [summary, ...audit.findings.slice(0, 30).map(f => `[${f.severity}] ${f.file}${f.line ? ':' + f.line : ''} — ${f.title}: ${f.detail} Recommendation: ${f.recommendation}`)].join('\n')
        : audit.error
      state = appendTrace({ ...state, stage: 'DIAGNOSING' }, { action: `audit:${prefix || '/'}`, ok: audit.ok, summary, output })
      state.consecutiveFailures = audit.ok ? 0 : state.consecutiveFailures + 1
    } else if (action.type === 'commit') {
      const path = String(action.path || '').trim()
      const createNewFile = action.createNewFile === true
      if (!createNewFile && !state.readFiles.includes(path)) {
        state = appendTrace({ ...state, stage: 'DIAGNOSING', consecutiveFailures: state.consecutiveFailures + 1 }, {
          action: `commit:${path}`, ok: false, summary: 'Commit refused: COS must read the exact existing file before replacing it.',
        })
      } else {
        const result = await commitFileToBranch({
          branch: state.branch,
          path,
          content: String(action.content || ''),
          message: clean(action.message, 200) || `COS repair ${path}`,
          createNewFile,
        })
        state = appendTrace({ ...state, stage: result.ok ? 'PATCHING' : 'DIAGNOSING' }, {
          action: `commit:${path}`,
          ok: result.ok,
          summary: result.ok ? `Committed ${path} to ${result.branch}; PR ${result.prNumber || 'created/reused'}. Verification is still required.` : result.error,
          output: result.ok ? `commit=${result.commitSha}\nbranch=${result.branch}\npr=${result.prUrl}` : result.error,
        })
        if (result.ok) {
          state = {
            ...state,
            consecutiveFailures: 0,
            lastCommit: { sha: result.commitSha, branch: result.branch, path: result.path, prUrl: result.prUrl, prNumber: result.prNumber },
            checkpoints: {
              patch_created: true,
              pr_created: Boolean(result.prUrl || result.prNumber),
              typecheck_passed: false,
              unit_tests_passed: false,
              production_build_passed: false,
              i18n_validation_passed: false,
              deployment_check_passed: false,
            },
          }
        } else {
          state.consecutiveFailures += 1
        }
      }
    } else if (action.type === 'verify') {
      if (!state.lastCommit?.sha) {
        state = appendTrace({ ...state, stage: 'DIAGNOSING', consecutiveFailures: state.consecutiveFailures + 1 }, {
          action: 'verify', ok: false, summary: 'Verification refused: no successful mission commit exists yet.',
        })
      } else {
        const verified = await verifyEngineeringCommit(state.lastCommit.sha)
        state = appendTrace({
          ...state,
          stage: 'VERIFYING',
          checkpoints: { ...state.checkpoints, ...verified.checkpoints },
        }, {
          action: 'verify',
          ok: verified.state === 'success',
          summary: verified.summary,
          output: verified.evidence,
        })

        const hardGatesPassed = [
          state.checkpoints.pr_created,
          verified.checkpoints.typecheck_passed,
          verified.checkpoints.unit_tests_passed,
          verified.checkpoints.production_build_passed,
          verified.checkpoints.i18n_validation_passed,
          verified.checkpoints.deployment_check_passed,
        ].every(Boolean)

        if (verified.state === 'success' && hardGatesPassed) {
          const now = new Date().toISOString()
          state = {
            ...state,
            stage: 'COMPLETED',
            consecutiveFailures: 0,
            checkpoints: { ...state.checkpoints, ...verified.checkpoints, ci_verified: true },
            completedAt: now,
            updatedAt: now,
          }
        } else if (verified.state === 'failure') {
          state = {
            ...state,
            stage: 'DIAGNOSING',
            consecutiveFailures: 0,
            checkpoints: { ...state.checkpoints, ...verified.checkpoints, ci_verified: false },
          }
        } else if (verified.state === 'error' && /token is not configured/i.test(verified.summary)) {
          state = { ...state, stage: 'BLOCKED_MISSING_CREDENTIAL', blockedReason: verified.summary }
        } else {
          // Pending/missing checks are an external state, not mission completion and not
          // an engineering failure. Persist VERIFYING and let the next cron tick re-check.
          row = await saveMission(row, state)
          break
        }
      }
    } else if (action.type === 'wait') {
      state = appendTrace({ ...state, stage: state.lastCommit ? 'VERIFYING' : 'DIAGNOSING' }, {
        action: 'wait', ok: true, summary: clean(action.reason, 1000) || 'Waiting for external dependency.',
      })
      row = await saveMission(row, state)
      break
    }

    if (state.consecutiveFailures >= 5 && !['COMPLETED', 'BLOCKED_MISSING_CREDENTIAL'].includes(state.stage)) {
      state = { ...state, stage: 'FAILED_UNRECOVERABLE', blockedReason: 'Five consecutive grounded engineering actions failed.' }
    }
    row = await saveMission(row, state)
    state = row.state
  }

  return row
}

export function engineeringMissionQueuedReply(mission: EngineeringMissionRow): string {
  return `COS engineering mission ${mission.id} started. I will keep investigating, patching, and verifying this automatically across background ticks until the fix is verifiably complete or a real governance/credential/budget block is reached. You do not need to say “continue”. No production change is made directly: code changes go to ${mission.state.branch} and a pull request for review.`
}
