// saas/press-media-host/engine.ts
// Press & Media portable — the host engine. Provider-agnostic run + dispatch that reuses
// SignalBoost's existing press_campaigns table and the PressOutreachStudio owner-approval
// queue. The engine never knows which provider it is talking to (registry + adapter contract
// do that), so adding pr_wire / ad_platform / direct_io later needs ZERO engine changes.
//
// Flow (runCampaign):  validateTarget → generate → estimateCost → SPEND GATE → persist
//                      (pending_owner_review by default) → dispatch through the adapter only
//                      when cleared → provider-shaped proof → two-stage owner notify.
//
// Doctrine honored: free (cost 0) bypasses the spend gate; paid never auto-dispatches
// without explicit owner budget approval; proof is provider-shaped (no universal instant
// URL); real targets only (the adapter's validateTarget decides); nothing is published
// silently — the owner records the real link later via recordPublishedUrl.
import { findPlaceholders } from '@/press-media-core'
import { withMediaContact } from './media-contact.ts'
import type {
  MediaProviderRegistry, PortBundle, CampaignBrief, MediaTarget, MediaCampaign,
  MediaTargetType, DispatchState, CostEstimate,
} from '@/press-media-core'
import {
  getPressAdminClient, editorEmailFrom,
  type PressCampaign, type PressCampaignStatus, type PressMediaTargetType, type PressCampaignRole,
} from '@/lib/agency/pressOutreach'

export interface PressMediaContext {
  registry: MediaProviderRegistry
  ports: PortBundle
}

// Emit a SIEM/audit record for a dispatch (send to a journalist / post / filed order).
// Optional: only fires when the host installed ports.audit (a PortableAuditSink). Never
// throws — audit export must not affect a dispatch. This is enterprise checklist #6 for press.
async function auditDispatch(
  ctx: PressMediaContext,
  campaignId: string,
  providerId: string,
  result: { state: DispatchState; ref: string; detail?: string },
  targetType?: string,
): Promise<void> {
  const failed = result.state === 'failed' || result.state === 'rejected'
  await ctx.ports.audit
    ?.record({
      eventId: `press_${campaignId}_${result.ref || result.state}`,
      eventType: failed ? 'press.dispatch_failed' : 'press.dispatched',
      occurredAt: new Date().toISOString(),
      dataset: 'press',
      category: 'process',
      subjectId: campaignId,
      payload: {
        providerId,
        state: result.state,
        ...(result.ref ? { dispatchRef: result.ref } : {}),
        ...(targetType ? { targetType } : {}),
        ...(result.detail ? { detail: result.detail } : {}),
      },
    })
    .catch(() => {})
}

export interface RunCampaignArgs {
  providerId?: string              // default 'free_submission'
  brief: CampaignBrief
  target: MediaTarget
  manualCopy?: string              // the owner's own copy — when supplied, the AI is not used at all
  ownerApproved?: boolean          // an owner is acting (or override token validated upstream)
  ownerBudgetApproved?: boolean    // explicit budget sign-off — REQUIRED to auto-dispatch a paid provider
  autoDispatch?: boolean           // if cleared, send now instead of only queuing for approval
  createdByRole?: PressCampaignRole
}

export interface RunCampaignResult {
  ok: boolean
  campaignId?: string
  status?: PressCampaignStatus
  state?: DispatchState | 'gated' | 'blocked' | 'queued'
  cost?: CostEstimate
  proofPending?: boolean
  creative?: string                // the draft, so the owner can read it before it is sent
  placeholders?: string[]          // unfilled [FACTS] the generator refused to invent
  ref?: string
  reason?: string
  error?: string
}

const PRESS_TARGETS = new Set<PressMediaTargetType>(['newspaper_print', 'magazine_print', 'digital_press'])
const SOURCE_PREFIX = 'press-media:'

// Map the 5 core target types onto the 3 the press_campaigns table accepts.
function toPressTarget(t: MediaTargetType): PressMediaTargetType {
  if (t === 'trade_press') return 'magazine_print'
  if (t === 'broadcast') return 'digital_press'
  return PRESS_TARGETS.has(t as PressMediaTargetType) ? (t as PressMediaTargetType) : 'digital_press'
}

// Dispatch outcome → press_campaigns status. 'submitted'/'scheduled' = handed to the
// provider, publication is its call → 'approved' (dispatched, proof pending).
function stateToStatus(state: DispatchState): PressCampaignStatus {
  if (state === 'published') return 'published'
  if (state === 'rejected' || state === 'failed') return 'pending_owner_review'
  return 'approved'
}

function providerIdFromSource(source?: string | null): string {
  const s = String(source || '')
  return s.startsWith(SOURCE_PREFIX) ? s.slice(SOURCE_PREFIX.length) : 'free_submission'
}

function targetContact(target: MediaTarget): string {
  return String(target.editorEmail || target.submitFormUrl || '').trim()
}

