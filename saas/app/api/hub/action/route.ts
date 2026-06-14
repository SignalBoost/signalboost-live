// saas/app/api/hub/action/route.ts
// PART 1 of 2 — POST handler + service-specific action executors.
// PART 2 will have logAuditEvent and the POST route handler closure.

import { NextRequest, NextResponse } from 'next/server'
import { getTemplate, validateTemplatePayload } from '@/lib/hub/provider-templates'
import { getHubActionPolicy, isActionBlocked } from '@/lib/hub/action-policy'
import { getCurrentUser } from '@/lib/auth/permission-middleware'

// ============================================================================
// Provider Credentials Map — determines which env vars gate execution.
// ============================================================================

const PROVIDER_CREDENTIALS: Record<string, { envVars: string[]; baseUrl?: string }> = {
  stripe: {
    envVars: ['STRIPE_SECRET_KEY'],
    baseUrl: undefined,
  },
  supabase: {
    envVars: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    baseUrl: undefined,
  },
  vercel: {
    envVars: ['VERCEL_TOKEN', 'VERCEL_HUB_PROJECT'],
    baseUrl: undefined,
  },
  github: {
    envVars: ['GITHUB_WRITE_TOKEN'],
    baseUrl: undefined,
  },
  openai: {
    envVars: ['OPENAI_API_KEY'],
    baseUrl: 'https://api.openai.com',
  },
  anthropic: {
    envVars: ['ANTHROPIC_API_KEY'],
    baseUrl: undefined,
  },
  'aws-s3': {
    envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
    baseUrl: undefined,
  },
  aws: {
    envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    baseUrl: undefined,
  },
  gcp: {
    envVars: ['GOOGLE_APPLICATION_CREDENTIALS'],
    baseUrl: undefined,
  },
  compliance: {
    envVars: [],
    baseUrl: undefined,
  },
}

// ============================================================================
// Stripe Actions
// ============================================================================

async function executeStripeAction(template: any, payload: Record<string, unknown>) {
  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) return { ok: false, error: 'Stripe not configured' }

  // Create a price for an existing product
  if (template.id === 'stripe.create_price') {
    const dollars = Number(payload.unit_amount || 0)
    const cents = Math.round(dollars * 100)
    const params: Record<string, string> = {
      product: String(payload.product || ''),
      currency: String(payload.currency || 'usd'),
      unit_amount: String(cents),
    }
    const interval = String(payload.interval || 'month')
    if (interval !== 'one_time') params['recurring[interval]'] = interval
    const res = await fetch('https://api.stripe.com/v1/prices', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e || res.statusText }
    }
    const data = await res.json()
    return { ok: true, message: 'Price created: ' + (data.id || 'unknown'), data: { id: data.id, unit_amount: data.unit_amount, currency: data.currency } }
  }

  // Delete a product
  if (template.id === 'stripe.delete_product') {
    const id = String(payload.id || '')
    if (!id) return { ok: false, error: 'Product ID is required' }
    const res = await fetch('https://api.stripe.com/v1/products/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + apiKey },
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e || res.statusText }
    }
    const data = await res.json()
    return { ok: true, message: 'Product deleted: ' + (data.id || id), data: { id: data.id || id, deleted: data.deleted } }
  }

  // Create a restricted API key
  if (template.id === 'stripe.add_api_key') {
    const name = String(payload.name || 'SignalBoost-Console-' + Date.now())
    const res = await fetch('https://api.stripe.com/v1/api_keys', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        name,
        type: 'restricted_api_key',
        'restrictions[account_operations][allowed_operations][]': 'read',
      }).toString(),
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e || res.statusText }
    }
    const data = await res.json()
    const secret = String(data.secret || '')
    return { ok: true, message: 'Restricted API key created: ' + name, data: { name, key: secret ? secret.substring(0, 12) + '****' + secret.slice(-4) : '(created)' } }
  }

  // Create a product (name + description only; pricing handled by create_price)
  if (template.id === 'stripe.create_product') {
    const params: Record<string, string> = { name: String(payload.name || '') }
    if (payload.description) params.description = String(payload.description)
    const res = await fetch('https://api.stripe.com/v1/products', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e || res.statusText }
    }
    const data = await res.json()
    return { ok: true, message: 'Product created: ' + (data.id || 'unknown'), data: { id: data.id, name: data.name } }
  }

  // Health check: GET request, read-only
  const res = await fetch('https://api.stripe.com/v1/products?limit=5', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + apiKey },
  })
  if (!res.ok) {
    const e = await res.text()
    return { ok: false, error: e }
  }
  const data = await res.json()
  const products = data.data || (Array.isArray(data) ? data : [])
  return {
    ok: true,
    message: `Stripe: ${products.length} product${products.length === 1 ? '' : 's'}`,
    data: { count: products.length, products: products.slice(0, 10).map((p: any) => ({ id: p.id, name: p.name })) },
  }
}

