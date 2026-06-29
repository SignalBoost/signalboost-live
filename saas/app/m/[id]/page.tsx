// saas/app/m/[id]/page.tsx
// Public render of a PUBLISHED campaign. No auth — this is the live page the
// 'site' connector points to. Only campaigns with status 'published' resolve;
// anything else 404s, so nothing draft or unapproved is ever publicly visible.
import { getAdminSupabase } from '@/utils/supabase/server'
import PublicCampaign from './PublicCampaign'

export const dynamic = 'force-dynamic'

export default async function PublishedCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = getAdminSupabase()
  const { data: campaign } = await admin
    .from('ms_campaigns').select('*').eq('id', id).eq('status', 'published').maybeSingle()

  if (!campaign) {
    return (
      <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: 'rgba(226,232,240,.65)' }}>
        <p>Not found</p>
      </main>
    )
  }
  const { data: drafts } = await admin.from('ms_drafts').select('*').eq('campaign_id', id)
  return <PublicCampaign drafts={(drafts || []) as any} />
}
