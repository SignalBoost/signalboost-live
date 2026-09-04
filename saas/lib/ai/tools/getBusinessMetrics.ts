// saas/lib/ai/tools/getBusinessMetrics.ts
// Live business metrics for the Chief of Staff AI persona.
// Called only for owner/admin users — never exposed to the Concierge.
//
// PORTABLE: the datastore is INJECTED. The default adapter reads the platform's
// own Supabase (subscriptions + outreach_queue), so this deployment is unchanged.
// A buyer of the Chief-of-Staff portable calls setBusinessMetricsStore(...) once
// with an adapter over THEIR datastore, and every metric below is answered from
// their business instead — with zero change to the tool or its callers.

import { hostBrandName } from '@/lib/portable/companyIdentity'

export type SubscriptionRow = {
plan: string | null
video_credits: number | null
image_credits: number | null
ai_credits: number | null
}

export interface BusinessMetricsStore {
// Every subscription/account row used for user, plan, MRR and credit math.
fetchSubscriptions(): Promise<SubscriptionRow[]>
// Count of leads in the outreach pipeline (0 if the deployment has none).
countOutreachLeads(): Promise<number>
}

export type BusinessMetrics = {
totalUsers: number
paidUsers: number
mrr: number
planBreakdown: Record<string, number>
outreachLeads: number
creditsSnapshot: {
avgVideoCreditsRemaining: number
avgImageCreditsRemaining: number
avgAiCreditsRemaining: number
}
generatedAt: string
}

export type MetricsResult = {
ok: boolean
metrics?: BusinessMetrics
source?: string
error?: string
}

// Monthly revenue per paid plan — includes legacy plan names
const PLAN_MRR: Record<string, number> = {
launch: 15,
starter: 15, // legacy alias for launch
growth: 99,
pro: 99, // legacy alias for growth
command: 249,
enterprise: 249, // legacy alias for command
business: 249, // legacy alias for command
}

const PAID_PLANS = new Set([
'launch', 'starter',
'growth', 'pro',
'command', 'enterprise', 'business',
])

// ── Default adapter: the platform's own Supabase (unchanged behavior) ────────
let store: BusinessMetricsStore | null = null

async function platformDb() {
const { createClient } = await import('@supabase/supabase-js')
return createClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
}

function defaultStore(): BusinessMetricsStore {
return {
async fetchSubscriptions() {
const db = await platformDb()
const { data, error } = await db
.from('subscriptions')
.select('user_id, plan, status, video_credits, image_credits, ai_credits')
if (error) throw new Error(`Subscriptions query failed: ${error.message}`)
return (data ?? []) as SubscriptionRow[]
},
async countOutreachLeads() {
const db = await platformDb()
const { count, error } = await db
.from('outreach_queue')
.select('id', { count: 'exact', head: true })
if (error) {
console.error('getBusinessMetrics: outreach_queue query failed', error.message)
return 0
}
return count ?? 0
},
}
}

export function setBusinessMetricsStore(s: BusinessMetricsStore): void { store = s }
export function getBusinessMetricsStore(): BusinessMetricsStore { return store ?? defaultStore() }

export async function getBusinessMetrics(): Promise<MetricsResult> {
try {
const s = getBusinessMetricsStore()

// ── Subscriptions: users, plans, credits ──────────────────────────────
const allSubs = await s.fetchSubscriptions()
const totalUsers = allSubs.length

const paidSubs = allSubs.filter(x => PAID_PLANS.has((x.plan || '').toLowerCase()))
const paidUsers = paidSubs.length

// Plan breakdown — all plans including free
const planBreakdown: Record<string, number> = {}
for (const sub of allSubs) {
const key = (sub.plan || 'unknown').toLowerCase()
planBreakdown[key] = (planBreakdown[key] ?? 0) + 1
}

// MRR from paid subscriptions
const mrr = paidSubs.reduce((sum, x) => {
return sum + (PLAN_MRR[(x.plan || '').toLowerCase()] ?? 0)
}, 0)

// Average remaining credits across all users with credit data
const withCredits = allSubs.filter(x => x.video_credits != null)
const avg = (field: 'video_credits' | 'image_credits' | 'ai_credits') =>
withCredits.length
? Math.round(withCredits.reduce((s2, r) => s2 + (r[field] ?? 0), 0) / withCredits.length)
: 0

// ── Outreach queue: lead count ────────────────────────────────────────
const outreachLeads = await s.countOutreachLeads()

const metrics: BusinessMetrics = {
totalUsers,
paidUsers,
mrr,
planBreakdown,
outreachLeads,
creditsSnapshot: {
avgVideoCreditsRemaining: avg('video_credits'),
avgImageCreditsRemaining: avg('image_credits'),
avgAiCreditsRemaining: avg('ai_credits'),
},
generatedAt: new Date().toISOString(),
}

return {
ok: true,
metrics,
source: `live — ${metrics.generatedAt}`,
}
} catch (err) {
return {
ok: false,
error: err instanceof Error ? err.message : 'Unknown error fetching metrics',
}
}
}

// Format metrics as a readable string for the AI model
export function formatMetricsForAI(metrics: BusinessMetrics): string {
const planLines = Object.entries(metrics.planBreakdown)
.sort(([, a], [, b]) => b - a)
.map(([plan, count]) => ` - ${plan}: ${count} user${count !== 1 ? 's' : ''}`)
.join('\n')

return `LIVE ${hostBrandName().toUpperCase()} BUSINESS METRICS (as of ${new Date(metrics.generatedAt).toUTCString()}):

Users
Total accounts: ${metrics.totalUsers}
Paid accounts: ${metrics.paidUsers}
Free/demo: ${metrics.totalUsers - metrics.paidUsers}

Revenue
MRR (est.): $${metrics.mrr.toLocaleString()}
ARR (est.): $${(metrics.mrr * 12).toLocaleString()}

Plan breakdown
${planLines || ' No data'}

Outreach pipeline
Leads in queue: ${metrics.outreachLeads}

Credits (avg remaining across users)
Video: ${metrics.creditsSnapshot.avgVideoCreditsRemaining}
Image: ${metrics.creditsSnapshot.avgImageCreditsRemaining}
AI actions: ${metrics.creditsSnapshot.avgAiCreditsRemaining}

Source: ${metrics.generatedAt}`
}
