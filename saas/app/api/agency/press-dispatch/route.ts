import { NextRequest, NextResponse } from 'next/server'
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
    const supabase = getPressAdminClient()
    const status = input.created_by_role === 'owner' || ownerOverrideIsValid(input.owner_override_token)
      ? 'published'
      : 'pending_owner_review'

    let query
    if (input.campaign_id && ownerOverrideIsValid(input.owner_override_token)) {
      query = supabase
        .from('press_campaigns')
        .update({ status })
        .eq('id', input.campaign_id)
        .eq('status', 'pending_owner_review')
        .select('*')
        .single()
    } else {
      query = supabase
        .from('press_campaigns')
        .insert({
          status,
          created_by_role: input.created_by_role,
          media_target_type: input.media_target_type,
          publication_contact: input.publication_contact,
          content_body: input.content_body,
          processing_state: 'free_organic_distribution',
        })
        .select('*')
        .single()
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const campaign = data as PressCampaign
    const result: DispatchResult = {
      campaign,
      execution_locked: campaign.status === 'pending_owner_review',
    }

    if (campaign.status === 'published') {
      result.proof_email = await runLocalPressDistributionWorker(campaign, input.owner_email)
    }

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Press dispatch failed.' }, { status: 500 })
  }
}