// Reconstruct a core MediaCampaign from a stored press_campaigns row (for dispatch-on-approve).
function campaignFromRow(row: PressCampaign, providerId: string): MediaCampaign {
  const editorEmail = editorEmailFrom(row)
  const target: MediaTarget = {
    mediaTargetType: (row.media_target_type as MediaTargetType) || 'digital_press',
    publicationName: row.publication_name || undefined,
    editorEmail: editorEmail || undefined,
  }
  return {
    id: row.id,
    providerId,
    target,
    creative: row.content_body || row.article_notes || '',
    brief: { goal: row.headline || '', ctaUrl: row.cta_url || undefined },
  }
}
// ── runCampaign: generate → validate → cost → gate → persist → (dispatch if cleared) ──
export async function runCampaign(ctx: PressMediaContext, args: RunCampaignArgs): Promise<RunCampaignResult> {
  const providerId = args.providerId || 'free_submission'
  const adapter = ctx.registry.get(providerId)
  if (!adapter) return { ok: false, error: 'unknown_provider' }

  // 1) Real targets only — the adapter decides what "real" means for its channel.
  const check = await adapter.validateTarget(args.target, ctx.ports)
  if (!check.ok) return { ok: false, state: 'blocked', reason: check.reason || 'invalid_target' }

  // 2) Copy. Manual is a FIRST-CLASS choice, not a fallback: if the owner supplied their own
  //    text the AI is never called. Otherwise generate through the injected AiPort.
  const manual = String(args.manualCopy || '').trim()
  const generated = manual || (await adapter.generate(args.brief, ctx.ports).then((g) => (g?.creative || '').trim()).catch(() => ''))

  //    THE MEDIA CONTACT BLOCK IS ADDED HERE, NOT ASKED FOR IN A PROMPT. Every provider's
  //    copy — generated or owner-supplied — passes through this one line, so an editor can
  //    always reach a person. withMediaContact appends nothing when the address is already
  //    in the copy, which is what stops the duplicate sign-off the outreach footer once
  //    shipped to real recipients.
  const creative = withMediaContact(generated)

  // 3) Cost + SPEND GATE. Free (0) bypasses; paid requires explicit owner budget approval.
  const preliminary: MediaCampaign = { id: '', providerId, target: args.target, creative, brief: args.brief }
  const cost = await adapter.estimateCost(preliminary, ctx.ports)
  const paid = cost.amount > 0
  const gated = paid && !args.ownerBudgetApproved

  // 4) Persist into the existing owner-approval queue. Default = pending_owner_review.
  const supabase = getPressAdminClient()
  const contact = targetContact(args.target)
  const publicationName = args.target.publicationName || 'Target publication'
  const now = new Date().toISOString()
  const row: any = {
    status: 'pending_owner_review' as PressCampaignStatus,
    created_by_role: (args.createdByRole || 'staff') as PressCampaignRole,
    media_target_type: toPressTarget(args.target.mediaTargetType),
    publication_contact: `${publicationName} — ${contact || 'contact pending'}`,
    content_body: creative || '(draft — generation pending; owner may edit before dispatch)',
    processing_state: 'free_organic_distribution',
    source: `${SOURCE_PREFIX}${providerId}`,
    channel: adapter.describe().type,
    publication_name: publicationName,
    editor_contact: contact || null,
    headline: args.brief.goal ? args.brief.goal.slice(0, 140) : null,
    article_notes: creative || null,
    cta_url: args.brief.ctaUrl || null,
    preview_sent_at: now,
    // §7 structured columns — provider identity + the estimate the spend gate ruled on.
    provider_id: providerId,
    provider_type: adapter.describe().type,
    cost_estimate: cost.amount,
    cost_currency: cost.currency,
    spend_approved_at: paid && args.ownerBudgetApproved ? now : null,
  }

  const { data: inserted, error: insertError } = await supabase.from('press_campaigns').insert(row).select('*').single()
  if (insertError) return { ok: false, error: insertError.message }
  const stored = inserted as PressCampaign

  // 5) Clear to dispatch now? Only when generated, owner-approved, auto-dispatch requested,
  //    and either free or budget-approved. Otherwise it waits in the approval queue.
  const cleared = Boolean(creative) && Boolean(args.ownerApproved) && Boolean(args.autoDispatch) && (!paid || Boolean(args.ownerBudgetApproved))
  if (!cleared) {
    return {
      ok: true,
      campaignId: stored.id,
      creative,
      placeholders: findPlaceholders(creative),
      status: 'pending_owner_review',
      state: gated ? 'gated' : 'queued',
      cost,
      proofPending: true,
      reason: gated ? 'budget_approval_required' : undefined,
    }
  }

  // 6) Dispatch through the adapter (it emails / posts / files the order via the Ports and
  //    fires the first-stage owner notify itself). Then read provider-shaped proof.
  const campaign: MediaCampaign = { ...preliminary, id: stored.id }
  const result = await adapter.dispatch(campaign, ctx.ports)
  const status = stateToStatus(result.state)
  const proof = await adapter.fetchProof(result.ref, ctx.ports).catch(() => null)
  await auditDispatch(ctx, stored.id, adapter.describe().id, result, args.target?.mediaTargetType)

  const update: any = {
    status,
    updated_at: new Date().toISOString(),
    dispatch_ref: result.ref || null,
    dispatch_state: result.state,
    proof_type: proof ? proof.proofType : null,
    proof_payload: proof && proof.payload != null ? proof.payload : null,
  }
  if (result.state === 'scheduled') update.scheduled_at = new Date().toISOString()
  if (result.state === 'published') update.published_at = new Date().toISOString()
  await supabase.from('press_campaigns').update(update).eq('id', stored.id)

  return {
    ok: result.state !== 'failed' && result.state !== 'rejected',
    campaignId: stored.id,
    status,
    state: result.state,
    cost,
    ref: result.ref,
    proofPending: proof ? proof.pending : true,
    reason: result.detail,
  }
}

