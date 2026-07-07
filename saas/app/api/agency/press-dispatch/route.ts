import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import {
  getPressAdminClient,
  ownerOverrideIsValid,
  runLocalPressDistributionWorker,
  validatePressCampaignInput,
  type PressCampaign,
} from '@/lib/agency/pressOutreach'

export const dynamic = 'force-dynamic'

type DispatchResult = {
  campaign: PressCampaign
  execution_locked: boolean
  proof_email?: unknown
  preview_email?: unknown
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
      const publishedUrl = String((input as any).published_url || (input as any).live_url || `${process.env.NEXT_PUBLIC_APP_URL || 'https://saas.signalboostapp.com'}/dashboard/marketing/press-outreach?published=${encodeURIComponent(input.campaign_id)}`)
      const { data, error } = await supabase
        .from('press_campaigns')
        .update({ status: 'published', published_url: publishedUrl, published_at: new Date().toISOString() })
        .eq('id', input.campaign_id)
        .select('*')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const campaign = data as PressCampaign
      const proof_email = await runLocalPressDistributionWorker(campaign, input.owner_email)
      return NextResponse.json({ campaign, execution_locked: false, proof_email, published_url: publishedUrl })
    }

    const status = input.created_by_role === 'owner' && ownerApproved && !forceOwnerReview ? 'published' : 'pending_owner_review'
    const createdByRole = status === 'published' ? 'owner' : 'staff'
    const now = new Date().toISOString()
    const row: any = {
      status,
      created_by_role: createdByRole,
      media_target_type: input.media_target_type,
      publication_contact: input.publication_contact,
      content_body: input.content_body,
      processing_state: 'free_organic_distribution',
      source: (input as any).source || (status === 'published' ? 'manual_owner' : 'concierge_cos'),
      channel: (input as any).channel || null,
      publication_name: (input as any).publication_name || null,
      editor_contact: (input as any).editor_contact || null,
      headline: (input as any).headline || null,
      article_notes: (input as any).article_notes || null,
      cta_url: (input as any).cta_url || null,
      preview_sent_at: status === 'pending_owner_review' ? now : null,
      published_at: status === 'published' ? now : null,
    }

    const { data, error } = await supabase.from('press_campaigns').insert(row).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const campaign = data as PressCampaign
    const result: DispatchResult = { campaign, execution_locked: campaign.status === 'pending_owner_review' }

    if (campaign.status === 'published') result.proof_email = await runLocalPressDistributionWorker(campaign, input.owner_email)
    if (campaign.status === 'pending_owner_review') {
      // Preview e-mail is sent by the worker helper when email configuration is present.
      result.preview_email = await runLocalPressDistributionWorker({ ...campaign, status: 'pending_owner_review' } as PressCampaign, input.owner_email)
    }

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Press dispatch failed.' }, { status: 500 })
  }
}
