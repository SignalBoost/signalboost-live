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
import { classifyPublicationTarget, publicationSkipReason } from '@/lib/outreach/publicationTargets'
import { classifyTargetName } from '@/lib/outreach/targetNameQuality'

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

// Translate the COS-written message into the target's native language. Falls back to the
// original English on any failure — never blocks a draft, never fabricates.
// Exported for the draft-refresh path: a refreshed message must be localized and
// footered by the SAME code that finishes a new draft, or the two diverge silently.
export async function localizeMessage(message: string, lang: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const name = LANG_NAMES[lang]
  if (!apiKey || !name) return message
  try {
    const client = new Anthropic({ apiKey })
    const resp = await client.messages.create({
      model: process.env.MARKETING_SALES_MODEL || 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: `Translate the user's outreach email into natural, native ${name}. Preserve meaning, tone, names, links, and line breaks. Do not add or remove content. Output ONLY the translation with no preamble.`,
      messages: [{ role: 'user', content: message }],
    })
    const out = resp.content.map((b: any) => (b?.type === 'text' ? b.text : '')).join('').trim()
    return out || message
  } catch { return message }
}

// Same rule the send routes apply, so a supplied address must clear exactly the bar a
// discovered one does: real shape, and not a role box that no human reads.
function cleanEmail(value: unknown): string | null {
  const email = String(value || '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  const local = email.split('@')[0]
  if (['test', 'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'privacy', 'legal', 'abuse', 'security'].includes(local)) return null
  return email
}
export async function createOutreachDraft(params: {
  businessName: string
  businessUrl: string
  message: string
  senderKey?: string
  // A publicly listed business address the CALLER already verified — from a researched
  // prospect list, a CRM export, or a media database. Without this the finder crawls the
  // site and skips the company when it finds nothing, discarding an address a human had
  // already confirmed. It is still validated by cleanEmail, so a junk or role-blocked
  // address is refused exactly as a discovered one would be; supplying it only skips the
  // crawl, it never lowers the bar.
  contactEmail?: string
  // What is being sold. Duplicate protection is scoped to this, so the same company can
  // be approached again for a DIFFERENT product but never twice for the same one.
  productKey?: string
  // WHICH RUN PRODUCED THIS ROW. Optional, because drafts are also created one at a time
  // by a person, and those genuinely have no job behind them.
  //
  // Until this existed, a queue row carried no link to the campaign that created it. The
  // only way to answer "what did that job put in my queue" was to read the job's results
  // and match business_url hosts back — a reconstruction, and one that silently misses a
  // row whose URL was normalised differently or matches a domain two candidates share.
  // A misrouted campaign then could not be undone as a unit, which is the first thing a
  // buyer's data-governance review asks of anything that writes contact records.
  campaignJobId?: string | null
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

    // A caller-supplied address is used when it passes the same quality gate as a
    // discovered one; otherwise fall back to crawling the site. No email => SKIP.
    const supplied = cleanEmail(String(params.contactEmail || ''))
    const found = supplied ? { email: supplied } : await findContactEmail(businessUrl)
    if (!found.email) {
      return {
        ok: false,
        skipped: true,
        error: params.contactEmail
          ? `The address supplied for ${businessName} (${params.contactEmail}) is not a usable business contact — skipped, not queued.`
          : `No published contact email found for ${businessName} (${businessUrl}) — skipped, not queued. COS does not invent addresses.`,
      }
    }

    // PUBLICATIONS DO NOT BELONG IN THIS PIPELINE. Checked AFTER the address is resolved,
    // because the strongest signal is the inbox the mail would actually land in: a message to
    // editor@, letters@, news@ or guest@ reaches a desk that decides what to publish, never a
    // desk that buys software.
    //
    // This is not a quality filter, it is a routing rule. Business Insider was queued here as a
    // prospect and an editorial address at another company was already SENT to — the copy read
    // as a press pitch, signed by the sales desk, with an unsubscribe footer. A press pitch that
    // arrives as cold sales spends a relationship with an outlet you wanted covering the launch,
    // and unlike a bad draft it cannot be recalled. So the sales path refuses outright and says
    // where the target belongs instead of quietly dropping it.
    const publicationVerdict = classifyPublicationTarget({ businessName, businessUrl, contactEmail: found.email })
    if (publicationVerdict.isPublication) {
      return { ok: false, skipped: true, error: publicationSkipReason(businessName, publicationVerdict) }
    }

    // IS THIS A COMPANY, OR THE TITLE OF A PAGE? Discovery scrapes a page title into
    // business_name, and the copy is then written TO that title. Live rows already sent include
    // "Brazil's Fintech Revolution" (an article, delivered to an investment firm's press desk)
    // and "The 20 Health Tech Leaders In Latin America You Should Know". The aggregator check
    // below only recognises "top 10" and "best 5" shapes and missed every one of them.
    const nameVerdict = classifyTargetName({ businessName, businessUrl })
    if (nameVerdict.looksLikePageTitle) {
      return { ok: false, skipped: true, error: nameVerdict.reason }
    }

    // DEDUPE BY HOST. The same company was being queued more than once under slightly
    // different display names, because nothing checked whether it was already in the
    // queue. A second draft to the same company is at best a wasted slot and at worst
    // a second cold email to a recipient who already received one.
    const db0 = supabaseAdmin()
    let host = ''
    try { host = new URL(businessUrl).hostname.replace(/^www\./i, '').toLowerCase() } catch { host = '' }
    if (host) {
      const { data: dupes } = await db0
        .from(OUTREACH_TABLE)
        .select('id,business_url,status,product_key,created_at')
        .neq('status', 'rejected')
        .ilike('business_url', `%${host}%`)
        .limit(25)
      const wantedProduct = productKeyOf(params.productKey)
      const clash = (dupes || []).find(row => {
        // Same company AND same product. A different product is a legitimate new pitch.
        if (productKeyOf((row as any).product_key) !== wantedProduct) return false
        try { return new URL(String(row.business_url || '')).hostname.replace(/^www\./i, '').toLowerCase() === host } catch { return false }
      })
      if (clash) {
        return {
          ok: false,
          skipped: true,
          error: `${businessName} (${host}) is already in the outreach queue for this product as ${clash.id} with status ${clash.status} — not queued again. A different product is allowed.`,
        }
      }

      // "A DIFFERENT PRODUCT IS ALLOWED" HAD NO CEILING, AND ONE ADDRESS RECEIVED FOUR COLD
      // EMAILS. kastmedia.com sits in the live queue six times — four sent, two pending —
      // because every new product re-queued a company already contacted. The per-product rule
      // is right in principle and was the whole rule in practice.
      //
      // Two limits, both about the RECIPIENT rather than about our campaigns. A company hears
      // from us at most twice in total, and never twice inside a month. Frequency is what the
      // person on the other end experiences; which product each message happened to be about
      // is an internal detail they neither see nor care about.
      const sameHost = (dupes || []).filter(row => {
        try { return new URL(String(row.business_url || '')).hostname.replace(/^www\./i, '').toLowerCase() === host } catch { return false }
      })
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
      const recent = sameHost.find(row => {
        const at = Date.parse(String((row as any).created_at || ''))
        return Number.isFinite(at) && at >= cutoff
      })
      if (recent) {
        return {
          ok: false,
          skipped: true,
          error: `${businessName} (${host}) was already contacted within the last 30 days as ${recent.id} — not queued again. A company hears from us at most once a month, whatever the product.`,
        }
      }
      if (sameHost.length >= 2) {
        return {
          ok: false,
          skipped: true,
          error: `${businessName} (${host}) already has ${sameHost.length} outreach records — not queued again. Two approaches is the ceiling per company; a third reads as pestering rather than persistence.`,
        }
      }
    }

    // AGGREGATOR / LISTICLE REJECTION. The background worker already refuses these,
    // but this path is COS choosing a target itself from a search result, and a
    // "Top N providers" listing page was repeatedly queued as if it were a company.
    // A directory page is a list OF providers, not a provider, so the email lands on
    // whoever runs the list rather than on a prospect.
    const AGGREGATOR_TITLE = /\b(top\s*\d+|best\s+\d+|\d+\s+best|comparison|database|directory|ranking|list of|guide to|companies\b.*\b(list|ranking))\b/i
    const AGGREGATOR_HOST = ['directory', 'directories', 'companies', 'firms', 'providers', 'database', 'ranking', 'listing', 'toplist', 'compare', 'reviews']
    let aggHost = ''
    try { aggHost = new URL(businessUrl).hostname.replace(/^www\./i, '').toLowerCase() } catch { aggHost = '' }
    if (AGGREGATOR_TITLE.test(businessName) || AGGREGATOR_HOST.some(hint => aggHost.includes(hint))) {
      return {
        ok: false,
        skipped: true,
        error: `"${businessName}" (${businessUrl}) looks like a directory or ranking page, not a company — not queued. Give the prospect's own website instead.`,
      }
    }

    // COS's per-message sender choice (sales vs marketing, etc.), validated.
    const senderKey = VALID_SENDER_KEYS.includes(String(params.senderKey || '')) ? String(params.senderKey) : null

    // Standing directive enforced in code: localize the outbound message to the target's
    // region (Brazil→pt, Spanish-speaking LATAM→es, Poland→pl, Russia→ru; else English).
    // The COS writes English; this guaranteed chokepoint makes the prompt irrelevant.
    const targetLang = await detectTargetLanguage(businessUrl, businessName)
    const localizedMessage = targetLang === 'en' ? message : await localizeMessage(message, targetLang)

    const db = supabaseAdmin()
    const { data, error } = await db
      .from(OUTREACH_TABLE)
      .insert({
        business_id: null,
        source_platform: 'strategist',
        business_name: businessName,
        business_url: businessUrl,
        contact_email: found.email,
        product_key: productKeyOf(params.productKey),
        // Null for a hand-made draft, a job id for a campaign-made one. Both are honest;
        // an invented placeholder would not be.
        campaign_job_id: params.campaignJobId || null,
        sender_key: senderKey,
        outreach_message: localizedMessage + outreachComplianceFooter(senderKey),
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
