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
import { productKeyOf } from '@/lib/outreach/recipientHistory'
import Anthropic from '@anthropic-ai/sdk'
import { pickOutreachLanguage } from '@/lib/outreach/regionLanguage'

const PLANS_TABLE = 'growth_plans'
const OUTREACH_TABLE = 'outreach_queue'

// CAN-SPAM + trust: every message must carry a real signer, the business's
// physical mailing address (legally required for US commercial email), and a
// plain opt-out. COS writes only the body; this footer is appended in code so it
// is guaranteed on every draft no matter what the model produced. Set the address
// once in Vercel as OUTREACH_PHYSICAL_ADDRESS.
/**
 * Finishes a raw drafted body exactly as createOutreachDraft does: localized to the
 * target's language, then the compliance footer. Used by the refresh path so an updated
 * draft is indistinguishable from a freshly created one.
 */
export async function finishOutreachBody(input: { message: string; businessUrl: string; businessName?: string; senderKey: string | null }): Promise<string> {
  // Same argument shape the create path uses (line ~187). Passing the bare URL compiled
  // as `any` in this non-strict repo and would have silently selected the wrong language
  // for every refreshed draft — caught by re-running tsc with the path alias RESOLVING,
  // which the first check did not do.
  const targetLang = pickOutreachLanguage({ url: input.businessUrl, name: input.businessName || '', text: input.message })
  const localized = targetLang === 'en' ? input.message : await localizeMessage(input.message, targetLang)
  return localized + outreachComplianceFooter(input.senderKey)
}

function outreachComplianceFooter(_senderKey: string | null): string {
  const addr = String(process.env.OUTREACH_PHYSICAL_ADDRESS || '').trim()
  // THE TEAM NAME USED TO BE WRITTEN HERE TOO, AND IT PRODUCED TWO SIGN-OFFS IN EVERY
  // REAL EMAIL. This footer is added at DRAFT time; applyOutreachSignature adds the
  // closing block at SEND time and guarantees the team line, the contact address and
  // the link are the last thing in the message. Its de-duplication walks the message
  // from the END, so it stopped at the unsubscribe sentence and never saw the team
  // line sitting above it — the recipient got "— The SignalBoost Sales Team" twice.
  //
  // Only what the send-time block does NOT provide belongs here: the physical mailing
  // address CAN-SPAM requires, and the opt-out. One writer per line, no overlap.
  const out: string[] = ['']
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
const LANG_NAMES: Record<string, string> = { pt: 'Brazilian Portuguese', es: 'Spanish', pl: 'Polish', ru: 'Russian' }

// Detect the target's region language from its OWN website content (script + signals),
// so a generically-named Polish/Russian/Brazilian firm is still classified correctly.
async function detectTargetLanguage(businessUrl: string, businessName: string): Promise<string> {
  let text = ''
  try {
    const res = await fetch(businessUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SignalBoost/1.0)' } })
    if (res.ok) text = (await res.text()).replace(/<[^>]+>/g, ' ').slice(0, 8000)
  } catch { /* best-effort: fall back to url+name signals */ }
  return pickOutreachLanguage({ url: businessUrl, name: businessName, text })
}

// Translate the COS-written message into the target's native
