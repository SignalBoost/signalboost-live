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
export function currentWorldKnowledgeGaps(now = new Date()): KnowledgeGap[] {
  const year = now.getUTCFullYear()
  const month = now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
  const stamp = `${month} ${year}`

  const topics: Array<{ id: string; subject: string; question: string; urgency: number }> = [
    {
      id: 'major-world-events',
      subject: `Major world events ${stamp}`,
      question: `What major verifiable world events and developments are materially new or changed in ${stamp}?`,
      urgency: 96,
    },
    {
      id: 'notable-people-organizations',
      subject: `Notable people organizations changes ${year}`,
      question: `What recent, well-sourced changes involving notable people or organizations in ${year} materially affect their current status, including deaths, appointments, departures, mergers, closures, and other major changes?`,
      urgency: 94,
    },
    {
      id: 'government-leadership-elections',
      subject: `Government leadership elections ${year}`,
      question: `What recent verified government leadership, cabinet, election, succession, or major public-office changes in ${year} should current general knowledge reflect?`,
      urgency: 93,
    },
    {
      id: 'business-technology',
      subject: `Business technology developments ${stamp}`,
      question: `What significant current company leadership, product, platform, acquisition, shutdown, and enterprise-technology developments are new in ${stamp}?`,
      urgency: 90,
    },
    {
      id: 'software-cybersecurity',
      subject: `Software cybersecurity developments ${stamp}`,
      question: `What major software releases, platform changes, security advisories, exploited vulnerabilities, and defensive cybersecurity developments are new in ${stamp}?`,
      urgency: 92,
    },
    {
      id: 'science-space',
      subject: `Science space developments ${stamp}`,
      question: `What significant verified science, research, space, and engineering developments are new in ${stamp}?`,
      urgency: 86,
    },
  ]

  return topics.map(topic => ({
    id: `current-world:${topic.id}:${year}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
    subject: topic.subject,
    question: topic.question,
    portableIds: ['cos'],
    expectedReuse: 40,
    expectedAvoidedCostUsd: 0.5,
    urgency: topic.urgency,
    evidence: ['recurring current-world currency curriculum'],
  }))
}

const CURRENT_WORLD_ADAPTER_IDS = new Set(['reference', 'gdelt', 'official_docs', 'tech_feeds'])

export function isCurrentWorldLearningAdapter(adapter: { id?: string; kind?: string }): boolean {
  return CURRENT_WORLD_ADAPTER_IDS.has(String(adapter.id ?? adapter.kind ?? '').trim())
}
