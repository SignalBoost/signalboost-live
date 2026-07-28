// saas/app/m/[id]/page.tsx
import { LocalizedText } from '@/components/i18n/LocalizedText'
// saas/app/m/[id]/page.tsx
// Public render of a PUBLISHED campaign. Only campaigns with status 'published'
// resolve; anything else 404s. Passes the id to the client so a view can be
// counted into ms_events (the optimization loop's data source).
import { getAdminSupabase } from '@/utils/supabase/server'
import PublicCampaign from './PublicCampaign.tsx'
import { uiText } from '@/lib/i18n/uiText'

export const dynamic = 'force-dynamic'

export default async function PublishedCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = getAdminSupabase()
  const { data: campaign } = await admin
    .from('ms_campaigns').select('*').eq('id', id).eq('status', 'published').maybeSingle()

  if (!campaign) {
    return (
      <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: 'rgba(226,232,240,.65)' }}>
        <p><LocalizedText fallback={uiText('generatedUi.u_e3ebaa16dd9d9b9f')} /></p>
      </main>
    )
  }
  const { data: drafts } = await admin.from('ms_drafts').select('*').eq('campaign_id', id)
  return <PublicCampaign campaignId={id} drafts={(drafts || []) as any} />
}
