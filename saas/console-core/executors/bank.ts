// saas/console-core/executors/bank.ts
//
// Bank provider executor for the portable Hub Console engine. Banks are treated
// exactly like any other provider: each action is a registered executor, gated by
// a policyActionId (see lib/hub/action-policy.ts) and audited.
//
// Security model:
//   • Auth: Email OTP → OAuth2 token exchange. The console NEVER stores banking
//     credentials. It stores ONLY the resulting token bundle, AES-256-GCM
//     encrypted, in the Key Vault (vault_items, provider = `bank:<institution>`).
//   • Tokens auto-refresh server-side (refresh_token grant) before any call that
//     finds the access token within the expiry skew window.
//   • Compliance + audit: EVERY bank action (success or failure) writes a row to
//     bank_compliance_log. Account numbers and tokens are never logged in clear —
//     only masked references. This is independent of the engine's generic logger.
//
// Placeholders: connector key/secret/base-URL come from env (see bank-registry.ts).
// Until an aggregator app is registered the executor returns a clean
// "not configured — register <VAR>" message and never fabricates data.

import { createClient } from '@supabase/supabase-js'
import { registerExecutor } from '../defaultHost'
import type { ActionField, ActionSchema } from '../types'
import { vaultEncrypt, vaultDecrypt } from '@/lib/vault/crypto'
import {
  getBankConnector,
  bankInstitutionOptions,
  bankCredentials,
  bankBaseUrl,
  bankEndpoint,
  type BankConnector,
} from '@/lib/hub/bank-registry'

type Result = { ok: boolean; message?: string; data?: unknown; error?: string }
type Ctx = { user: { id: string; email?: string; roles?: string[] } | null; providerId: string; actionId: string }

// Refresh the access token when it expires within this window (seconds).
const REFRESH_SKEW_SECONDS = 120
const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

// ---- shared field definitions (engine-side validation schema) ----
const INSTITUTION: ActionField = {
  id: 'institution', label: 'Institution', type: 'select', required: true,
  options: bankInstitutionOptions(),
}
const ACCOUNT: ActionField = {
  id: 'accountId', label: 'Account', type: 'remote_select', required: true,
  remoteSource: { action: 'bank.list_accounts', dataPath: 'accounts', valueKey: 'id', labelTemplate: '{label}', dependsOn: ['institution'], emptyHint: 'Connect the institution first' },
}
const schema = (id: string, label: string, verb: string, fields: ActionField[]): ActionSchema => ({ id, label, verb, fields })

// ---- admin Supabase client (service role) for vault + compliance log ----
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function mask(ref: string): string {
  const s = String(ref || '')
  if (s.length <= 4) return '••••'
  return '••••' + s.slice(-4)
}

// ---- compliance / audit (banking-grade, every action) ----
async function logCompliance(entry: {
  ctx: Ctx
  institution: string
  action: string
  status: 'success' | 'error' | 'denied'
  accountRef?: string
  amountCents?: number
  currency?: string
  requestId?: string
  detail?: string
}): Promise<void> {
  const db = admin()
  if (!db) return
  try {
    await db.from('bank_compliance_log').insert({
      actor_id: entry.ctx.user?.id || null,
      actor_email: entry.ctx.user?.email || null,
      institution: entry.institution || null,
      action: entry.action,
      status: entry.status,
      account_ref: entry.accountRef ? mask(entry.accountRef) : null,
      amount_cents: typeof entry.amountCents === 'number' ? entry.amountCents : null,
      currency: entry.currency || null,
      request_id: entry.requestId || null,
      detail: entry.detail ? String(entry.detail).slice(0, 500) : null,
    })
  } catch {
    // compliance logging must never throw the action — but a missing row is itself
    // a signal; the table is created by the bank_compliance_log migration.
  }
}

// ============================================================================
// Encrypted token vault (reuses vault_items + AES-256-GCM crypto)
// ============================================================================

