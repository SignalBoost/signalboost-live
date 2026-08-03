// saas/lib/outreach/refreshDrafts.ts
//
// REWRITE PENDING DRAFTS WITH THE CURRENT PRODUCT FACTS — WITHOUT LOSING THE RECIPIENTS.
//
// About a hundred drafts were written before the manifests were corrected. They describe
// the Supervisor as monitoring software, omit that it repairs anything, and say nothing
// about the execution channels or the transactional boundary. Approving them would send
// the weakest version of the pitch to a hundred companies, each of which can only be
// approached once for this product.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY REWRITE RATHER THAN DELETE AND RE-RUN
//
// Deleting is SAFE — verified, not assumed. getRecipientHistory only reports `contacted`
// when a row exists in outreach_sends, so an unsent queue row blocks nothing and those
// companies could be approached again. But safe is not the same as free: the expensive
// part of a campaign is not the writing, it is the DISCOVERY — finding the company,
// finding a published address, and clearing the role-box and listicle filters. Deleting
// throws that away and pays for it twice, and a second discovery pass would not
// necessarily return the same hundred companies.
//
// So this rewrites the BODY and leaves the recipient, the address, the product key and
// the row id exactly where they are.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IT WILL NOT DO
//
//   · Touch anything but a 'pending' row. Sent, approved, archived and rejected rows are
//     historical records; rewriting one would falsify what was actually sent.
//   · Guess a product. A row whose product_key matches no manifest is skipped and
//     reported, never rewritten against a product it might not be selling.
//   · Discard the old body. It is returned in the report before the write, so a bad
//     refresh can be reasoned about rather than mourned.
//   · Write anything at all in dryRun mode, which is the default.

import { createClient } from '@supabase/supabase-js'
import { manifestsForOffer } from '@/lib/portable-products/matchManifests'
import { productKeyOf } from '@/lib/outreach/recipientHistory'
import { draftMessageFor } from '@/lib/outreach/prospectCampaign'
import { finishOutreachBody } from '@/lib/ai/growthPlans'

const TABLE = 'outreach_queue'

export interface RefreshOutcome {
  outreachId: string
  businessName: string
  contactEmail: string
  status: 'refreshed' | 'skipped' | 'failed'
  reason: string
  productKey: string | null
  previousMessage?: string
  newMessage?: string
}

export interface RefreshReport {
  ok: boolean
  dryRun: boolean
  examined: number
  refreshed: number
  skipped: number
  failed: number
  outcomes: RefreshOutcome[]
  error?: string
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

// Matching lives in lib/portable-products/matchManifests so the campaign worker and this
// refresh agree on what an offer refers to. The first version compared slugs exactly and
// therefore skipped EVERY row in a real queue: those campaigns sell two products, so the
// product_key was a combined slug matching no single manifest. An unmatched key still
// means skip — a campaign selling something the manifests do not describe gets no rewrite
// rather than a rewrite against the closest-looking product.

export async function refreshPendingDrafts(options: {
  dryRun?: boolean
  limit?: number
  productKey?: string | null
} = {}): Promise<RefreshReport> {
  const dryRun = options.dryRun !== false
  const limit = Math.max(1, Math.min(options.limit ?? 200, 500))
  const empty: RefreshReport = { ok: false, dryRun, examined: 0, refreshed: 0, skipped: 0, failed: 0, outcomes: [] }

  const db = admin()
  if (!db) return { ...empty, error: 'Supabase service credentials are not configured.' }

  let query = db.from(TABLE)
    .select('id,business_name,business_url,contact_email,product_key,sender_key,outreach_message')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (options.productKey) query = query.eq('product_key', productKeyOf(options.productKey))

  const { data: rows, error } = await query
  if (error) return { ...empty, error: error.message }

  const outcomes: RefreshOutcome[] = []

  for (const row of rows || []) {
    const base = {
      outreachId: row.id as string,
      businessName: String(row.business_name || ''),
      contactEmail: String(row.contact_email || ''),
      productKey: (row.product_key as string) || null,
    }

    const manifests = manifestsForOffer(row.product_key)
    if (!manifests.length) {
      outcomes.push({ ...base, status: 'skipped', reason: `No product manifest matches product_key "${row.product_key || '(none)'}", so there are no current facts to rewrite it with.` })
      continue
    }
    if (!row.business_url) {
      outcomes.push({ ...base, status: 'skipped', reason: 'Row has no business_url, so the message cannot be localized to the recipient.' })
      continue
    }

    try {
      // A synthetic job carrying the SAME fields the campaign worker passes. The offer is
      // the manifest displayName, which is exactly what offerProfileFor matches on, so the
      // full fact sheet — category, capabilities, execution modes, exclusions — reaches
      // the prompt. targetAudience stands in for the original brief's targeting line: the
      // brief is not stored on the row, and the manifest's own audience is a truthful
      // substitute rather than an invented one.
      // Every product this row sells, so a two-product campaign is rewritten as a
      // two-product email rather than losing one of them.
      const audience = Array.from(new Set(manifests.flatMap(item => item.targetAudience)))
      const job: any = {
        offer: manifests.map(item => item.displayName).join(' and '),
        target_criteria: audience.length
          ? audience.map(entry => entry.replace(/[-_]/g, ' ')).join(', ')
          : 'companies that would benefit from this product',
        language: 'en',
        region: '',
        requested_count: 1,
      }
      const candidate: any = { name: base.businessName, url: String(row.business_url), snippet: '' }

      const drafted = await draftMessageFor(job, candidate)
      if (!drafted || drafted.length < 40) {
        outcomes.push({ ...base, status: 'failed', reason: 'The regenerated message came back empty or too short; the existing draft was left untouched.' })
        continue
      }

      const finished = await finishOutreachBody({
        message: drafted,
        businessUrl: String(row.business_url),
        businessName: base.businessName,
        senderKey: (row.sender_key as string) || 'saasSales',
      })

      if (dryRun) {
        outcomes.push({ ...base, status: 'refreshed', reason: 'Dry run — nothing was written.', previousMessage: String(row.outreach_message || ''), newMessage: finished })
        continue
      }

      const { error: writeError } = await db.from(TABLE)
        .update({ outreach_message: finished })
        // Re-asserting status here is deliberate: if a person approved this row while the
        // refresh was running, the update finds nothing and their approved copy survives.
        .eq('id', row.id)
        .eq('status', 'pending')

      if (writeError) {
        outcomes.push({ ...base, status: 'failed', reason: writeError.message })
        continue
      }
      outcomes.push({ ...base, status: 'refreshed', reason: 'Rewritten with the current product facts.', previousMessage: String(row.outreach_message || ''), newMessage: finished })
    } catch (err: any) {
      outcomes.push({ ...base, status: 'failed', reason: String(err?.message || err || 'Unknown error while regenerating.') })
    }
  }

  return {
    ok: true,
    dryRun,
    examined: outcomes.length,
    refreshed: outcomes.filter(item => item.status === 'refreshed').length,
    skipped: outcomes.filter(item => item.status === 'skipped').length,
    failed: outcomes.filter(item => item.status === 'failed').length,
    outcomes,
  }
}
