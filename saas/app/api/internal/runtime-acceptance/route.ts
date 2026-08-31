import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isConciergeBuilderObjective } from '@/lib/ai/cos/cosReasoningRolePolicy'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CANONICAL_PRODUCTION_HOST = 'saas.signalboostapp.com'
const ACCEPTANCE_TOKEN_SHA256 = 'a332d4633ee701640ee25e690900d70d92ad0a778bf74e622c4d0ae1bed5a35a'
const ACCEPTANCE_EXPIRES_AT_MS = Date.parse('2026-09-01T04:00:00.000Z')
const DEBUG_OBJECTIVE = [
  'Debug the attached file in Builder.',
  'Do not use Knowledge Graph or live search.',
  'List files, read that file, run it with node.',
  'Show exit code and stderr.',
  'If it fails, one edit_file and the same run.',
  'Stop when the command passes.',
].join('\n')
const BROKEN_SOURCE = 'const answer = 6 * 7\nconsole.log(result)\n'
const PAY_GAP_PROMPT = 'does a pay gap exist?'

type AcceptanceMode = 'builder' | 'visual'
type JsonRecord = Record<string, unknown>
type AcceptanceCheck = Readonly<{ id: string; passed: boolean; detail: string }>
type HttpJson = Readonly<{ status: number; data: JsonRecord; raw: string; headers: Headers }>

function noStore(payload: unknown, status = 200): NextResponse {
  const response = NextResponse.json(payload, { status })
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  return response
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function safeText(value: unknown, maximum = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum)
}

function tokenIsValid(request: NextRequest): boolean {
  if (process.env.VERCEL_ENV !== 'production') return false
  if (request.nextUrl.hostname !== CANONICAL_PRODUCTION_HOST) return false
  if (Date.now() > ACCEPTANCE_EXPIRES_AT_MS) return false
  const provided = request.nextUrl.searchParams.get('token') || ''
  const expected = Buffer.from(ACCEPTANCE_TOKEN_SHA256, 'hex')
  const actual = createHash('sha256').update(provided).digest()
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function requiredCheck(checks: AcceptanceCheck[], id: string, passed: boolean, detail: string): void {
  checks.push(Object.freeze({ id, passed, detail: safeText(detail, 1_000) }))
  if (!passed) throw new Error(`acceptance_failed:${id}`)
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()]
    .filter(([, value]) => Boolean(value))
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

async function httpJson(origin: string, path: string, cookies: string, init: RequestInit = {}): Promise<HttpJson> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  if (cookies) headers.set('cookie', cookies)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    redirect: 'manual',
  })
  const raw = await response.text()
  let data: JsonRecord = {}
  try { data = asRecord(JSON.parse(raw)) } catch {}
  return Object.freeze({ status: response.status, data, raw, headers: response.headers })
}

async function httpBytes(origin: string, path: string, cookies: string): Promise<Readonly<{
  status: number
  contentType: string
  contentDisposition: string
  bytes: number
}>> {
  const response = await fetch(`${origin}${path}`, {
    method: 'GET',
    headers: cookies ? { cookie: cookies } : {},
    cache: 'no-store',
    redirect: 'manual',
  })
  const bytes = (await response.arrayBuffer()).byteLength
  return Object.freeze({
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    contentDisposition: response.headers.get('content-disposition') || '',
    bytes,
  })
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function countRows(admin: ReturnType<typeof createClient>, table: string, userId: string): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error) throw new Error(`acceptance_count_failed:${table}:${error.message}`)
  return count ?? 0
}

async function pollHistory(origin: string, cookies: string, conversationId: string, terminal: boolean): Promise<HttpJson | null> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const history = await httpJson(origin, `/api/assistant/chats?id=${encodeURIComponent(conversationId)}`, cookies)
    const messages = Array.isArray(history.data.messages) ? history.data.messages.map(asRecord) : []
    const assistant = messages.find(message => message.role === 'assistant')
    const provenance = asRecord(assistant?.provenance)
    const status = String(provenance.status || '')
    if (history.status === 200 && assistant && (terminal ? ['succeeded', 'failed'].includes(status) : status === 'running')) {
      return history
    }
    await wait(500)
  }
  return null
}

async function pollBuilder(origin: string, cookies: string, jobId: string): Promise<HttpJson | null> {
  for (let attempt = 0; attempt < 140; attempt += 1) {
    const response = await httpJson(origin, `/api/builder?jobId=${encodeURIComponent(jobId)}`, cookies, { method: 'GET' })
    const status = String(response.data.status || '')
    if (response.status !== 202 && ['succeeded', 'failed'].includes(status)) return response
    await wait(1_500)
  }
  return null
}

