// saas/app/m/[id]/page.tsx
// Public render of a PUBLISHED campaign. Only campaigns with status 'published'
// resolve; anything else 404s. Passes the id to the client so a view can be
// counted into ms_events (the optimization loop's data source).
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
  return <PublicCampaign campaignId={id} drafts={(drafts || []) as any} />
}
