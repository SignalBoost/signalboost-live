// saas/marketing-sales-host/director.ts
// SignalBoost-coupled wiring for the autonomous director: it provides the real
// 5-language copy generator (Anthropic) and runs the portable loop against this
// app's stack. The director initiates into the approval queue only — it never
// approves and never publishes. Theme selection is performance-weighted: it favors
// the theme whose past campaigns drew the most real views, while still exploring.
import Anthropic from '@anthropic-ai/sdk'
import { getAdminSupabase } from '@/utils/supabase/server'
import { createSignalBoostMarketingHost } from './signalboostHost'
import { runDirector, type GeneratedCampaign } from '@/marketing-sales-core/director'
import { LANGS, type Lang, type Actor, type MarketingHost } from '@/marketing-sales-core/types'

const ORG = 'signalboost'
const MODEL = process.env.MARKETING_SALES_MODEL || 'claude-sonnet-4-6'
const EXPLORE = 0.34 // keep testing every theme even when one is winning

type Theme = { key: string; prompt: string }
// Bounded, grounded themes — real SignalBoost offerings only, no invented products.
const THEMES: Theme[] = [
  { key: 'audit',   prompt: 'Promote the free SaaS operations & security audit (Audit Center): invite SaaS founders to run a free audit and receive a prioritized findings report.' },
  { key: 'website', prompt: 'Promote the free Website Optimizer: invite small businesses to scan their website and get a clear, prioritized list of fixes.' },
  { key: 'reviews', prompt: 'Promote the review collection tool: help service and local businesses collect and showcase real customer reviews.' },
  { key: 'video',   prompt: 'Promote SignalBoost with a short vertical video concept: the title is a punchy on-screen hook line, and the body describes the voiceover and what is shown on screen for a ~5 second clip. Keep it concrete and grounded in real SignalBoost offerings.' },
]

// The optimization step: read which theme's published campaigns drew the most real
// views (ms_events) and favor it — with EXPLORE-rate exploration so the director
// never stops testing. Degrades SAFELY to date rotation when there is no data yet
// (e.g. before metrics are flowing); it never throws and never blocks a run.
async function pickTheme(host: MarketingHost): Promise<Theme> {
  if (Math.random() < EXPLORE) return THEMES[Math.floor(Math.random() * THEMES.length)]
  try {
    const camps = await host.store.select('ms_campaigns', { org_id: ORG })
    const themeOf = new Map<string, string>()
    for (const c of camps as any[]) if (c?.id && c?.channel) themeOf.set(c.id, c.channel)
    const events = await host.store.select('ms_events', { org_id: ORG, kind: 'view' })
    const tally: Record<string, number> = {}
    for (const e of events as any[]) { const t = themeOf.get(e.campaign_id); if (t) tally[t] = (tally[t] || 0) + 1 }
    let best: Theme | null = null, bestN = -1
    for (const th of THEMES) { const n = tally[th.key] || 0; if (n > bestN) { bestN = n; best = th } }
    if (best && bestN > 0) return best
  } catch { /* no metrics yet — fall through to rotation */ }
  return THEMES[new Date().getUTCDate() % THEMES.length]
}

function makeGenerate(host: MarketingHost) {
  return async function generate(): Promise<GeneratedCampaign> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return null // honest: no key -> director produces nothing, queues nothing

    const theme = await pickTheme(host)
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
        model: MODEL, max_tokens: 1400, system,
        messages: [{ role: 'user', content: `Theme: ${theme.prompt}` }],
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
    return { objective, drafts, channel: theme.key }
  }
}

export async function runSignalBoostDirector(opts?: { cap?: number }) {
  const admin = getAdminSupabase()
  const actor: Actor = { id: 'cos-director', role: 'operator', orgId: ORG }
  const host = createSignalBoostMarketingHost(admin, actor)
  return runDirector(host, { orgId: ORG, actorId: actor.id, cap: opts?.cap ?? 3, generate: makeGenerate(host) })
}
