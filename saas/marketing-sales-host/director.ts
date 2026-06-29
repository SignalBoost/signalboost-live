// saas/marketing-sales-host/director.ts
// SignalBoost-coupled wiring for the autonomous director: it provides the real
// 5-language copy generator (Anthropic) and runs the portable loop against this
// app's stack. The director initiates into the approval queue only — it never
// approves and never publishes.
import Anthropic from '@anthropic-ai/sdk'
import { getAdminSupabase } from '@/utils/supabase/server'
import { createSignalBoostMarketingHost } from './signalboostHost'
import { runDirector, type GeneratedCampaign } from '@/marketing-sales-core/director'
import { LANGS, type Lang, type Actor } from '@/marketing-sales-core/types'

const ORG = 'signalboost'
const MODEL = process.env.MARKETING_SALES_MODEL || 'claude-sonnet-4-6'

// Bounded, grounded themes — real SignalBoost offerings only, no invented products.
const THEMES = [
  'Promote the free SaaS operations & security audit (Audit Center): invite SaaS founders to run a free audit and receive a prioritized findings report.',
  'Promote the free Website Optimizer: invite small businesses to scan their website and get a clear, prioritized list of fixes.',
  'Promote the review collection tool: help service and local businesses collect and showcase real customer reviews.',
]
function pickTheme(now: Date): string { return THEMES[now.getUTCDate() % THEMES.length] }

async function generateCampaign(): Promise<GeneratedCampaign> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null // honest: no key -> director produces nothing, queues nothing

  const client = new Anthropic({ apiKey })
  const system = [
    'You are the marketing director for SignalBoost, a SaaS operations and security platform.',
    'Write ONE short promotional campaign for the given theme, in FIVE languages: en, es, pt, pl, ru.',
    'For each language produce a native-quality title (max ~60 chars) and a body of 2-4 sentences.',
    'Write natively in each language — do NOT machine-translate from English.',
    'Do NOT invent statistics, prices, names, testimonials, awards, or guarantees. Exactly one clear call to action.',
    'Return ONLY raw JSON, no markdown fences, shaped exactly:',
    '{"objective":"<short internal objective>","drafts":[{"lang":"en","title":"...","body":"..."},{"lang":"es",...},{"lang":"pt",...},{"lang":"pl",...},{"lang":"ru",...}]}',
  ].join('\n')

  let text = ''
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1400,
      system,
      messages: [{ role: 'user', content: `Theme: ${pickTheme(new Date())}` }],
    })
    text = resp.content.map((b: any) => (b?.type === 'text' ? b.text : '')).join('').trim()
  } catch { return null }

  let parsed: any
  try { parsed = JSON.parse(text) } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try { parsed = JSON.parse(m[0]) } catch { return null }
  }

  const valid = new Set(LANGS as readonly string[])
  const drafts = Array.isArray(parsed?.drafts)
    ? parsed.drafts
        .filter((d: any) => d && valid.has(d.lang) && d.title && d.body)
        .map((d: any) => ({ lang: d.lang as Lang, title: String(d.title), body: String(d.body) }))
    : []
  const objective = String(parsed?.objective || '').trim()
  if (!objective || drafts.length === 0) return null
  return { objective, drafts }
}

export async function runSignalBoostDirector(opts?: { cap?: number }) {
  const admin = getAdminSupabase()
  // 'operator' role: the director can initiate, but canApprove() is false for it —
  // it structurally cannot approve its own work.
  const actor: Actor = { id: 'cos-director', role: 'operator', orgId: ORG }
  const host = createSignalBoostMarketingHost(admin, actor)
  return runDirector(host, { orgId: ORG, actorId: actor.id, cap: opts?.cap ?? 3, generate: generateCampaign })
}