function historyMessages(history: HttpJson): JsonRecord[] {
  return Array.isArray(history.data.messages) ? history.data.messages.map(asRecord) : []
}

async function runBuilderAcceptance(input: {
  origin: string
  cookies: string
  admin: ReturnType<typeof createClient>
  userId: string
  checks: AcceptanceCheck[]
}): Promise<JsonRecord> {
  const { origin, cookies, admin, userId, checks } = input
  const historyList = await httpJson(origin, '/api/assistant/chats', cookies, { method: 'GET' })
  requiredCheck(checks, 'history-list-200', historyList.status === 200 && Array.isArray(historyList.data.conversations), `status=${historyList.status}`)

  const conversationId = randomUUID()
  const jobsBefore = await countRows(admin, 'builder_jobs', userId)
  const accepted = await httpJson(origin, '/api/builder', cookies, {
    method: 'POST',
    body: JSON.stringify({
      objective: DEBUG_OBJECTIVE,
      conversationId,
      files: [{ path: 'broken.js', content: BROKEN_SOURCE }],
    }),
  })
  const jobId = typeof accepted.data.jobId === 'string' ? accepted.data.jobId : ''
  const workspaceId = typeof accepted.data.workspaceId === 'string' ? accepted.data.workspaceId : ''
  requiredCheck(checks, 'builder-post-202', accepted.status === 202 && Boolean(jobId) && Boolean(workspaceId), `status=${accepted.status} error=${safeText(accepted.data.error)}`)

  const runningHistory = await pollHistory(origin, cookies, conversationId, false)
  requiredCheck(checks, 'history-running-after-202', Boolean(runningHistory), 'one POST returned; independent History GET found the durable running turn')
  const runningMessages = historyMessages(runningHistory!)
  const runningUser = runningMessages.find(message => message.role === 'user') || {}
  const runningAssistant = runningMessages.find(message => message.role === 'assistant') || {}
  const userOrder = Number(runningUser.message_order)
  const assistantOrder = Number(runningAssistant.message_order)
  requiredCheck(
    checks,
    'history-user-before-assistant',
    Number.isFinite(userOrder) && Number.isFinite(assistantOrder) && userOrder < assistantOrder,
    `userOrder=${userOrder} assistantOrder=${assistantOrder}`,
  )

  // The simulated page is now gone. No second POST is sent; only authenticated, read-only GET
  // polling and History reads are used to observe the background job.
  const terminal = await pollBuilder(origin, cookies, jobId)
  requiredCheck(checks, 'builder-terminal-without-replay', Boolean(terminal), 'exactly one Builder POST; terminal state observed through GET polling')
  const terminalStatus = String(terminal!.data.status || '')
  requiredCheck(checks, 'builder-succeeded', terminalStatus === 'succeeded', `status=${terminalStatus} error=${safeText(terminal!.data.error)}`)

  const trace = Array.isArray(terminal!.data.trace) ? terminal!.data.trace.map(asRecord) : []
  const runs = trace.filter(entry => entry.toolId === 'run')
  const edits = trace.filter(entry => entry.toolId === 'edit_file')
  const firstRun = runs[0] || {}
  const finalRun = runs.at(-1) || {}
  const firstExit = Number(firstRun.exitCode)
  const finalExit = Number(finalRun.exitCode)
  const firstEvidence = `${String(firstRun.stderr || '')}\n${String(firstRun.stdout || '')}`
  requiredCheck(checks, 'broken-file-stack-visible', firstExit !== 0 && /ReferenceError|result is not defined/i.test(firstEvidence), `firstExit=${firstExit} evidence=${safeText(firstEvidence)}`)
  requiredCheck(checks, 'exactly-one-edit', edits.length === 1 && edits[0]?.ok === true, `editCount=${edits.length}`)
  requiredCheck(
    checks,
    'same-command-rerun',
    runs.length >= 2 && String(firstRun.command || '') === String(finalRun.command || ''),
    `runCount=${runs.length} first=${safeText(firstRun.command)} final=${safeText(finalRun.command)}`,
  )
  requiredCheck(checks, 'verification-exit-zero', finalExit === 0, `finalExit=${finalExit}`)

  const terminalHistory = await pollHistory(origin, cookies, conversationId, true)
  requiredCheck(checks, 'history-terminal-without-send', Boolean(terminalHistory), 'the same History turn became terminal without another Send')
  const terminalMessages = historyMessages(terminalHistory!)
  const terminalAssistant = terminalMessages.find(message => message.role === 'assistant') || {}
  requiredCheck(
    checks,
    'history-row-updated-in-place',
    Boolean(runningAssistant.id) && runningAssistant.id === terminalAssistant.id,
    `runningId=${safeText(runningAssistant.id)} terminalId=${safeText(terminalAssistant.id)}`,
  )
  requiredCheck(
    checks,
    'history-shows-verification',
    /First exit code:\s*[1-9]|First exit code:\s*-\d+/i.test(String(terminalAssistant.content || ''))
      && /Verification exit code:\s*0/i.test(String(terminalAssistant.content || '')),
    safeText(terminalAssistant.content, 800),
  )

  const jobsAfterDebug = await countRows(admin, 'builder_jobs', userId)
  requiredCheck(checks, 'one-builder-job-created', jobsAfterDebug === jobsBefore + 1, `before=${jobsBefore} after=${jobsAfterDebug}`)
  requiredCheck(checks, 'pay-gap-classifier-excludes-builder', !isConciergeBuilderObjective(PAY_GAP_PROMPT), 'the production classifier returned false')

  const payGapConversation = randomUUID()
  const payGapController = new AbortController()
  const payGapDeadline = setTimeout(() => payGapController.abort(), 12_000)
  let payGapResponseSource = 'transport-aborted-after-routing-window'
  try {
    const response = await httpJson(origin, '/api/cos-browser', cookies, {
      method: 'POST',
      signal: payGapController.signal,
      body: JSON.stringify({
        messages: [{ role: 'user', content: PAY_GAP_PROMPT }],
        context: { language: 'en', currentPage: '/', conversationId: payGapConversation },
      }),
    })
    payGapResponseSource = String(response.data.source || `http-${response.status}`)
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) throw error
  } finally {
    clearTimeout(payGapDeadline)
  }
  await wait(1_500)
  const jobsAfterPayGap = await countRows(admin, 'builder_jobs', userId)
  requiredCheck(
    checks,
    'pay-gap-created-no-builder-job',
    jobsAfterPayGap === jobsAfterDebug && !/builder/i.test(payGapResponseSource),
    `before=${jobsAfterDebug} after=${jobsAfterPayGap} source=${safeText(payGapResponseSource)}`,
  )

  return {
    jobId,
    workspaceId,
    conversationId,
    firstExitCode: firstExit,
    verificationExitCode: finalExit,
    command: String(firstRun.command || ''),
    editCount: edits.length,
    payGapResponseSource,
  }
}