type TokenBundle = {
  access_token: string
  refresh_token?: string
  token_type?: string
  scope?: string
  expires_at: number // unix seconds
  obtained_at: number
}

function vaultProviderKey(institution: string): string {
  return `bank:${institution}`
}

async function loadTokenRow(institution: string) {
  const db = admin()
  if (!db) return { ok: false as const, error: 'Token vault not configured (Supabase service role missing)' }
  const { data, error } = await db
    .from('vault_items')
    .select('id, value_encrypted, iv, tag, expires_at, status')
    .eq('provider', vaultProviderKey(institution))
    .eq('label', 'oauth_token')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false as const, error: error.message }
  if (!data) return { ok: false as const, notConnected: true }
  return { ok: true as const, row: data }
}

async function readToken(institution: string): Promise<{ ok: boolean; bundle?: TokenBundle; notConnected?: boolean; error?: string }> {
  const r = await loadTokenRow(institution)
  if (!r.ok) return { ok: false, notConnected: (r as any).notConnected, error: r.error }
  const dec = vaultDecrypt(r.row.value_encrypted, r.row.iv, r.row.tag)
  if (!dec.ok || !dec.value) return { ok: false, error: dec.error || 'Token decryption failed' }
  try {
    return { ok: true, bundle: JSON.parse(dec.value) as TokenBundle }
  } catch {
    return { ok: false, error: 'Stored token is corrupted' }
  }
}

