// saas/app/api/agency/press-dispatch/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import {
  dispatchPressReleaseToEditor,
  getPressAdminClient,
  ownerOverrideIsValid,
  runLocalPressDistributionWorker,
  validatePressCampaignInput,
  type PressCampaign,
} from '@/lib/agency/pressOutreach'

export const dynamic = 'force-dynamic'

const RATE_WINDOW_MS = 10 * 60_000
const RATE_MAX = 4
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function clientIpKey(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || ''
  const first = forwarded.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'unknown'
}

function rateLimited(key: string) {
  const now = Date.now()
  const existing = rateBuckets.get(key)
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  existing.count += 1
  if (existing.count % 50 === 0 || rateBuckets.size > 5000) {
    for (const [bucketKey, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(bucketKey)
  }
  return existing.count > RATE_MAX
}

type DispatchResult = {
  campaign: PressCampaign
  execution_locked: boolean
  proof_email?: unknown
  preview_email?: unknown
  editor_dispatch?: unknown
}

export async function GET() {
  try {
    const supabase = getPressAdminClient()
    const { data, error } = await supabase
      .from('press_campaigns')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(100)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ campaigns: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load press campaigns.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let input
  try {
    input = validatePressCampaignInput(await req.json())
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Invalid press campaign payload.' }, { status: 400 })
  }

  try {
    const access = await getAccess().catch(() => null)
    const actorIsOwner = Boolean(access?.isOwner)
    const ownerApproved = actorIsOwner || ownerOverrideIsValid(input.owner_override_token)
    const forceOwnerReview = Boolean((input as any).force_owner_review)
    const supabase = getPressAdminClient()

    if (input.campaign_id && (input as any).action === 'reject') {
      if (!ownerApproved) return NextResponse.json({ error: 'Owner approval required.' }, { status: 403 })
      const { data, error } = await supabase.from('press_campaigns').update({ status: 'rejected' }).eq('id', input.campaign_id).select('*').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ campaign: data, execution_locked: true })
    }

    if (input.campaign_id && ((input as any).action === 'approve' || ownerApproved)) {
      if (!ownerApproved) return NextResponse.json({ error: 'Owner approval required.' }, { status: 403 })
      // PUBLISHED IS THE EDITOR'S FACT, NOT A GO SIGNAL.
      //
      // This branch used to (a) invent a published_url pointing back at our own dashboard
      // whenever the owner did not supply one — the approval UI sends '' by default, so
      // that was the NORMAL path — and (b) write status='published' BEFORE attempting the
      // send, ignoring the result. A campaign therefore claimed an editor had run the
      // story before the email had left, carrying a proof link to our own cockpit, and
      // stayed 'published' even when the send failed outright.
      //
      // Approving means "send it". What we may record afterwards is only what happened:
      // dispatched (with the provider's message id as evidence), or not dispatched and
      // back in the queue. A real published URL — one the owner actually pasted — is the
      // only thing that may set 'published'.
      const suppliedUrl = String((input as any).published_url || (input as any).live_url || '').trim()
      const realUrl = /^https?:\/\//i.test(suppliedUrl) ? suppliedUrl : ''

      const { data: current, error: readError } = await supabase
        .from('press_campaigns').select('*').eq('id', input.campaign_id).single()
      if (readError || !current) return NextResponse.json({ error: readError?.message || 'campaign_not_found' }, { status: 404 })

      const editor_dispatch = await dispatchPressReleaseToEditor(current as PressCampaign)
      const now = new Date().toISOString()

      const update: any = { updated_at: now }
      if (realUrl) {
        update.status = 'published'
        update.published_url = realUrl
        update.published_at = now
        update.dispatch_state = 'published'
      } else if (editor_dispatch.ok) {
        update.status = 'approved'
        update.dispatch_state = 'submitted'
        if (editor_dispatch.ref) update.dispatch_ref = editor_dispatch.ref
      } else {
        // A FAILED SEND STAYS IN THE QUEUE WITH ITS REASON, so it can be retried and so
        // nothing claims to have gone out. A count without a cause is a guessing game.
        update.status = 'pending_owner_review'
        update.dispatch_state = editor_dispatch.skipped ? 'rejected' : 'failed'
      }

      const { data, error } = await supabase
        .from('press_campaigns').update(update).eq('id', input.campaign_id).select('*').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const campaign = data as PressCampaign
      const proof_email = await runLocalPressDistributionWorker(campaign, input.owner_email)
      return NextResponse.json({
        campaign,
        execution_locked: campaign.status === 'pending_owner_review',
        proof_email,
        editor_dispatch,
        published_url: realUrl || null,
        dispatched: Boolean(editor_dispatch.ok),
        reason: editor_dispatch.ok ? undefined : editor_dispatch.reason,
      })
    }

    if (!ownerApproved && rateLimited(`press-dispatch-create:${clientIpKey(req)}`)) {
      return NextResponse.json({ error: 'Too many press submissions from this network. Please try again later.' }, { status: 429 })
    }

    // An owner creating a campaign directly is authorising a SEND, not asserting that an
    // editor already ran the story. It used to insert status='published' with published_at
    // set, before any dispatch had been attempted — a brand new row claiming publication
    // with no URL and no send behind it. 'approved' is the honest word; the dispatch result
    // below then records whether it actually left.
    const ownerDirect = input.created_by_role === 'owner' && ownerApproved && !forceOwnerReview
    const status = ownerDirect ? 'approved' : 'pending_owner_review'
    const createdByRole = ownerDirect ? 'owner' : 'staff'
    const now = new Date().toISOString()
    const row: any = {
      status,
      created_by_role: createdByRole,
      media_target_type: input.media_target_type,
      publication_contact: input.publication_contact,
      content_body: input.content_body,
      processing_state: 'free_organic_distribution',
      source: (input as any).source || (ownerDirect ? 'manual_owner' : 'concierge_cos'),
      channel: (input as any).channel || null,
      publication_name: (input as any).publication_name || null,
      editor_contact: (input as any).editor_contact || null,
      headline: (input as any).headline || null,
      article_notes: (input as any).article_notes || null,
      cta_url: (input as any).cta_url || null,
      preview_sent_at: status === 'pending_owner_review' ? now : null,
      // published_at is written ONLY when a real published URL is recorded. Never on create.
      published_at: null,
    }

    const { data, error } = await supabase.from('press_campaigns').insert(row).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const campaign = data as PressCampaign
    const result: DispatchResult = { campaign, execution_locked: campaign.status === 'pending_owner_review' }

    if (campaign.status === 'approved') {
      const dispatch = await dispatchPressReleaseToEditor(campaign)
      result.editor_dispatch = dispatch
      // Record the outcome on the row so the queue reflects reality rather than intent.
      const after: any = dispatch.ok
        ? { dispatch_state: 'submitted', ...(dispatch.ref ? { dispatch_ref: dispatch.ref } : {}), updated_at: now }
        : { status: 'pending_owner_review', dispatch_state: dispatch.skipped ? 'rejected' : 'failed', updated_at: now }
      const { data: settled } = await supabase
        .from('press_campaigns').update(after).eq('id', campaign.id).select('*').single()
      if (settled) result.campaign = settled as PressCampaign
      result.proof_email = await runLocalPressDistributionWorker((settled || campaign) as PressCampaign, input.owner_email)
    }
    if (campaign.status === 'pending_owner_review') {
      // Preview e-mail is sent by the worker helper when email configuration is present.
      result.preview_email = await runLocalPressDistributionWorker({ ...campaign, status: 'pending_owner_review' } as PressCampaign, input.owner_email)
    }

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Press dispatch failed.' }, { status: 500 })
  }
}