async function runVisualAcceptance(input: {
  origin: string
  cookies: string
  checks: AcceptanceCheck[]
}): Promise<JsonRecord> {
  const { origin, cookies, checks } = input
  const prefix = 'Create a simple visual. '
  const oversizedPrompt = prefix + 'x'.repeat(8_001 - prefix.length)
  const oversized = await httpJson(origin, '/api/visuals', cookies, {
    method: 'POST',
    body: JSON.stringify({ prompt: oversizedPrompt }),
  })
  requiredCheck(
    checks,
    'visual-oversize-precise-error',
    oversized.status === 400
      && oversized.data.error === 'visual_objective_too_large'
      && oversized.data.objective_source === 'prompt'
      && Number(oversized.data.observed_length) === 8_001,
    `status=${oversized.status} error=${safeText(oversized.data.error)} source=${safeText(oversized.data.objective_source)} length=${safeText(oversized.data.observed_length)}`,
  )
  requiredCheck(checks, 'legacy-visual-error-removed', !oversized.raw.includes('visual_invalid_objective'), safeText(oversized.raw))

  const conversationId = randomUUID()
  const generated = await httpJson(origin, '/api/cos-browser', cookies, {
    method: 'POST',
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Create a simple minimalist image of one blue circle centered on a white background.' }],
      context: { language: 'en', currentPage: '/', conversationId },
    }),
  })
  const visual = asRecord(generated.data.visual)
  const previewUrl = typeof visual.previewUrl === 'string' ? visual.previewUrl : ''
  const downloadUrl = typeof visual.downloadUrl === 'string' ? visual.downloadUrl : ''
  requiredCheck(
    checks,
    'visual-concierge-success',
    generated.status === 200 && Boolean(previewUrl) && Boolean(downloadUrl) && typeof generated.data.workspaceId === 'string',
    `status=${generated.status} error=${safeText(generated.data.error)} source=${safeText(generated.data.source)}`,
  )

  const preview = await httpBytes(origin, previewUrl, cookies)
  requiredCheck(
    checks,
    'visual-inline-preview-loads',
    preview.status === 200 && preview.contentType.startsWith('image/') && preview.bytes > 1_000,
    `status=${preview.status} type=${preview.contentType} bytes=${preview.bytes}`,
  )
  const download = await httpBytes(origin, downloadUrl, cookies)
  requiredCheck(
    checks,
    'visual-download-loads',
    download.status === 200 && download.contentType.startsWith('image/') && download.bytes === preview.bytes,
    `status=${download.status} type=${download.contentType} bytes=${download.bytes} disposition=${safeText(download.contentDisposition)}`,
  )

  return {
    conversationId,
    workspaceId: generated.data.workspaceId,
    previewUrl,
    downloadUrl,
    previewBytes: preview.bytes,
  }
}