async function writeToken(institution: string, ctx: Ctx, bundle: TokenBundle): Promise<{ ok: boolean; error?: string }> {
  const db = admin()
  if (!db) return { ok: false, error: 'Token vault not configured' }
  const enc = vaultEncrypt(JSON.stringify(bundle))
  if (!enc.ok) return { ok: false, error: enc.error }
  const expiresIso = new Date(bundle.expires_at * 1000).toISOString()
  // Archive any prior active token for this institution, then insert the new one.
  await db.from('vault_items')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('provider', vaultProviderKey(institution))
    .eq('label', 'oauth_token')
    .eq('status', 'active')
  const { error } = await db.from('vault_items').insert({
    owner_id: ctx.user?.id || ZERO_UUID,
    provider: vaultProviderKey(institution),
    label: 'oauth_token',
    value_encrypted: enc.valueEncrypted,
    iv: enc.iv,
    tag: enc.tag,
    last4: (bundle.access_token || '').slice(-4),
    expires_at: expiresIso,
    status: 'active',
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ---- OAuth2 token endpoint helpers ----

function basicAuth(key: string, secret: string): string {
  return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64')
}

function bundleFromTokenResponse(json: any): TokenBundle {
  const now = Math.floor(Date.now() / 1000)
  const expiresIn = Number(json?.expires_in || 3600)
  return {
    access_token: String(json?.access_token || ''),
    refresh_token: json?.refresh_token ? String(json.refresh_token) : undefined,
    token_type: json?.token_type ? String(json.token_type) : 'Bearer',
    scope: json?.scope ? String(json.scope) : undefined,
    expires_at: now + (isFinite(expiresIn) ? expiresIn : 3600),
    obtained_at: now,
  }
}

// Returns a non-expired access token, refreshing via refresh_token grant if needed.
async function getFreshAccessToken(c: BankConnector, ctx: Ctx): Promise<{ ok: boolean; token?: string; notConnected?: boolean; error?: string }> {
  const t = await readToken(c.id)
  if (!t.ok) return { ok: false, notConnected: t.notConnected, error: t.error }
  const bundle = t.bundle!
  const now = Math.floor(Date.now() / 1000)
  if (bundle.expires_at - now > REFRESH_SKEW_SECONDS) {
    return { ok: true, token: bundle.access_token }
  }
  // Needs refresh.
  if (!bundle.refresh_token) {
    return { ok: false, error: 'Access token expired and no refresh token is stored — reconnect the institution' }
  }
  const { key, secret } = bankCredentials(c)
  if (!key || !secret) return { ok: false, error: `Cannot refresh — set ${c.keyEnv} and ${c.secretEnv}` }
  if (!bankBaseUrl(c)) return { ok: false, error: `Cannot refresh — set ${c.baseUrlEnv}` }
  try {
    const res = await fetch(bankEndpoint(c, c.endpoints.tokenRefresh), {
      method: 'POST',
      headers: { Authorization: basicAuth(key, secret), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: bundle.refresh_token }).toString(),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.error_description || json?.error || `Token refresh failed (HTTP ${res.status})` }
    const fresh = bundleFromTokenResponse(json)
    // Carry the refresh token forward if the provider didn't return a new one.
    if (!fresh.refresh_token) fresh.refresh_token = bundle.refresh_token
    if (!fresh.access_token) return { ok: false, error: 'Refresh returned no access token' }
    const w = await writeToken(c.id, ctx, fresh)
    if (!w.ok) return { ok: false, error: w.error }
    await logCompliance({ ctx, institution: c.id, action: 'token_refresh', status: 'success' })
    return { ok: true, token: fresh.access_token }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Token refresh error' }
  }
}

// Preflight that every connected-only action shares. Resolves the connector,
// validates credentials/base-URL, and returns a fresh bearer token.
async function authorizedCall(institution: string, ctx: Ctx, action: string): Promise<
  { ok: boolean; result?: Result; c?: BankConnector; token?: string }
> {
  const c = getBankConnector(institution)
  if (!c) { return { ok: false, result: { ok: false, error: 'Unknown institution' } } }
  if (!bankBaseUrl(c)) {
    await logCompliance({ ctx, institution, action, status: 'error', detail: `unconfigured:${c.baseUrlEnv}` })
    return { ok: false, result: { ok: false, error: `${c.name} not configured — set ${c.baseUrlEnv} (and ${c.keyEnv}/${c.secretEnv})` } }
  }
  const tok = await getFreshAccessToken(c, ctx)
  if (!tok.ok) {
    await logCompliance({ ctx, institution, action, status: 'error', detail: tok.notConnected ? 'not_connected' : (tok.error || 'auth_failed') })
    return { ok: false, result: { ok: false, error: tok.notConnected ? `${c.name} is not connected — run Connect → Verify first` : (tok.error || 'Authorization failed') } }
  }
  return { ok: true, c, token: tok.token! }
}

async function getJSON(url: string, token: string): Promise<{ ok: boolean; json?: any; error?: string }> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: json?.error_description || json?.error || `Provider error (HTTP ${res.status})` }
  return { ok: true, json }
}

// ============================================================================
// Action 1 — Connect (Email OTP) : start enrollment, send a one-time passcode
// ============================================================================
registerExecutor({
  providerId: 'bank', actionId: 'start_enrollment', policyActionId: 'bank_connect',
  schema: schema('bank.start_enrollment', 'Connect (Send Email OTP)', 'create', [
    INSTITUTION,
    { id: 'email', label: 'Bank-registered email', type: 'text', required: true },
  ]),
  async run(ctx, input) {
    const institution = String(input.institution || '')
    const email = String(input.email || '').trim()
    const c = getBankConnector(institution)
    if (!c) return { ok: false, error: 'Unknown institution' }
    if (!email) return { ok: false, error: 'Email is required' }
    const { key, secret } = bankCredentials(c)
    if (!key || !secret) {
      await logCompliance({ ctx, institution, action: 'start_enrollment', status: 'error', detail: 'unconfigured_credentials' })
      return { ok: false, error: `${c.name} not configured — register ${c.keyEnv} and ${c.secretEnv} (or BANK_API_KEY / BANK_API_SECRET)` }
    }
    if (!bankBaseUrl(c)) {
      await logCompliance({ ctx, institution, action: 'start_enrollment', status: 'error', detail: 'unconfigured_base' })
      return { ok: false, error: `${c.name} not configured — set ${c.baseUrlEnv}` }
    }
    try {
      const res = await fetch(bankEndpoint(c, c.endpoints.otpStart), {
        method: 'POST',
        headers: { Authorization: basicAuth(key, secret), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, channel: 'email' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        await logCompliance({ ctx, institution, action: 'start_enrollment', status: 'error', detail: `http_${res.status}` })
        return { ok: false, error: json?.error_description || json?.error || `OTP request failed (HTTP ${res.status})` }
      }
      await logCompliance({ ctx, institution, action: 'start_enrollment', status: 'success', requestId: json?.request_id })
      return { ok: true, message: `One-time passcode sent to ${email}. Enter it in “Verify & Connect”.`, data: { institution, request_id: json?.request_id || null } }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OTP request error'
      await logCompliance({ ctx, institution, action: 'start_enrollment', status: 'error', detail: msg })
      return { ok: false, error: msg }
    }
  },
})

// ============================================================================
// Action 2 — Verify & Connect : exchange the OTP for an OAuth2 token bundle
// ============================================================================
registerExecutor({
  providerId: 'bank', actionId: 'complete_enrollment', policyActionId: 'bank_connect',
  schema: schema('bank.complete_enrollment', 'Verify & Connect', 'create', [
    INSTITUTION,
    { id: 'email', label: 'Bank-registered email', type: 'text', required: true },
    { id: 'otp', label: 'One-time passcode', type: 'text', required: true },
  ]),
  async run(ctx, input) {
    const institution = String(input.institution || '')
    const email = String(input.email || '').trim()
    const otp = String(input.otp || '').trim()
    const c = getBankConnector(institution)
    if (!c) return { ok: false, error: 'Unknown institution' }
    if (!email || !otp) return { ok: false, error: 'Email and one-time passcode are required' }
    const { key, secret } = bankCredentials(c)
    if (!key || !secret) return { ok: false, error: `${c.name} not configured — register ${c.keyEnv} and ${c.secretEnv}` }
    if (!bankBaseUrl(c)) return { ok: false, error: `${c.name} not configured — set ${c.baseUrlEnv}` }
    try {
      const res = await fetch(bankEndpoint(c, c.endpoints.otpVerify), {
        method: 'POST',
        headers: { Authorization: basicAuth(key, secret), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'otp', email, otp }).toString(),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        await logCompliance({ ctx, institution, action: 'complete_enrollment', status: 'error', detail: `http_${res.status}` })
        return { ok: false, error: json?.error_description || json?.error || `Verification failed (HTTP ${res.status})` }
      }
      const bundle = bundleFromTokenResponse(json)
      if (!bundle.access_token) return { ok: false, error: 'Verification returned no access token' }
      const w = await writeToken(institution, ctx, bundle)
      if (!w.ok) return { ok: false, error: w.error }
      await logCompliance({ ctx, institution, action: 'complete_enrollment', status: 'success' })
      return {
        ok: true,
        message: `${c.name} connected. Token stored encrypted and will auto-refresh.`,
        data: { institution, connected: true, token_last4: mask(bundle.access_token), expires_at: new Date(bundle.expires_at * 1000).toISOString() },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification error'
      await logCompliance({ ctx, institution, action: 'complete_enrollment', status: 'error', detail: msg })
      return { ok: false, error: msg }
    }
  },
})

// ============================================================================
// Action 3 — List Accounts (read source for the account pickers)
// ============================================================================
registerExecutor({
  providerId: 'bank', actionId: 'list_accounts', policyActionId: 'bank_read',
  schema: schema('bank.list_accounts', 'List Accounts', 'view', [INSTITUTION]),
  async run(ctx, input) {
    const institution = String(input.institution || '')
    const pre = await authorizedCall(institution, ctx, 'list_accounts')
    if (!pre.ok) return pre.result
    const r = await getJSON(bankEndpoint(pre.c, pre.c.endpoints.accounts), pre.token)
    if (!r.ok) { await logCompliance({ ctx, institution, action: 'list_accounts', status: 'error', detail: r.error }); return r }
    const raw: any[] = Array.isArray(r.json?.accounts) ? r.json.accounts : (Array.isArray(r.json) ? r.json : [])
    const accounts = raw.map(a => {
      const id = String(a?.id ?? a?.account_id ?? a?.accountId ?? '')
      const name = a?.name || a?.nickname || a?.type || 'Account'
      const last4 = String(a?.mask ?? a?.last4 ?? id).slice(-4)
      return { id, label: `${name} ••${last4}`, type: a?.type || a?.subtype || '' }
    }).filter(a => a.id)
    await logCompliance({ ctx, institution, action: 'list_accounts', status: 'success' })
    return { ok: true, message: `${accounts.length} account${accounts.length === 1 ? '' : 's'}`, data: { count: accounts.length, accounts } }
  },
})

// ============================================================================
// Action 4 — Check Balance  →  GET /accounts/{id}/balance
// ============================================================================
registerExecutor({
  providerId: 'bank', actionId: 'check_balance', policyActionId: 'bank_read',
  schema: schema('bank.check_balance', 'Check Balance', 'view', [INSTITUTION, ACCOUNT]),
  async run(ctx, input) {
    const institution = String(input.institution || '')
    const accountId = String(input.accountId || '')
    if (!accountId) return { ok: false, error: 'Account is required' }
    const pre = await authorizedCall(institution, ctx, 'check_balance')
    if (!pre.ok) return pre.result
    const r = await getJSON(bankEndpoint(pre.c, pre.c.endpoints.balance, accountId), pre.token)
    if (!r.ok) { await logCompliance({ ctx, institution, action: 'check_balance', status: 'error', accountRef: accountId, detail: r.error }); return r }
    const b = r.json?.balance ?? r.json
    const available = b?.available ?? b?.available_balance
    const current = b?.current ?? b?.current_balance ?? b?.ledger
    const currency = b?.currency || b?.iso_currency_code || 'USD'
    await logCompliance({ ctx, institution, action: 'check_balance', status: 'success', accountRef: accountId, currency })
    return {
      ok: true,
      message: `Balance retrieved for ${mask(accountId)}`,
      data: { institution, account: mask(accountId), available, current, currency, as_of: new Date().toISOString() },
    }
  },
})

// ============================================================================
// Action 5 — Transaction History  →  GET /accounts/{id}/transactions
// ============================================================================
registerExecutor({
  providerId: 'bank', actionId: 'transaction_history', policyActionId: 'bank_read',
  schema: schema('bank.transaction_history', 'Transaction History', 'view', [
    INSTITUTION, ACCOUNT,
    { id: 'from', label: 'From date', type: 'text', required: false },
    { id: 'to', label: 'To date', type: 'text', required: false },
  ]),
  async run(ctx, input) {
    const institution = String(input.institution || '')
    const accountId = String(input.accountId || '')
    if (!accountId) return { ok: false, error: 'Account is required' }
    const pre = await authorizedCall(institution, ctx, 'transaction_history')
    if (!pre.ok) return pre.result
    const qs = new URLSearchParams()
    if (input.from) qs.set('from', String(input.from))
    if (input.to) qs.set('to', String(input.to))
    const url = bankEndpoint(pre.c, pre.c.endpoints.transactions, accountId) + (qs.toString() ? `?${qs.toString()}` : '')
    const r = await getJSON(url, pre.token)
    if (!r.ok) { await logCompliance({ ctx, institution, action: 'transaction_history', status: 'error', accountRef: accountId, detail: r.error }); return r }
    const raw: any[] = Array.isArray(r.json?.transactions) ? r.json.transactions : (Array.isArray(r.json) ? r.json : [])
    const transactions = raw.slice(0, 100).map(tx => ({
      date: tx?.date || tx?.posted_at || tx?.timestamp || '',
      description: tx?.description || tx?.name || tx?.merchant || '',
      amount: tx?.amount,
      currency: tx?.currency || tx?.iso_currency_code || 'USD',
      status: tx?.status || (tx?.pending ? 'pending' : 'posted'),
    }))
    await logCompliance({ ctx, institution, action: 'transaction_history', status: 'success', accountRef: accountId })
    return { ok: true, message: `${transactions.length} transaction${transactions.length === 1 ? '' : 's'}`, data: { institution, account: mask(accountId), count: transactions.length, transactions } }
  },
})

// ============================================================================
// Action 6 — Download Statement  →  GET /accounts/{id}/statements
// ============================================================================
registerExecutor({
  providerId: 'bank', actionId: 'download_statement', policyActionId: 'bank_read',
  schema: schema('bank.download_statement', 'Download Statement', 'view', [
    INSTITUTION, ACCOUNT,
    { id: 'period', label: 'Statement period', type: 'select', required: true, options: [
      { label: 'Most recent', value: 'latest' },
      { label: 'Last month', value: 'last_month' },
      { label: 'Last 3 months', value: 'last_3_months' },
      { label: 'Year to date', value: 'ytd' },
    ] },
  ]),
  async run(ctx, input) {
    const institution = String(input.institution || '')
    const accountId = String(input.accountId || '')
    const period = String(input.period || 'latest')
    if (!accountId) return { ok: false, error: 'Account is required' }
    const pre = await authorizedCall(institution, ctx, 'download_statement')
    if (!pre.ok) return pre.result
    const url = bankEndpoint(pre.c, pre.c.endpoints.statements, accountId) + `?period=${encodeURIComponent(period)}`
    const r = await getJSON(url, pre.token)
    if (!r.ok) { await logCompliance({ ctx, institution, action: 'download_statement', status: 'error', accountRef: accountId, detail: r.error }); return r }
    const statements: any[] = Array.isArray(r.json?.statements) ? r.json.statements : (Array.isArray(r.json) ? r.json : [r.json])
    const list = statements.filter(Boolean).slice(0, 24).map(s => ({
      period: s?.period || period,
      issued: s?.issued_at || s?.date || '',
      format: s?.format || 'pdf',
      url: s?.download_url || s?.url || null, // signed, short-lived link from the provider
    }))
    await logCompliance({ ctx, institution, action: 'download_statement', status: 'success', accountRef: accountId, detail: `period:${period}` })
    return { ok: true, message: `${list.length} statement${list.length === 1 ? '' : 's'} available`, data: { institution, account: mask(accountId), statements: list } }
  },
})

// ============================================================================
// Action 7 — Send Payment  →  POST /payments/initiate  (owner-gated, audited)
// ============================================================================
registerExecutor({
  providerId: 'bank', actionId: 'send_payment', policyActionId: 'bank_send_payment',
  schema: schema('bank.send_payment', 'Send Payment', 'create', [
    INSTITUTION,
    { id: 'fromAccountId', label: 'From account', type: 'remote_select', required: true,
      remoteSource: { action: 'bank.list_accounts', dataPath: 'accounts', valueKey: 'id', labelTemplate: '{label}', dependsOn: ['institution'], emptyHint: 'Connect the institution first' } },
    { id: 'toAccount', label: 'To account / counterparty', type: 'text', required: true },
    { id: 'amount', label: 'Amount', type: 'number', required: true },
    { id: 'currency', label: 'Currency', type: 'select', required: true, options: [{ label: 'USD', value: 'USD' }] },
    { id: 'memo', label: 'Memo', type: 'text', required: false },
  ]),
  async run(ctx, input) {
    const institution = String(input.institution || '')
    const fromAccountId = String(input.fromAccountId || '')
    const toAccount = String(input.toAccount || '').trim()
    const amount = Number(input.amount)
    const currency = String(input.currency || 'USD')
    const memo = String(input.memo || '').slice(0, 140)
    if (!fromAccountId || !toAccount) return { ok: false, error: 'From account and destination are required' }
    if (!isFinite(amount) || amount <= 0) return { ok: false, error: 'Amount must be a positive number' }
    const amountCents = Math.round(amount * 100)

    const pre = await authorizedCall(institution, ctx, 'send_payment')
    if (!pre.ok) return pre.result

    // Idempotency key so a retried submit never double-pays.
    const requestId = `pay_${institution}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    try {
      const res = await fetch(bankEndpoint(pre.c, pre.c.endpoints.initiatePayment), {
        method: 'POST',
        headers: { Authorization: `Bearer ${pre.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
        body: JSON.stringify({ from_account_id: fromAccountId, to_account: toAccount, amount_cents: amountCents, currency, memo, idempotency_key: requestId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        await logCompliance({ ctx, institution, action: 'send_payment', status: 'error', accountRef: fromAccountId, amountCents, currency, requestId, detail: `http_${res.status}` })
        return { ok: false, error: json?.error_description || json?.error || `Payment failed (HTTP ${res.status})` }
      }
      await logCompliance({ ctx, institution, action: 'send_payment', status: 'success', accountRef: fromAccountId, amountCents, currency, requestId })
      return {
        ok: true,
        message: `Payment of ${amount.toFixed(2)} ${currency} initiated from ${mask(fromAccountId)}`,
        data: { institution, from: mask(fromAccountId), to: mask(toAccount), amount: amount.toFixed(2), currency, payment_id: json?.payment_id || json?.id || requestId, status: json?.status || 'initiated', request_id: requestId },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment error'
      await logCompliance({ ctx, institution, action: 'send_payment', status: 'error', accountRef: fromAccountId, amountCents, currency, requestId, detail: msg })
      return { ok: false, error: msg }
    }
  },
})

// ============================================================================
// Action 8 — Refresh Token (manual; auto-refresh also runs before every call)
// ============================================================================
registerExecutor({
  providerId: 'bank', actionId: 'refresh_token', policyActionId: 'bank_refresh',
  schema: schema('bank.refresh_token', 'Refresh Token', 'edit', [INSTITUTION]),
  async run(ctx, input) {
    const institution = String(input.institution || '')
    const c = getBankConnector(institution)
    if (!c) return { ok: false, error: 'Unknown institution' }
    const tok = await getFreshAccessToken(c, ctx)
    if (!tok.ok) return { ok: false, error: tok.notConnected ? `${c.name} is not connected` : (tok.error || 'Refresh failed') }
    return { ok: true, message: `${c.name} token is valid`, data: { institution, token_last4: mask(tok.token || '') } }
  },
})

// ============================================================================
// Action 9 — Compliance Log (read the bank audit trail)
// ============================================================================
registerExecutor({
  providerId: 'bank', actionId: 'compliance_log', policyActionId: 'bank_read',
  schema: schema('bank.compliance_log', 'Compliance Log', 'view', [
    { id: 'institution', label: 'Institution', type: 'select', required: false, options: bankInstitutionOptions() },
  ]),
  async run(ctx, input) {
    const db = admin()
    if (!db) return { ok: false, error: 'Compliance store not configured' }
    let q = db.from('bank_compliance_log')
      .select('created_at, institution, action, status, account_ref, amount_cents, currency, actor_email, request_id')
      .order('created_at', { ascending: false })
      .limit(50)
    const institution = String(input.institution || '')
    if (institution) q = q.eq('institution', institution)
    const { data, error } = await q
    if (error) return { ok: false, error: error.message }
    const rows = (data || []).map(r => ({
      at: r.created_at, institution: r.institution, action: r.action, status: r.status,
      account: r.account_ref || '', amount: typeof r.amount_cents === 'number' ? (r.amount_cents / 100).toFixed(2) : '', currency: r.currency || '',
      actor: r.actor_email || '', request_id: r.request_id || '',
    }))
    return { ok: true, message: `${rows.length} compliance event${rows.length === 1 ? '' : 's'}`, data: { count: rows.length, events: rows } }
  },
})
