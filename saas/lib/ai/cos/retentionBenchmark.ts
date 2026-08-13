import { createHash, randomBytes } from 'node:crypto'

export type RetentionBenchmarkFixture = {
  runId: string
  protocol: string
  quorumRequired: number
  quorumTotal: number
  marker: string
  sourceUri: string
  sourceTitle: string
  subject: string
  summary: string
  contentHash: string
}

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex').toUpperCase()
}

function randomInt(min: number, max: number): number {
  const span = Math.max(1, max - min + 1)
  return min + (randomBytes(2).readUInt16BE(0) % span)
}

export function retentionBenchmarkSourceUri(runId: string): string {
  return `benchmark://cos-retention/${runId}`
}

export function retentionBenchmarkQuestion(protocol: string): string {
  return `COS retention benchmark ${protocol}: according to retained internal evidence, what recovery quorum and diagnostic marker are specified? Cite the internal evidence label you used.`
}

export function retentionBenchmarkParaphrase(protocol: string): string {
  return `COS retention benchmark ${protocol}: according to the retained internal evidence, what recovery quorum and diagnostic marker are specified? Please cite the internal evidence label you used.`
}

export function retentionBenchmarkPersistenceQuestion(protocol: string, nonce = Date.now()): string {
  return `COS retention persistence proof ${protocol}: retrieve the stored recovery quorum and diagnostic marker, identify the retained evidence you used, and distinguish retained evidence from inference. Verification ${nonce}.`
}

export function retentionBenchmarkBaselineQuestion(protocol: string): string {
  return `Before any COS retention benchmark fixture is stored, what diagnostic marker belongs to synthetic protocol ${protocol}? If no retained evidence exists, say that it is unknown.`
}

export function retentionBenchmarkSummary(protocol: string, quorumRequired: number, quorumTotal: number, marker: string): string {
  return [
    `SignalBoost COS retention benchmark protocol ${protocol} defines a recovery quorum of ${quorumRequired} of ${quorumTotal}.`,
    `Its diagnostic marker is ${marker}.`,
    'These values are synthetic benchmark data created solely to prove durable COS learning, retrieval, cache reuse, provenance, and stale-cache invalidation.',
  ].join(' ')
}

export function createRetentionBenchmarkFixture(): RetentionBenchmarkFixture {
  const runId = randomHex(8).toLowerCase()
  const protocol = `ZETA-${randomHex(3)}`
  const quorumRequired = randomInt(3, 8)
  const quorumTotal = quorumRequired + randomInt(3, 7)
  const marker = `ORCHID-${randomInt(100000, 999999)}`
  const sourceUri = retentionBenchmarkSourceUri(runId)
  const sourceTitle = `COS retention benchmark ${protocol}`
  const subject = `SignalBoost retention benchmark protocol ${protocol} recovery quorum diagnostic marker`
  const summary = retentionBenchmarkSummary(protocol, quorumRequired, quorumTotal, marker)
  const contentHash = createHash('sha256').update(`${sourceUri}\n${summary}`).digest('hex')
  return { runId, protocol, quorumRequired, quorumTotal, marker, sourceUri, sourceTitle, subject, summary, contentHash }
}

export function parseRetentionBenchmarkFixture(row: { source_uri?: unknown; source_title?: unknown; subject?: unknown; summary?: unknown; content_hash?: unknown }): RetentionBenchmarkFixture | null {
  const sourceUri = String(row.source_uri ?? '')
  const runIdMatch = sourceUri.match(/^benchmark:\/\/cos-retention\/([a-z0-9]+)$/i)
  const summary = String(row.summary ?? '')
  const protocolMatch = summary.match(/protocol\s+(ZETA-[A-F0-9]+)\s+defines/i)
  const quorumMatch = summary.match(/recovery quorum of\s+(\d+)\s+of\s+(\d+)/i)
  const markerMatch = summary.match(/diagnostic marker is\s+(ORCHID-\d+)/i)
  if (!runIdMatch || !protocolMatch || !quorumMatch || !markerMatch) return null

  const quorumRequired = Number(quorumMatch[1])
  const quorumTotal = Number(quorumMatch[2])
  if (!Number.isInteger(quorumRequired) || !Number.isInteger(quorumTotal) || quorumRequired <= 0 || quorumTotal <= quorumRequired) return null

  return {
    runId: runIdMatch[1].toLowerCase(),
    protocol: protocolMatch[1].toUpperCase(),
    quorumRequired,
    quorumTotal,
    marker: markerMatch[1].toUpperCase(),
    sourceUri,
    sourceTitle: String(row.source_title ?? ''),
    subject: String(row.subject ?? ''),
    summary,
    contentHash: String(row.content_hash ?? ''),
  }
}

export function answerContainsRetentionFixture(answer: string, fixture: RetentionBenchmarkFixture): boolean {
  const normalized = String(answer ?? '').toUpperCase().replace(/\s+/g, ' ')
  const quorumPatterns = [
    `${fixture.quorumRequired} OF ${fixture.quorumTotal}`,
    `${fixture.quorumRequired}/${fixture.quorumTotal}`,
    `${fixture.quorumRequired} OUT OF ${fixture.quorumTotal}`,
  ]
  return normalized.includes(fixture.marker.toUpperCase()) && quorumPatterns.some(pattern => normalized.includes(pattern))
}

export function revisedRetentionBenchmarkFixture(current: RetentionBenchmarkFixture): RetentionBenchmarkFixture {
  let quorumRequired = randomInt(3, 8)
  let quorumTotal = quorumRequired + randomInt(3, 7)
  while (quorumRequired === current.quorumRequired && quorumTotal === current.quorumTotal) {
    quorumRequired = randomInt(3, 8)
    quorumTotal = quorumRequired + randomInt(3, 7)
  }
  let marker = `ORCHID-${randomInt(100000, 999999)}`
  while (marker === current.marker) marker = `ORCHID-${randomInt(100000, 999999)}`
  const summary = retentionBenchmarkSummary(current.protocol, quorumRequired, quorumTotal, marker)
  return { ...current, quorumRequired, quorumTotal, marker, summary, contentHash: createHash('sha256').update(`${current.sourceUri}\n${summary}`).digest('hex') }
}