export async function GET(request: NextRequest) {
  if (!tokenIsValid(request)) return noStore({ error: 'Not found' }, 404)
  const mode = request.nextUrl.searchParams.get('mode')
  if (mode !== 'builder' && mode !== 'visual') {
    return noStore({ error: 'mode must be builder or visual' }, 400)
  }

  const checks: AcceptanceCheck[] = []
  const startedAt = new Date().toISOString()
  const origin = `https://${CANONICAL_PRODUCTION_HOST}`
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !anonKey || !serviceKey) return noStore({ error: 'acceptance_environment_unavailable' }, 503)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const jar = new Map<string, string>()
  const browserSession = createServerClient(supabaseUrl, anonKey, {
    cookieOptions: saasSupabaseCookieOptions,
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: cookiesToSet => {
        for (const { name, value } of cookiesToSet) {
          if (value) jar.set(name, value)
          else jar.delete(name)
        }
      },
    },
  })

  let userId = ''
  let result: JsonRecord = {}
  let failure = ''
  let cleanupPassed = false
  try {
    const suffix = randomUUID()
    const email = `runtime-acceptance-${suffix}@example.com`
    const password = `${randomUUID()}-${randomUUID()}`
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { purpose: 'signalboost-runtime-acceptance', mode },
    })
    if (created.error || !created.data.user?.id) throw new Error(`acceptance_user_create_failed:${created.error?.message || 'missing_user'}`)
    userId = created.data.user.id

    const signedIn = await browserSession.auth.signInWithPassword({ email, password })
    if (signedIn.error || !signedIn.data.user?.id) throw new Error(`acceptance_sign_in_failed:${signedIn.error?.message || 'missing_user'}`)
    const cookies = cookieHeader(jar)
    requiredCheck(checks, 'temporary-authenticated-session', Boolean(cookies), 'Supabase SSR cookies were issued for the temporary user')

    result = mode === 'builder'
      ? await runBuilderAcceptance({ origin, cookies, admin, userId, checks })
      : await runVisualAcceptance({ origin, cookies, checks })
  } catch (error) {
    failure = error instanceof Error ? error.message : 'runtime_acceptance_failed'
  } finally {
    if (userId) {
      const deleted = await admin.auth.admin.deleteUser(userId).catch(error => ({ error }))
      if (!(deleted as { error?: unknown }).error) {
        await wait(300)
        const [jobs, conversations, workspaces] = await Promise.all([
          countRows(admin, 'builder_jobs', userId).catch(() => -1),
          countRows(admin, 'assistant_conversations', userId).catch(() => -1),
          countRows(admin, 'builder_workspaces', userId).catch(() => -1),
        ])
        cleanupPassed = jobs === 0 && conversations === 0 && workspaces === 0
        checks.push(Object.freeze({
          id: 'temporary-user-and-data-cleaned',
          passed: cleanupPassed,
          detail: `jobs=${jobs} conversations=${conversations} workspaces=${workspaces}`,
        }))
      } else {
        checks.push(Object.freeze({ id: 'temporary-user-and-data-cleaned', passed: false, detail: 'temporary auth user deletion failed' }))
      }
    }
  }

  const passed = !failure && cleanupPassed && checks.length > 0 && checks.every(check => check.passed)
  return noStore({
    ok: true,
    schema: 'signalboost-runtime-acceptance-v1',
    mode: mode as AcceptanceMode,
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    startedAt,
    completedAt: new Date().toISOString(),
    passed,
    checks,
    result,
    ...(failure ? { failure: safeText(failure, 1_000) } : {}),
  }, passed ? 200 : 409)
}
