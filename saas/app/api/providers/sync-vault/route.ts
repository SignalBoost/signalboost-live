// saas/app/api/providers/sync-vault/route.ts
// Protected Vercel → Vault sync route.
//
// GET is a safe handshake so the route no longer 404s.
// POST performs the sync only when called by an owner/admin session or by an
// internal setup token. Raw secrets are never returned in the response.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'
import { vaultEncrypt } from '@/lib/vault/crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type SyncResult = {
  key: string
  status: 'stored' | 'updated' | 'skipped' | 'error'
  reason?: string
  last4?: string
}

const VAULT_OWNER = '00000000-0000-0000-0000-000000000000'
const VAULT_PROVIDER = 'Vercel Environment'

const DEFAULT_ALLOWED_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VERCEL_TOKEN',
  'VERCEL_AUTH_TOKEN',
  'VERCEL_PROJECT_ID',
  'VERCEL_HUB_PROJECT',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'GITHUB_WRITE_TOKEN',
  'ELEVENLABS_API_KEY',
  'ASSEMBLYAI_API_KEY',
  'YOUTUBE_API_KEY',
  'VAULT_MASTER_KEY',
  'AUDIT_SECRET',
] as const

function mask(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return '••••'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

function configured(name: string): boolean {
  const value = process.env[name]
  return Boolean(value && value.trim())
}

function getVercelToken(): string {
  return process.env.VERCEL_AUTH_TOKEN || process.env.VERCEL_TOKEN || ''
}

function getVercelProjectId(): string {
  return process.env.VERCEL_PROJECT_ID || process.env.VERCEL_HUB_PROJECT || ''
}

function withTeam(url: string): string {
  const teamId = process.env.VERCEL_TEAM_ID
  if (!teamId) return url
  return url + (url.includes('?') ? '&' : '?') + 'teamId=' + encodeURIComponent(teamId)
}

async function hasAdminSession(): Promise<boolean> {
  try {
    const access = await getAccess()
    return Boolean(access.isAdmin)
  } catch {
    return false
  }
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const setupToken = process.env.SETUP_SYNC_TOKEN
  const headerToken = req.headers.get('x-setup-token') || ''
  if (setupToken && headerToken && setupToken === headerToken) return true
  return await hasAdminSession()
}

function requestedKeys(body: any): string[] {
  const raw = Array.isArray(body?.keys) ? body.keys : DEFAULT_ALLOWED_KEYS
  const deduped = new Set<string>()
  for (const item of raw) {
    const key = String(item || '').trim()
    if (!key) continue
    if (!DEFAULT_ALLOWED_KEYS.includes(key as any)) continue
    deduped.add(key)
  }
  return Array.from(deduped)
}

function extractEnvValue(env: any): string {
  // Vercel has used different shapes over time. With decrypt=true, decrypted
  // values commonly appear in value, decryptedValue, or plainValue. We support
  // those shapes but never echo the returned secret back to the caller.
  const candidates = [env?.value, env?.decryptedValue, env?.plainValue]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate
  }
  return ''
}