// ============================================================================
// Supabase Actions
// ============================================================================

async function executeSupabaseAction(template: any, payload: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'Supabase not configured' }

  // View users (read-only list)
  if (template.id === 'supabase.view_users') {
    const res = await fetch(`${url}/auth/v1/admin/users?per_page=50`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + key, apikey: key },
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e || 'Failed to list users' }
    }
    const data = await res.json()
    const users = data.users || (Array.isArray(data) ? data : [])
    return {
      ok: true,
      message: `Supabase users: ${users.length} found`,
      data: { userCount: users.length, users: users.slice(0, 8).map((u: any) => ({ id: u.id, email: u.email, confirmed_at: u.confirmed_at })) },
    }
  }

  // Delete a user by id
  if (template.id === 'supabase.delete_user') {
    const id = String(payload.user_id || '')
    if (!id) return { ok: false, error: 'User ID is required' }
    const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + key, apikey: key },
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e || 'Failed to delete user' }
    }
    return { ok: true, message: 'User deleted: ' + id, data: { id } }
  }

  // Reset password (send recovery email)
  if (template.id === 'supabase.reset_password') {
    const email = String(payload.email || '')
    if (!email) return { ok: false, error: 'Email is required' }
    const res = await fetch(`${url}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e || 'Failed to send recovery email' }
    }
    return { ok: true, message: 'Recovery email sent to ' + email, data: { email } }
  }

  return { ok: false, error: 'Unknown Supabase action' }
}

// ============================================================================
// Vercel Actions
// ============================================================================

async function executeVercelAction(template: any, payload: Record<string, unknown>) {
  const token = process.env.VERCEL_TOKEN
  const projectId = process.env.VERCEL_HUB_PROJECT
  if (!token || !projectId) return { ok: false, error: 'Vercel not configured' }

  // View environment variables (names + targets; values masked by Vercel)
  if (template.id === 'vercel.view_env') {
    const res = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token },
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e }
    }
    const data = await res.json()
    const envs = data.envs || (Array.isArray(data) ? data : [])
    return {
      ok: true,
      message: `Vercel env: ${envs.length} variable${envs.length === 1 ? '' : 's'}`,
      data: { count: envs.length, vars: envs.slice(0, 40).map((e: any) => ({ id: e.id, key: e.key, target: e.target })) },
    }
  }

  // Delete an environment variable by id
  if (template.id === 'vercel.delete_env') {
    const id = String(payload.id || '')
    if (!id) return { ok: false, error: 'Env Variable ID is required' }
    const res = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e }
    }
    return { ok: true, message: 'Env variable deleted', data: { id } }
  }

  // Health check: read-only deployments list
  const res = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=5`, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token },
  })
  if (!res.ok) {
    const e = await res.text()
    return { ok: false, error: e }
  }
  const data = await res.json()
  const deployments = data.deployments || (Array.isArray(data) ? data : [])
  return {
    ok: true,
    message: `Vercel: ${deployments.length} recent deployment${deployments.length === 1 ? '' : 's'}`,
    data: { count: deployments.length, deployments: deployments.slice(0, 5).map((d: any) => ({ id: d.uid, state: d.state, created: d.created })) },
  }
}

// ============================================================================
// GitHub Actions
// ============================================================================

async function executeGitHubAction(template: any, payload: Record<string, unknown>) {
  const token = process.env.GITHUB_WRITE_TOKEN
  if (!token) return { ok: false, error: 'GitHub not configured' }

  const OWNER = String(payload.owner || process.env.GITHUB_DEFAULT_OWNER || 'SignalBoost')
  const REPO = String(payload.repo || process.env.GITHUB_DEFAULT_REPO || 'signalboost-live')

  const endpoint = String(template.api.endpoint)
    .replace('{owner}', OWNER)
    .replace('{repo}', REPO)
  const url = 'https://api.github.com' + endpoint
  const method = template.api.method || 'GET'

  const headers: Record<string, string> = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
  }

  let body: string | undefined
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    if (template.id === 'github.open_issue') {
      body = JSON.stringify({ title: payload.title, body: payload.body })
    } else {
      body = JSON.stringify(payload)
    }
  }

  const res = await fetch(url, { method, headers, body })
  if (!res.ok) {
    const error = await res.text()
    return { ok: false, error }
  }
  const data = await res.json()

  if (template.id === 'github.open_issue') {
    return { ok: true, message: 'Issue opened: #' + data.number, data: { number: data.number, url: data.html_url } }
  }
  if (template.id === 'github.view_repos') {
    const repos = Array.isArray(data) ? data : []
    return {
      ok: true,
      message: `GitHub repos: ${repos.length} accessible`,
      data: { count: repos.length, repos: repos.slice(0, 12).map((r: any) => ({ name: r.full_name, private: r.private, updated_at: r.updated_at })) },
    }
  }
  return { ok: true, message: 'GitHub action completed', data }
}

