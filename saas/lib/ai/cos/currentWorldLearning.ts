import type { KnowledgeGap } from '@/lib/cos-core/layers/learning/index.ts'

/**
 * A small, bounded curriculum whose purpose is currency rather than deep specialization.
 *
 * The normal COS curriculum is intentionally technology-heavy. That is useful for engineering
 * capability, but it cannot keep broad world knowledge current by itself. These gaps give the
 * existing evidence-gated public source adapters recurring discovery anchors for important changes
 * that may happen after the base model was trained.
 *
 * High-frequency scalar facts (prices, weather, sports scores) are intentionally absent: those
 * belong to structured real-time providers at answer time, not durable background memory.
 */
const HOURLY_FOCUS = [
  'leadership appointments departures succession',
  'acquisitions mergers closures restructurings',
  'security incidents advisories vulnerabilities',
  'government elections regulation public policy',
  'science research engineering discoveries',
  'infrastructure outages disruptions resilience',
  'economy industry enterprise technology',
  'climate disasters environment response',
] as const

export function currentWorldKnowledgeGaps(now = new Date()): KnowledgeGap[] {
  const year = now.getUTCFullYear()
  const month = now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
  const day = now.getUTCDate()
  const hour = now.getUTCHours()
  const dayStamp = `${month} ${day} ${year}`
  const focus = HOURLY_FOCUS[hour % HOURLY_FOCUS.length]
  const rotation = String(hour % HOURLY_FOCUS.length).padStart(2, '0')

  const topics: Array<{ id: string; subject: string; question: string; urgency: number }> = [
    {
      id: 'major-world-events',
      subject: `Major world events ${dayStamp} ${focus}`,
      question: `What major verifiable world events are new or materially changed around ${dayStamp}, with particular attention to ${focus}? Prefer developments not already represented by older background pages.`,
      urgency: 96,
    },
    {
      id: 'notable-people-organizations',
      subject: `Notable people organizations ${dayStamp} ${focus}`,
      question: `What well-sourced changes involving notable people or organizations are newly relevant around ${dayStamp}, especially ${focus}, including deaths, appointments, departures, mergers, closures, and status changes?`,
      urgency: 94,
    },
    {
      id: 'government-leadership-elections',
      subject: `Government leadership elections ${dayStamp} ${focus}`,
      question: `What verified government leadership, cabinet, election, succession, regulatory, or major public-office changes are newly relevant around ${dayStamp}, especially ${focus}?`,
      urgency: 93,
    },
    {
      id: 'business-technology',
      subject: `Business technology ${dayStamp} ${focus}`,
      question: `What significant company leadership, product, platform, acquisition, shutdown, infrastructure, or enterprise-technology developments are newly relevant around ${dayStamp}, especially ${focus}?`,
      urgency: 90,
    },
    {
      id: 'software-cybersecurity',
      subject: `Software cybersecurity ${dayStamp} ${focus}`,
      question: `What major software releases, platform changes, security advisories, exploited vulnerabilities, outages, and defensive cybersecurity developments are newly relevant around ${dayStamp}, especially ${focus}?`,
      urgency: 92,
    },
    {
      id: 'science-space',
      subject: `Science space engineering ${dayStamp} ${focus}`,
      question: `What significant verified science, research, space, and engineering developments are newly relevant around ${dayStamp}, especially ${focus}?`,
      urgency: 86,
    },
  ]

  return topics.map(topic => ({
    id: `current-world:${topic.id}:${year}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}:r${rotation}`,
    subject: topic.subject,
    question: topic.question,
    portableIds: ['cos'],
    expectedReuse: 40,
    expectedAvoidedCostUsd: 0.5,
    urgency: topic.urgency,
    evidence: [`recurring current-world currency curriculum; hourly focus=${focus}`],
  }))
}

const CURRENT_WORLD_ADAPTER_IDS = new Set(['reference', 'gdelt', 'official_docs', 'tech_feeds'])

export function isCurrentWorldLearningAdapter(adapter: { id?: string; kind?: string }): boolean {
  return CURRENT_WORLD_ADAPTER_IDS.has(String(adapter.id ?? adapter.kind ?? '').trim())
}

/**
 * GDELT has been returning 429/fetch failures on every production hourly run. A fresh adapter is
 * created for every cron invocation, so its in-memory circuit breaker otherwise forgets the outage
 * and spends ~100 seconds rediscovering the same failure every hour. Keep it as a periodic probe
 * while healthy keyless reference/official sources continue every hour. This is a cadence control,
 * not a trust bypass: no source/admission threshold changes.
 */
export function currentWorldAdapterDue(adapter: { id?: string; kind?: string }, now = new Date()): boolean {
  const id = String(adapter.id ?? adapter.kind ?? '').trim()
  if (!isCurrentWorldLearningAdapter(adapter)) return false
  if (id !== 'gdelt') return true
  return now.getUTCHours() % 6 === 0
}
