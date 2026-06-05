import { NextRequest, NextResponse } from 'next/server'
import { analyzePodcastFeed } from '@/lib/podcast/optimization'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const feedUrl = String(body?.url || body?.feedUrl || '').trim()
    if (!feedUrl) {
      return NextResponse.json({ error: 'Feed URL is required.' }, { status: 400 })
    }
    const audit = await analyzePodcastFeed(feedUrl)
    return NextResponse.json({
      url: feedUrl,
      feedUrl: audit.feed_url,
      show: audit.show.title,
      episodes: audit.episodes.length,
      score: audit.overall_score,
      scores: {
        audio: audit.audio_quality_score,
        metadata: audit.metadata_score,
        distribution: audit.distribution_score,
        seo: audit.seo_score,
        accessibility: audit.accessibility_score,
      },
      checks: audit.recommendations.map((item, index) => ({
        id: `${item.category}-${index}`,
        label: item.category,
        category: item.category,
        status: item.priority === 'high' ? 'fail' : item.priority === 'medium' ? 'warn' : 'pass',
        detail: item.recommendation,
        recommendation: JSON.stringify(item.suggested_fix),
      })),
      summary: `Overall score ${audit.overall_score}/100. ${audit.recommendations.map(item => item.recommendation).join(' ')}`,
      audit,
      source: 'signalboost-podcast-system',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not audit that feed.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
