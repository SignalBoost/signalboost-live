import { NextRequest, NextResponse } from 'next/server'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswer'
import { recordTeacherEscalation } from '@/lib/ai/cos/teacherLearning'
import { assessAnswerSpecificity } from '@/lib/ai/cos/answerSpecificity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TOKEN = 'iJirzAuGa1k6jjSjmqogKSe8XT0bEguUPTvr1HV4xOc'
const EXPIRES_AT = Date.parse('2026-08-13T05:30:00Z')
const TARGET_MODEL = 'qwen3:30b'
const BENCHMARK = 'A multi-tenant SaaS suddenly shows normal database CPU and memory, but API p95 latency triples only for enterprise tenants. Smaller tenants remain unaffected. No deployment occurred and overall traffic is unchanged. Diagnose the most likely architectural causes, rank them, and explain how you would distinguish between them without making production changes.'

function authorized(req: NextRequest): boolean {
  return Date.now() < EXPIRES_AT && req.nextUrl.searchParams.get('token') === TOKEN
}

function localConfig() {
  const base = String(process.env.LOCAL_AI_BASE_URL || '').replace(/\/$/, '')
  const key = String(process.env.LOCAL_AI_API_KEY || '').trim()
  if (!base || !key) throw new Error('LOCAL_AI_BASE_URL / LOCAL_AI_API_KEY are not configured.')
  const url = new URL(base)
  url.pathname = url.pathname.replace(/\/v1\/?$/, '') || '/'
  return { base, root: url.toString().replace(/\/$/, ''), key }
}

function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, 'x-api-key': key }
}

async function models() {
  const { base, key } = localConfig()
  const response = await fetch(`${base}/models`, { headers: authHeaders(key), cache: 'no-store' })
  if (!response.ok) throw new Error(`RunPod models check failed: HTTP ${response.status} ${await response.text()}`)
  const payload = await response.json() as { data?: Array<{ id?: string }> }
  const ids = (payload.data || []).map(item => String(item.id || '')).filter(Boolean)
  return { ids, targetPresent: ids.includes(TARGET_MODEL), currentConfigured: process.env.LOCAL_AI_MODEL || null }
}

async function pullTarget() {
  const { root, key } = localConfig()
  const response = await fetch(`${root}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(key) },
    body: JSON.stringify({ model: TARGET_MODEL, stream: true }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`RunPod model pull failed: HTTP ${response.status} ${(await response.text()).slice(0, 1000)}`)
  if (!response.body) throw new Error('RunPod model pull returned no progress stream.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lastStatus = ''
  let completed = false
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line) as { status?: string; error?: string }
        if (event.error) throw new Error(event.error)
        if (event.status) lastStatus = event.status
        if (event.status === 'success') completed = true
      } catch (error) {
        if (error instanceof SyntaxError) continue
        throw error
      }
    }
  }
  return { ok: completed, lastStatus: lastStatus || null }
}

async function geminiAnswer(prompt: string, maxOutputTokens = 2500) {
  const key = String(process.env.GEMINI_API_KEY || '').trim()
  if (!key) throw new Error('GEMINI_API_KEY is not configured.')
  const model = process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3.6-flash'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'You are the teacher for a local enterprise reasoning system. Give a mechanism-level senior-practitioner answer. Rank causes by fit to the stated evidence. For each cause name concrete read-only observables and a falsifier. Do not invent telemetry and do not make production changes.' }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens },
    }),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => null) as any
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 1500)}`)
  const parts = payload?.candidates?.[0]?.content?.parts
  const text = Array.isArray(parts) ? parts.map((part:any)=>typeof part?.text === 'string' ? part.text : '').join('').trim() : ''
  if (!text) throw new Error(`Gemini returned no visible answer: ${JSON.stringify(payload).slice(0, 1500)}`)
  return { text, model }
}

async function testGemini() {
  try {
    const result = await geminiAnswer('Reply with exactly: COS_GEMINI_OK', 512)
    return { configured: true, healthy: result.text.includes('COS_GEMINI_OK'), model: result.model, response: result.text.slice(0, 200) }
  } catch (error) {
    return { configured: Boolean(process.env.GEMINI_API_KEY?.trim()), healthy: false, model: process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3.6-flash', error: error instanceof Error ? error.message : String(error) }
  }
}

async function runTeacherBenchmark() {
  const local = await tryCOSFirstAnswer({ prompt: BENCHMARK, language: 'English', userId: null, privileged: true })
  const teacher = await geminiAnswer(BENCHMARK, 3000)
  const localAnswer = local.handled ? local.reply : ('bestEffortReply' in local ? local.bestEffortReply || null : null)
  const localReason = local.handled ? null : local.reason
  const assessment = assessAnswerSpecificity(teacher.text)
  await recordTeacherEscalation({
    prompt: BENCHMARK,
    localAnswer,
    localConfidence: local.confidence,
    escalationReason: localReason,
    teacherAnswer: teacher.text,
    teacherProvider: 'gemini',
    teacherModel: teacher.model,
    metadata: {
      oneShotTeacherBenchmark: true,
      teacherSpecificityScore: assessment.score,
      teacherSpecificityCap: assessment.cap,
      teacherMechanisms: assessment.signals.diagnosticMechanisms,
    },
  })
  return {
    local: { handled: local.handled, confidence: local.confidence, reason: local.handled ? null : local.reason, answer: localAnswer },
    teacher: { provider: 'gemini', model: teacher.model, answer: teacher.text, specificity: assessment },
  }
}

async function setProductionModel() {
  const token = String(process.env.VERCEL_TOKEN || '').trim()
  const projectId = String(process.env.VERCEL_PROJECT_ID || 'prj_QElaxvA1fbFjhVraIzamxRha78Du').trim()
  if (!token) throw new Error('VERCEL_TOKEN is not configured; cannot change LOCAL_AI_MODEL automatically.')
  const response = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env?upsert=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'LOCAL_AI_MODEL', value: TARGET_MODEL, type: 'plain', target: ['production'] }),
    cache: 'no-store',
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Vercel LOCAL_AI_MODEL update failed: HTTP ${response.status} ${text.slice(0, 1000)}`)
  return { ok: true, projectId, model: TARGET_MODEL }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'gone' }, { status: 410 })
  try {
    const phase = req.nextUrl.searchParams.get('phase') || 'status'
    if (phase === 'status') return NextResponse.json({ ok: true, phase, models: await models(), gemini: await testGemini(), expiresAt: new Date(EXPIRES_AT).toISOString() })
    if (phase === 'benchmark') return NextResponse.json({ ok: true, phase, result: await runTeacherBenchmark() })
    if (phase === 'prepare') {
      const before = await models()
      const pull = before.targetPresent ? { ok: true, skipped: true } : await pullTarget()
      const after = await models()
      const gemini = await testGemini()
      return NextResponse.json({ ok: after.targetPresent, phase, before, pull, after, gemini })
    }
    if (phase === 'cutover') {
      const state = await models()
      if (!state.targetPresent) return NextResponse.json({ ok: false, error: `${TARGET_MODEL} is not present; run phase=prepare first.` }, { status: 409 })
      const vercel = await setProductionModel()
      return NextResponse.json({ ok: true, phase, models: state, vercel, note: 'A new production deployment is required before the changed environment variable is active.' })
    }
    return NextResponse.json({ ok: false, error: 'phase must be status, benchmark, prepare, or cutover' }, { status: 400 })
  } catch (error) {
    console.error('[cos-reasoner-upgrade]', error)
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
