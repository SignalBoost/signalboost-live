import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TOKEN = 'iJirzAuGa1k6jjSjmqogKSe8XT0bEguUPTvr1HV4xOc'
const EXPIRES_AT = Date.parse('2026-08-13T05:30:00Z')
const TARGET_MODEL = 'qwen3:30b'

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
    body: JSON.stringify({ model: TARGET_MODEL, stream: false }),
    cache: 'no-store',
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`RunPod model pull failed: HTTP ${response.status} ${text.slice(0, 1000)}`)
  return { ok: true, response: text.slice(0, 1000) }
}

async function testGemini() {
  const key = String(process.env.GEMINI_API_KEY || '').trim()
  if (!key) return { configured: false, healthy: false, error: 'GEMINI_API_KEY is not configured.' }
  const model = process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3.6-flash'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: COS_GEMINI_OK' }] }], generationConfig: { maxOutputTokens: 32 } }),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => null) as any
  if (!response.ok) return { configured: true, healthy: false, model, error: JSON.stringify(payload).slice(0, 1000) }
  const text = Array.isArray(payload?.candidates?.[0]?.content?.parts) ? payload.candidates[0].content.parts.map((part:any)=>String(part?.text||'')).join('').trim() : ''
  return { configured: true, healthy: text.includes('COS_GEMINI_OK'), model, response: text.slice(0, 200) }
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
    return NextResponse.json({ ok: false, error: 'phase must be status, prepare, or cutover' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
