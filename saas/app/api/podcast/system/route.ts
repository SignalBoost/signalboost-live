import { NextRequest, NextResponse } from 'next/server'
import { analyzePodcastFeed, optimizeEpisodeMetadata, rebuildPodcastFeed, type PodcastAudit, type PodcastRecommendation } from '@/lib/podcast/optimization'
import { getAdminSupabase, getCurrentUser } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

type Action = 'analyze' | 'optimize' | 'rebuild'

async function persistAudit(audit: PodcastAudit) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  const user = await getCurrentUser()
  if (!user?.id) return null
  const supabase = getAdminSupabase()
  await supabase.from('accounts').upsert({ id: user.id }, { onConflict: 'id' })
  const { data, error } = await supabase.from('podcast_audits').insert({
    account_id: user.id,
    feed_url: audit.feed_url,
    audio_quality_score: audit.audio_quality_score,
    metadata_score: audit.metadata_score,
    distribution_score: audit.distribution_score,
    seo_score: audit.seo_score,
    accessibility_score: audit.accessibility_score,
    raw_report: { ...audit.raw_report, show: audit.show, episodes: audit.episodes, overall_score: audit.overall_score },
  }).select('id').single()
  if (error || !data?.id) return null
  const rows = audit.recommendations.map((item: PodcastRecommendation) => ({
    audit_id: data.id,
    category: item.category,
    priority: item.priority,
    recommendation: item.recommendation,
    suggested_fix: item.suggested_fix,
  }))
  if (rows.length) await supabase.from('podcast_recommendations').insert(rows)
  return data.id as string
}

async function persistRebuild(audit: PodcastAudit, rebuild: ReturnType<typeof rebuildPodcastFeed>) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  const user = await getCurrentUser()
  if (!user?.id) return null
  const supabase = getAdminSupabase()
  await supabase.from('accounts').upsert({ id: user.id }, { onConflict: 'id' })
  const { data, error } = await supabase.from('podcast_rebuilds').insert({
    account_id: user.id,
    source_feed: audit.feed_url,
    status: rebuild.status,
    generated_feed: { ...rebuild.generated_feed, rssXml: rebuild.rssXml },
    generated_metadata: rebuild.generated_metadata,
    generated_transcripts: rebuild.generated_transcripts,
  }).select('id').single()
  return error ? null : data?.id || null
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

async function getAudit(body: Record<string, unknown>): Promise<PodcastAudit> {
  if (body.audit && typeof body.audit === 'object') return body.audit as PodcastAudit
  const feedUrl = String(body.feedUrl || body.feed_url || '').trim()
  if (!feedUrl) throw new Error('feedUrl is required.')
  return analyzePodcastFeed(feedUrl)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>
    const action = String(body.action || 'analyze') as Action

    if (!['analyze', 'optimize', 'rebuild'].includes(action)) {
      return jsonError('Unsupported podcast action. Use analyze, optimize, or rebuild.')
    }

    if (action === 'analyze') {
      const feedUrl = String(body.feedUrl || body.feed_url || '').trim()
      if (!feedUrl) return jsonError('feedUrl is required.')
      const audit = await analyzePodcastFeed(feedUrl)
      const persistedAuditId = await persistAudit(audit)
      return NextResponse.json({ ok: true, action, audit, persistedAuditId })
    }

    const audit = await getAudit(body)

    if (action === 'optimize') {
      const episodeId = typeof body.episodeId === 'string' ? body.episodeId : undefined
      const optimized = optimizeEpisodeMetadata(audit, episodeId)
      return NextResponse.json({ ok: true, action, audit, optimized })
    }

    const rebuild = rebuildPodcastFeed(audit)
    const persistedRebuildId = await persistRebuild(audit, rebuild)
    return NextResponse.json({ ok: true, action, audit, rebuild, persistedRebuildId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not complete podcast optimization request.'
    return jsonError(message, /required|Unsupported|valid|allowed/i.test(message) ? 400 : 502)
  }
}
