// saas/lib/ai/growthPlans.ts
// Growth Plan workflow for the Chief of Staff strategist:
//   propose → owner approves/rejects in conversation → execute by creating
//   outreach drafts into the EXISTING outreach pipeline (status 'pending'),
//   which keeps every message behind the platform's established guardrails,
//   daily send limits, audit log, and final human send step.
//
// Requires the `growth_plans` table (created via SQL migration).

import { createClient } from '@supabase/supabase-js'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'
import { findContactEmail } from '@/lib/outreach/emailFinder'

const PLANS_TABLE = 'growth_plans'
const OUTREACH_TABLE = 'outreach_queue'

// CAN-SPAM + trust: every message must carry a real signer, the business's
// physical mailing address (legally required for US commercial email), and a
// plain opt-out. COS writes only the body; this footer is appended in code so it
// is guaranteed on every draft no matter what the model produced. Set the address
// once in Vercel as OUTREACH_PHYSICAL_ADDRESS.
function outreachComplianceFooter(): string {
  const addr = String(process.env.OUTREACH_PHYSICAL_ADDRESS || '').trim()
  const out = ['', '\u2014', 'Luis Claudio \u00b7 SignalBoost']
  if (addr) out.push(addr)
  out.push('Not a fit? Reply "unsubscribe" and we will not contact you again.')
  return out.join('\n')
}

export type GrowthPlan = {
  id: string
  alert_id: string | null
  title: string
  objective: string
  plan: string
  status: string
  approved_at: string | null
  created_at: string
}

const VALID_STATUSES = ['proposed', 'approved', 'rejected', 'executing', 'completed'] as const
export type PlanStatus = (typeof VALID_STATUSES)[number]

// Configured sender identities COS may choose from (mirrors lib/email.ts SENDERS).
const VALID_SENDER_KEYS = ['signalSupport', 'saasSupport', 'saasSales', 'saasMarketing', 'saasPartners', 'saasContact']

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

// ── Propose a new plan ──────────────────────────────────────────────────────────
export async function proposeGrowthPlan(params: {
  alertId?: string | null
  title: string
  objective: string
  plan: string
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const title = String(params.title || '').trim().slice(0, 140)
    const objective = String(params.objective || '').trim().slice(0, 500)
    const plan = String(params.plan || '').trim().slice(0, 8000)

    if (!title || !objective || !plan) {
      return { ok: false, error: 'title, objective, and plan are all required.' }
    }

    const alertId = params.alertId && isUuid(String(params.alertId)) ? String(params.alertId) : null

    const db = supabaseAdmin()
    const { data, error } = await db
      .from(PLANS_TABLE)
      .insert({ alert_id: alertId, title, objective, plan, status: 'proposed' })
      .select('id')
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, id: data.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error proposing plan' }
  }
}

// ── Update a plan's status (approve / reject / executing / completed) ──────────
export async function setGrowthPlanStatus(
  id: string,
  status: PlanStatus,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!isUuid(id)) return { ok: false, error: 'Invalid plan id.' }
    if (!VALID_STATUSES.includes(status)) return { ok: false, error: `Invalid status "${status}".` }

    const patch: Record<string, unknown> = { status }
    if (status === 'approved') patch.approved_at = new Date().toISOString()
    if (status === 'rejected') patch.approved_at = null

    const db = supabaseAdmin()
    const { error } = await db.from(PLANS_TABLE).update(patch).eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error updating plan' }
  }
}

// ── List recent plans ───────────────────────────────────────────────────────────
export async function listGrowthPlans(
  limit = 10,
): Promise<{ ok: boolean; plans: GrowthPlan[]; error?: string }> {
  try {
    const db = supabaseAdmin()
    const { data, error } = await db
      .from(PLANS_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 25))

    if (error) return { ok: false, plans: [], error: error.message }
    return { ok: true, plans: (data ?? []) as GrowthPlan[] }
  } catch (err) {
    return { ok: false, plans: [], error: err instanceof Error ? err.message : 'Unknown error listing plans' }
  }
}

export function formatPlansForAI(plans: GrowthPlan[]): string {
  if (!plans.length) {
    return 'No growth plans stored yet. Propose one with proposeGrowthPlan after analyzing the radar or the market.'
  }
  const blocks = plans.map(p => {
    const date = new Date(p.created_at).toUTCString().slice(0, 16)
    return `• [${p.status.toUpperCase()}] "${p.title}" (id: ${p.id}, created ${date})
  Objective: ${p.objective}
  Plan: ${p.plan.slice(0, 400)}${p.plan.length > 400 ? '…' : ''}`
  })
  return `GROWTH PLANS (live from database, newest first):

${blocks.join('\n\n')}`
}

// ── Execute: create an outreach draft in the existing pipeline ─────────────────
// Drafts enter as status 'pending' — they still pass through the outreach
// system's approval, guardrails, daily limits, and audit before anything sends.
//
// HONESTY RULE: a draft is created ONLY if a real, published contact email is
// found on the target's own website. If none is found, the company is SKIPPED
// (no draft, ok:false + skipped:true). COS never invents or guesses an address —
// there is nothing to send to, so nothing is queued.
export async function createOutreachDraft(params: {
  businessName: string
  businessUrl: string
  message: string
  senderKey?: string
}): Promise<{ ok: boolean; outreachId?: string; skipped?: boolean; contactEmail?: string; error?: string }> {
  try {
    const businessName = String(params.businessName || '').trim().slice(0, 200)
    const businessUrl = String(params.businessUrl || '').trim().slice(0, 500)
    const message = String(params.message || '').trim()

    if (!businessName || !message) {
      return { ok: false, error: 'businessName and message are required.' }
    }
    if (!businessUrl || !/^https?:\/\//i.test(businessUrl)) {
      return { ok: false, error: 'businessUrl is required and must start with http(s):// — ask the owner for the target\'s website if unknown.' }
    }

    // Same safety gate the rest of the outreach system uses.
    const safe = assertSafeOutreachMessage(message)
    if (!safe.ok) {
      return { ok: false, error: `Message rejected by outreach guardrails: ${safe.reason}` }
    }

    // Find a REAL published email on the target's site. No email => SKIP.
    const found = await findContactEmail(businessUrl)
    if (!found.email) {
      return {
        ok: false,
        skipped: true,
        error: `No published contact email found for ${businessName} (${businessUrl}) — skipped, not queued. COS does not invent addresses.`,
      }
    }

    // COS's per-message sender choice (sales vs marketing, etc.), validated.
    const senderKey = VALID_SENDER_KEYS.includes(String(params.senderKey || '')) ? String(params.senderKey) : null

    const db = supabaseAdmin()
    const { data, error } = await db
      .from(OUTREACH_TABLE)
      .insert({
        business_id: null,
        source_platform: 'strategist',
        business_name: businessName,
        business_url: businessUrl,
        contact_email: found.email,
        sender_key: senderKey,
        outreach_message: message + outreachComplianceFooter(),
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, outreachId: data.id, contactEmail: found.email }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error creating outreach draft' }
  }
}