// ── dispatchApprovedCampaign: owner approved a queued campaign → send it through its
//    provider adapter (drop-in for the approve action so paid providers route correctly). ──
export async function dispatchApprovedCampaign(ctx: PressMediaContext, campaignId: string): Promise<RunCampaignResult> {
  const supabase = getPressAdminClient()
  const { data, error } = await supabase.from('press_campaigns').select('*').eq('id', campaignId).single()
  if (error || !data) return { ok: false, error: error?.message || 'campaign_not_found' }
  const stored = data as PressCampaign

  const providerId = providerIdFromSource(stored.source)
  const adapter = ctx.registry.get(providerId) || ctx.registry.get('free_submission')
  if (!adapter) return { ok: false, error: 'unknown_provider' }

  const campaign = campaignFromRow(stored, adapter.describe().id)
  const result = await adapter.dispatch(campaign, ctx.ports)
  const status = stateToStatus(result.state)
  const proof = await adapter.fetchProof(result.ref, ctx.ports).catch(() => null)
  await auditDispatch(ctx, stored.id, providerId, result)

  const approvedAt = new Date().toISOString()
  const update: any = {
    status,
    updated_at: approvedAt,
    dispatch_ref: result.ref || null,
    dispatch_state: result.state,
    proof_type: proof ? proof.proofType : null,
    proof_payload: proof && proof.payload != null ? proof.payload : null,
  }
  // The owner approving a paid campaign IS the budget sign-off — record when it happened.
  const storedRow = stored as any
  if (!storedRow.spend_approved_at && Number(storedRow.cost_estimate || 0) > 0) update.spend_approved_at = approvedAt
  if (result.state === 'scheduled') update.scheduled_at = approvedAt
  if (result.state === 'published') update.published_at = approvedAt
  await supabase.from('press_campaigns').update(update).eq('id', stored.id)

  return {
    ok: result.state !== 'failed' && result.state !== 'rejected',
    campaignId: stored.id,
    status,
    state: result.state,
    ref: result.ref,
    proofPending: proof ? proof.pending : true,
    reason: result.detail,
  }
}

// ── recordPublishedUrl: owner records the REAL published link later (resolves the
//    maybe-URL proof for free submissions). Fires the second-stage 'published' notify. ──
export async function recordPublishedUrl(ctx: PressMediaContext, campaignId: string, url: string): Promise<RunCampaignResult> {
  const clean = String(url || '').trim()
  if (!/^https?:\/\//i.test(clean)) return { ok: false, error: 'invalid_url' }

  const supabase = getPressAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('press_campaigns')
    .update({ status: 'published' as PressCampaignStatus, published_url: clean, published_at: now, updated_at: now, dispatch_state: 'published' })
    .eq('id', campaignId)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message || 'campaign_not_found' }
  const stored = data as PressCampaign

  const providerId = providerIdFromSource(stored.source)
  const campaign = campaignFromRow(stored, providerId)
  await ctx.ports.notify
    .notifyOwner('published', campaign, { proofType: 'maybe_url', payload: { url: clean }, pending: false })
    .catch(() => {})

  return { ok: true, campaignId: stored.id, status: 'published', state: 'published', proofPending: false }
}

// ── updateCampaignCopy: the owner edits a queued draft before it goes anywhere. This is the
//    review step that keeps an unverified sentence from reaching a journalist. ──
export async function updateCampaignCopy(ctx: PressMediaContext, campaignId: string, copy: string): Promise<RunCampaignResult> {
  const body = String(copy || '').trim()
  if (!body) return { ok: false, error: 'copy_required' }

  const supabase = getPressAdminClient()
  const { data, error } = await supabase
    .from('press_campaigns')
    .update({ content_body: body, article_notes: body, updated_at: new Date().toISOString() })
    .eq('id', campaignId)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message || 'campaign_not_found' }

  return {
    ok: true,
    campaignId: (data as PressCampaign).id,
    status: (data as PressCampaign).status,
    creative: body,
    placeholders: findPlaceholders(body),
  }
}