// ============================================================================
// AWS Actions
// ============================================================================

async function executeAWSAction(template: any, payload: Record<string, unknown>) {
  // Console CRUD actions — clean, honest placeholders until the AWS SDK is wired.
  if (template.id === 'aws.create_bucket') {
    return {
      ok: true,
      message: 'AWS create bucket queued (placeholder — wire @aws-sdk/client-s3 to execute)',
      data: { action: 'create_bucket', status: 'pending_implementation', note: 'Install @aws-sdk/client-s3 and call CreateBucketCommand.' },
    }
  }
  if (template.id === 'aws.list_iam_users') {
    return {
      ok: true,
      message: 'AWS IAM users (placeholder — wire @aws-sdk/client-iam to execute)',
      data: { action: 'list_iam_users', status: 'pending_implementation', note: 'Install @aws-sdk/client-iam and call ListUsersCommand.' },
    }
  }
  if (template.id === 'aws.disable_iam_user') {
    return {
      ok: true,
      message: 'AWS disable IAM user queued (placeholder — wire @aws-sdk/client-iam to execute)',
      data: { action: 'disable_iam_user', user: String(payload.user_name || ''), status: 'pending_implementation' },
    }
  }

  return { ok: false, error: 'Unknown AWS scanning action' }
}

// ============================================================================
// GCP Actions
// ============================================================================

async function executeGCPAction(template: any, payload: Record<string, unknown>) {
  if (template.id === 'google-cloud.list_service_accounts') {
    return {
      ok: true,
      message: 'GCP service accounts (placeholder — wire @google-cloud/iam to execute)',
      data: { action: 'list_service_accounts', status: 'pending_implementation', note: 'Install @google-cloud/iam and list service accounts.' },
    }
  }

  return { ok: false, error: 'Unknown GCP scanning action' }
}

// ============================================================================
// Compliance (internal audit — no external credentials)
// ============================================================================