async function fetchVercelEnv(): Promise<{ ok: boolean; envs?: any[]; error?: string }> {
  const token = getVercelToken()
  const projectId = getVercelProjectId()
  if (!token) return { ok: false, error: 'Missing VERCEL_AUTH_TOKEN or VERCEL_TOKEN.' }
  if (!projectId) return { ok: false, error: 'Missing VERCEL_PROJECT_ID or VERCEL_HUB_PROJECT.' }

  const url = withTeam(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env?decrypt=true`)
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, error: `Vercel env fetch failed: HTTP ${res.status}${text ? ` — ${text.slice(0, 240)}` : ''}` }
  }
  const data = await res.json().catch(() => ({}))
  const envs = Array.isArray(data?.envs) ? data.envs : (Array.isArray(data) ? data : [])
  return { ok: true, envs }
}

async function upsertVaultItem(admin: any, key: string, value: string): Promise<SyncResult> {
  const enc = vaultEncrypt(value)
  if (!enc.ok || !enc.valueEncrypted || !enc.iv || !enc.tag) {
    return { key, status: 'error', reason: enc.error || 'Encryption failed' }
  }

  const existing = await admin
    .from('vault_items')
    .select('id')
    .eq('provider', VAULT_PROVIDER)
    .eq('label', key)
    .maybeSingle()

  if (existing.error && existing.error.code !== 'PGRST116') {
    return { key, status: 'error', reason: existing.error.message }
  }

  if (existing.data?.id) {
    const updated = await admin
      .from('vault_items')
      .update({
        value_encrypted: enc.valueEncrypted,
        iv: enc.iv,
        tag: enc.tag,
        last4: value.slice(-4),
        status: 'active',
        last_accessed_at: new Date().toISOString(),
      })
      .eq('id', existing.data.id)
    if (updated.error) return { key, status: 'error', reason: updated.error.message }
    await admin.from('vault_audit').insert({ actor: 'sync-vault', action: 'update', provider: VAULT_PROVIDER, label: key }).then(() => {}, () => {})
    return { key, status: 'updated', last4: mask(value) }
  }

  const inserted = await admin
    .from('vault_items')
    .insert({
      owner_id: VAULT_OWNER,
      provider: VAULT_PROVIDER,
      label: key,
      value_encrypted: enc.valueEncrypted,
      iv: enc.iv,
      tag: enc.tag,
      last4: value.slice(-4),
      expires_at: null,
      status: 'active',
    })
  if (inserted.error) return { key, status: 'error', reason: inserted.error.message }
  await admin.from('vault_audit').insert({ actor: 'sync-vault', action: 'add', provider: VAULT_PROVIDER, label: key }).then(() => {}, () => {})
  return { key, status: 'stored', last4: mask(value) }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/providers/sync-vault',
    methods: ['GET', 'POST'],
    mode: 'protected',
    rawSecretsReturned: false,
    postAuthorization: ['owner/admin session', 'x-setup-token matching SETUP_SYNC_TOKEN'],
    configured: {
      vercelToken: configured('VERCEL_AUTH_TOKEN') || configured('VERCEL_TOKEN'),
      vercelProject: configured('VERCEL_PROJECT_ID') || configured('VERCEL_HUB_PROJECT'),
      supabaseAdmin: configured('NEXT_PUBLIC_SUPABASE_URL') && configured('SUPABASE_SERVICE_ROLE_KEY'),
      vaultMasterKey: configured('VAULT_MASTER_KEY'),
      setupSyncToken: configured('SETUP_SYNC_TOKEN'),
    },
    note: 'GET is a handshake only. POST runs sync and never returns raw secret values.',
  })
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!sbUrl || !sbKey) {
    return NextResponse.json({ ok: false, error: 'Supabase admin not configured.' }, { status: 500 })
  }
  if (!process.env.VAULT_MASTER_KEY) {
    return NextResponse.json({ ok: false, error: 'VAULT_MASTER_KEY not configured.' }, { status: 500 })
  }

  let body: any = {}
  try { body = await req.json() } catch { body = {} }
  const keys = requestedKeys(body)
  if (keys.length === 0) {
    return NextResponse.json({ ok: false, error: 'No allowed keys requested.' }, { status: 400 })
  }

  const fetched = await fetchVercelEnv()
  if (!fetched.ok || !fetched.envs) {
    return NextResponse.json({ ok: false, error: fetched.error || 'Unable to fetch Vercel env.' }, { status: 502 })
  }

  const byKey = new Map<string, any>()
  for (const env of fetched.envs) {
    const key = String(env?.key || '')
    if (!byKey.has(key)) byKey.set(key, env)
  }

  const admin = createClient(sbUrl, sbKey)
  const results: SyncResult[] = []

  for (const key of keys) {
    const env = byKey.get(key)
    if (!env) {
      results.push({ key, status: 'skipped', reason: 'Not present in Vercel env list.' })
      continue
    }
    const value = extractEnvValue(env)
    if (!value) {
      results.push({ key, status: 'skipped', reason: 'Vercel did not return a decrypted value for this key.' })
      continue
    }
    results.push(await upsertVaultItem(admin, key, value))
  }

  const stored = results.filter(r => r.status === 'stored').length
  const updated = results.filter(r => r.status === 'updated').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const errors = results.filter(r => r.status === 'error').length

  return NextResponse.json({
    ok: errors === 0,
    rawSecretsReturned: false,
    summary: { requested: keys.length, stored, updated, skipped, errors },
    results,
  }, { status: errors === 0 ? 200 : 207 })
}
