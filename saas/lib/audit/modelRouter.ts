// saas/lib/audit/modelRouter.ts
// Audit microservice model router — ISOLATED from lib/ai/modelRouter.ts on purpose.
// Deep recursive scans, compliance logic, RLS-bypass analysis and auto-patch
// reasoning route to OpenAI's flagship (GPT-5.5). Claude is the resilience
// fallback so an OpenAI outage never silently kills an audit run.
//
// Why a separate router: the Audit Project runs as its own load-isolated service.
// Keeping its routing here means tuning audit token budgets / models never
// perturbs live console traffic that depends on lib/ai/modelRouter.ts.

import { getAdminSupabase } from '@/utils/supabase/server'

export type AuditProvider = 'openai' | 'claude'

export interface AuditModelArgs {
  modelPreference?: AuditProvider
  prompt:           string
  systemPrompt?:    string
  maxTokens?:       number
}

// Flagship, not the mini tier — deep logic checking needs the reasoning engine.
const OPENAI_FLAGSHIP = 'gpt-5.5'
const CLAUDE_FALLBACK  = 'claude-sonnet-4-6'
const DEFAULT_MAX      = 8192

const AUDIT_SYSTEM_DEFAULT =
  'You are a senior application-security and code-quality auditor. Analyze the ' +
  'provided source rigorously for vulnerabilities, RLS/authorization bypasses, ' +
  'injection, secret leakage, logic flaws, and standards violations. When asked ' +
  'for findings, return ONLY valid JSON in the exact shape requested — no prose, ' +
  'no markdown fences.'

// ── OpenAI flagship ──────────────────────────────────────────────────────────
async function callOpenAI(args: AuditModelArgs): Promise<{ text: string | null; fellBack: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('audit/modelRouter: OPENAI_API_KEY missing — falling back to Claude')
    const text = await callClaude(args)
    return { text, fellBack: true }
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model:                 OPENAI_FLAGSHIP,
        // GPT-5 family on chat/completions REQUIRES max_completion_tokens.
        // Sending max_tokens here returns HTTP 400 and would force the fallback.
        max_completion_tokens: args.maxTokens ?? DEFAULT_MAX,
        messages: [
          { role: 'system', content: args.systemPrompt ?? AUDIT_SYSTEM_DEFAULT },
          { role: 'user',   content: args.prompt },
        ],
      }),
    })

    if (!response.ok) {
      console.error('audit/modelRouter: OpenAI HTTP error', response.status, await response.text())
      console.warn('audit/modelRouter: OpenAI failed — falling back to Claude')
      const text = await callClaude(args)
      return { text, fellBack: true }
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''
    return { text, fellBack: false }
  } catch (err) {
    console.error('audit/modelRouter: OpenAI exception — falling back to Claude', err)
    const text = await callClaude(args)
    return { text, fellBack: true }
  }
}

// ── Claude (resilience fallback / Claude-handled tasks) ──────────────────────
async function callClaude(args: AuditModelArgs): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { console.error('audit/modelRouter: ANTHROPIC_API_KEY missing'); return null }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      CLAUDE_FALLBACK,
        max_tokens: args.maxTokens ?? DEFAULT_MAX,
        system:     args.systemPrompt ?? AUDIT_SYSTEM_DEFAULT,
        messages:   [{ role: 'user', content: args.prompt }],
      }),
    })

    if (!response.ok) {
      console.error('audit/modelRouter: Claude HTTP error', response.status, await response.text())
      return null
    }

    const data = await response.json()
    return data.content?.[0]?.text || ''
  } catch (err) {
    console.error('audit/modelRouter: Claude exception', err)
    return null
  }
}

async function logAuditTask(row: {
  provider:   AuditProvider
  status:     'success' | 'error' | 'fallback'
  durationMs: number
  fellBack:   boolean
  promptLen:  number
}) {
  try {
    const admin = getAdminSupabase()
    await admin.from('ai_task_log').insert({
      task_type:     'audit',
      provider:      row.provider,
      model:         row.fellBack ? CLAUDE_FALLBACK : (row.provider === 'openai' ? OPENAI_FLAGSHIP : CLAUDE_FALLBACK),
      status:        row.status,
      duration_ms:   row.durationMs,
      fallback_used: row.fellBack,
      metadata:      { promptLength: row.promptLen },
    })
  } catch {
    // Observability must never break an audit run.
  }
}

// ── Main export ──────────────────────────────────────────────────────────────
// Audit defaults to OpenAI flagship; pass modelPreference:'claude' for the
// tasks Claude owns (frontend/structural generation).
export async function callAuditModel(args: AuditModelArgs): Promise<string | null> {
  const preference: AuditProvider = args.modelPreference ?? 'openai'
  const startedAt = Date.now()

  if (preference === 'claude') {
    const text = await callClaude(args)
    await logAuditTask({ provider: 'claude', status: text ? 'success' : 'error', durationMs: Date.now() - startedAt, fellBack: false, promptLen: args.prompt.length })
    return text
  }

  const { text, fellBack } = await callOpenAI(args)
  await logAuditTask({
    provider:   'openai',
    status:     text ? (fellBack ? 'fallback' : 'success') : 'error',
    durationMs: Date.now() - startedAt,
    fellBack,
    promptLen:  args.prompt.length,
  })
  return text
}