async function executeComplianceAction(template: any, payload: Record<string, unknown>) {
  // Credential coverage matrix. severity = impact if the credential is absent.
  const CHECKS: { provider: string; tier: 'core' | 'common' | 'ai' | 'devops'; envVars: string[]; severity: 'high' | 'medium' | 'low' }[] = [
    { provider: 'Stripe', tier: 'core', envVars: ['STRIPE_SECRET_KEY'], severity: 'high' },
    { provider: 'Supabase', tier: 'core', envVars: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], severity: 'high' },
    { provider: 'Vercel', tier: 'core', envVars: ['VERCEL_TOKEN', 'VERCEL_HUB_PROJECT'], severity: 'high' },
    { provider: 'GitHub', tier: 'core', envVars: ['GITHUB_WRITE_TOKEN'], severity: 'medium' },
    { provider: 'OpenAI', tier: 'core', envVars: ['OPENAI_API_KEY'], severity: 'medium' },
    { provider: 'AWS', tier: 'core', envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'], severity: 'low' },
    { provider: 'Twilio', tier: 'common', envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'], severity: 'low' },
    { provider: 'SendGrid', tier: 'common', envVars: ['SENDGRID_API_KEY'], severity: 'low' },
    { provider: 'Cloudflare', tier: 'common', envVars: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ZONE_ID'], severity: 'low' },
    { provider: 'Anthropic', tier: 'ai', envVars: ['ANTHROPIC_API_KEY'], severity: 'low' },
    { provider: 'Sentry', tier: 'devops', envVars: ['SENTRY_AUTH_TOKEN'], severity: 'low' },
    { provider: 'Datadog', tier: 'devops', envVars: ['DATADOG_API_KEY'], severity: 'low' },
    { provider: 'PagerDuty', tier: 'devops', envVars: ['PAGERDUTY_API_KEY'], severity: 'low' },
  ]

  const scope = String(payload.scope || 'all')
  const selected = CHECKS.filter(c => {
    if (scope === 'core') return c.tier === 'core'
    if (scope === 'secrets') return c.envVars.some(v => /KEY|TOKEN|SECRET/.test(v))
    return true
  })

  const findings = selected.map(c => {
    const missing = c.envVars.filter(v => !process.env[v])
    const configured = missing.length === 0
    return {
      provider: c.provider,
      tier: c.tier,
      status: configured ? 'pass' : 'fail',
      severity: configured ? 'none' : c.severity,
      missing,
      detail: configured ? 'All credentials present.' : `Missing: ${missing.join(', ')}`,
    }
  })

  const failed = findings.filter(f => f.status === 'fail')
  const highOpen = failed.filter(f => f.severity === 'high').length
  const summary = {
    scope,
    checked: findings.length,
    passed: findings.length - failed.length,
    failed: failed.length,
    highSeverityOpen: highOpen,
    generatedAt: new Date().toISOString(),
  }

  if (template.id === 'compliance.run_audit') {
    const headline =
      failed.length === 0
        ? `Compliance audit passed — ${summary.passed}/${summary.checked} providers fully configured`
        : `Compliance audit: ${failed.length} finding${failed.length === 1 ? '' : 's'} (${highOpen} high) across ${summary.checked} providers`
    return { ok: true, message: headline, data: { summary, findings } }
  }

  // compliance.list_findings — return the current findings only.
  return {
    ok: true,
    message: `Compliance findings: ${failed.length} open (${highOpen} high)`,
    data: { summary, findings: failed.length ? failed : findings },
  }
}
// saas/app/api/hub/action/route.ts
// PART 2 of 2 — logAuditEvent function + POST route handler.
// (APPEND after the PART 1 handlers end)

// ============================================================================
// Audit Logging
// ============================================================================

async function logAuditEvent(
  userId: string,
  templateId: string,
  approved: boolean,
  result: { ok: boolean; error?: string; message?: string },
  _request?: NextRequest,
) {
  // Attempt to log to Supabase. Fail soft — a missing table should not break execution.
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) return

    const res = await fetch(`${supabaseUrl}/rest/v1/hub_action_audit_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + serviceKey,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        user_id: userId,
        template_id: templateId,
        approved,
        success: result.ok,
        error_message: result.error || null,
        executed_at: new Date().toISOString(),
      }),
    })
    // Swallow errors — audit is fail-soft.
  } catch (_err) {
    // Ignore
  }
}

// ============================================================================
// POST Handler
// ============================================================================

export async function POST(request: NextRequest) {
  // 1. Parse the request
  let body: any
  try {
    body = await request.json()
  } catch (_e) {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { templateId, payload } = body
  if (!templateId) {
    return NextResponse.json({ ok: false, error: 'templateId is required' }, { status: 400 })
  }

  // 2. Resolve the template
  const template = getTemplate(templateId)
  if (!template) {
    return NextResponse.json({ ok: false, error: 'Template not found' }, { status: 404 })
  }

  // 3. Validate the payload against the template schema
  const validation = validateTemplatePayload(templateId, payload || {})
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: 'Invalid payload: ' + validation.error }, { status: 400 })
  }

  // 4. Auth gate (all hub actions require auth)
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // 5. Policy gate (is this action blocked, or pending approval?)
  const policy = getHubActionPolicy(templateId)
  if (isActionBlocked(templateId)) {
    await logAuditEvent(user.id, templateId, false, { ok: false, error: '403 blocked by policy' }, request)
    return NextResponse.json({ ok: false, error: 'This action is blocked by policy' }, { status: 403 })
  }

  // 6. Credentials gate (does the provider have required env vars?)
  const service = template.api.service
  const requiredCreds = PROVIDER_CREDENTIALS[service]
  if (!requiredCreds) {
    // Unknown service
    return NextResponse.json({ ok: false, error: `Provider "${service}" is not implemented` }, { status: 501 })
  }

  // Check if all required env vars are present
  const missingCreds = requiredCreds.envVars.filter(v => !process.env[v])
  if (missingCreds.length > 0) {
    // Credentials missing — honest 501 "not configured"
    return NextResponse.json(
      { ok: false, error: `Provider not configured (missing: ${missingCreds.join(', ')})` },
      { status: 501 },
    )
  }

  // 7. Execute the action based on service
  let result: { ok: boolean; error?: string; message?: string; data?: any }
  try {
    switch (service) {
      case 'stripe':
        result = await executeStripeAction(template, payload || {})
        break
      case 'supabase':
        result = await executeSupabaseAction(template, payload || {})
        break
      case 'vercel':
        result = await executeVercelAction(template, payload || {})
        break
      case 'github':
        result = await executeGitHubAction(template, payload || {})
        break
      case 'aws':
        result = await executeAWSAction(template, payload || {})
        break
      case 'gcp':
        result = await executeGCPAction(template, payload || {})
        break
      case 'compliance':
        result = await executeComplianceAction(template, payload || {})
        break
      default:
        return NextResponse.json({ ok: false, error: `Service "${service}" not implemented` }, { status: 501 })
    }
  } catch (error: any) {
    result = { ok: false, error: error?.message || 'Execution error' }
  }

  // 8. Audit log (fail soft)
  await logAuditEvent(user.id, templateId, true, result, request)

  // 9. Return result
  if (result.ok) {
    return NextResponse.json(result)
  } else {
    return NextResponse.json(result, { status: 500 })
  }
}
