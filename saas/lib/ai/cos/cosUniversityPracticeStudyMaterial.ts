import { createHash } from 'node:crypto'

const HASH = /^[a-f0-9]{64}$/
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const PUBLIC_SOURCES = new Set(['official_documentation', 'research_paper', 'scientific_journal', 'library_material', 'news_article', 'public_dataset', 'video_transcript', 'approved_public_web'])
export const PRACTICE_STUDY_MATERIAL_VERSION = 'accepted_practice_study_v1' as const
export const MAX_PRACTICE_STUDY_SOURCES = 4
export type PracticeStudyRequest = Readonly<{ agentId: string; runId: string; manifestHash: string }>
export type PracticeStudyBinding = Readonly<{
  agentId: string; queueId: string; planId: string; studyAttempt: number; observedAt: string; evidenceRefs: string[]
}>
export type PracticeStudyMaterial = Readonly<{
  version: typeof PRACTICE_STUDY_MATERIAL_VERSION
  agentId: string; queueId: string; planId: string; studyAttempt: number; learningRunId: string
  sources: readonly Readonly<{ contentHash: string; sourceUri: string; title: string; excerpt: string }>[]
  academicCredit: false
}>
export function studyRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function check(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`university_practice_study_${reason}`)
}
function timestamp(value: unknown): number { return typeof value === 'string' ? Date.parse(value) : Number.NaN }

/** Current queue/plan proof, never an inferred title/time correlation or another agent's study. */
export function bindPracticeStudy(request: PracticeStudyRequest, queue: unknown, plan: unknown, now = new Date()): PracticeStudyBinding {
  const q = studyRecord(queue), p = studyRecord(plan), m = studyRecord(q.metadata)
  const e = studyRecord(p.evidence), proof = studyRecord(e.studyProof), remediation = studyRecord(e.practiceRemediation)
  check(request.agentId !== 'cos' && /^[a-z0-9][a-z0-9_-]{0,179}$/.test(request.agentId), 'agent_invalid')
  check(UUID.test(request.runId) && HASH.test(request.manifestHash) && q.id === request.runId && q.status === 'running', 'queue_invalid')
  check(m.origin === 'cos_university_deliberate_practice' && m.agentId === request.agentId
    && m.executionBinding === 'agent_bound_practice_v1' && m.manifestHash === request.manifestHash
    && m.academicCredit === false, 'queue_binding_invalid')
  check(typeof p.id === 'string' && UUID.test(p.id) && m.universityPlanId === p.id
    && p.agent_id === request.agentId && p.status === 'studying', 'plan_binding_invalid')
  check(Number.isSafeInteger(p.attempt_count) && Number(p.attempt_count) > 0
    && p.attempt_count === m.practiceRound && proof.studyAttempt === p.attempt_count, 'round_invalid')
  check(proof.source === 'continuous_learning_accepted_gap' && proof.academicCredit === false, 'proof_invalid')
  check(!(remediation.practiceRound === p.attempt_count && remediation.requiresNewStudyAttempt === true), 'restudy_required')
  check(Number.isFinite(timestamp(proof.observedAt)) && timestamp(proof.observedAt) === timestamp(p.last_attempt_at)
    && timestamp(proof.observedAt) <= now.getTime(), 'timestamp_invalid')
  check(Array.isArray(proof.evidenceRefs) && proof.evidenceRefs.length > 0 && proof.evidenceRefs.length <= 16
    && proof.evidenceRefs.every(ref => typeof ref === 'string' && ref.trim().length > 0 && ref.length <= 300), 'references_invalid')
  return { agentId: request.agentId, queueId: request.runId, planId: p.id, studyAttempt: Number(p.attempt_count),
    observedAt: String(proof.observedAt), evidenceRefs: [...new Set(proof.evidenceRefs as string[])] }
}

/** Receipts contain hashes only, captured after durable admission succeeded for this exact gap. */
export function practiceStudyContentHashes(binding: PracticeStudyBinding, receipt: unknown, now = new Date()): string[] {
  const r = studyRecord(receipt), diagnostics = studyRecord(r.gap_diagnostics)
  check(typeof r.id === 'string' && UUID.test(r.id) && r.status === 'completed'
    && timestamp(r.started_at) === timestamp(binding.observedAt)
    && timestamp(r.completed_at) >= timestamp(r.started_at) && timestamp(r.completed_at) <= now.getTime()
    && typeof r.slot_key === 'string' && r.slot_key.endsWith(`:${binding.agentId}`)
    && Array.isArray(r.plan_ids) && r.plan_ids.includes(binding.planId), 'receipt_binding_invalid')
  const hashes = new Set<string>()
  for (const ref of binding.evidenceRefs) {
    const d = studyRecord(diagnostics[ref])
    check(Number.isSafeInteger(d.accepted) && Number(d.accepted) > 0
      && Array.isArray(d.acceptedContentHashes) && d.acceptedContentHashes.length > 0
      && d.acceptedContentHashes.length <= 64 && d.acceptedContentHashes.length <= Number(d.accepted)
      && d.acceptedContentHashes.every(value => typeof value === 'string' && HASH.test(value)), 'content_receipt_missing')
    for (const hash of d.acceptedContentHashes as string[]) hashes.add(hash)
  }
  check(hashes.size > 0, 'content_receipt_missing')
  return [...hashes].sort().slice(0, MAX_PRACTICE_STUDY_SOURCES)
}

/** Only persisted, admitted public-source excerpts. No rubrics, answers, experience logs or writes. */
export function buildPracticeStudyMaterial(binding: PracticeStudyBinding, receipt: unknown, rows: readonly unknown[], now = new Date()): PracticeStudyMaterial {
  const r = studyRecord(receipt), hashes = practiceStudyContentHashes(binding, receipt, now)
  const sources = hashes.map(contentHash => {
    const matches = rows.map(studyRecord).filter(row => row.content_hash === contentHash)
    check(matches.length === 1, 'content_unavailable')
    const row = matches[0]
    check(typeof row.source_kind === 'string' && PUBLIC_SOURCES.has(row.source_kind), 'source_not_allowed')
    check(typeof row.summary === 'string' && row.summary.trim().length > 0
      && Array.isArray(row.evidence) && row.evidence.some(value => typeof value === 'string' && value.trim()), 'content_invalid')
    check(typeof row.confidence === 'number' && Number.isFinite(row.confidence) && row.confidence > 0 && row.confidence <= 1, 'confidence_invalid')
    check(timestamp(row.created_at) >= timestamp(r.started_at) && timestamp(row.created_at) <= timestamp(r.completed_at), 'content_timestamp_invalid')
    const sourceUri = typeof row.source_uri === 'string' ? row.source_uri : ''
    let uri: URL | null = null
    try { uri = new URL(sourceUri) } catch { /* fail closed below */ }
    check(uri && ['http:', 'https:'].includes(uri.protocol) && !uri.username && !uri.password && sourceUri.length <= 2000, 'source_uri_invalid')
    return { contentHash, sourceUri, title: String(row.source_title || '').slice(0, 200), excerpt: row.summary.trim().slice(0, 1200) }
  })
  return { version: PRACTICE_STUDY_MATERIAL_VERSION, agentId: binding.agentId, queueId: binding.queueId,
    planId: binding.planId, studyAttempt: binding.studyAttempt, learningRunId: String(r.id), sources, academicCredit: false }
}

export function practiceStudyMaterialHash(packet: PracticeStudyMaterial): string {
  return createHash('sha256').update(JSON.stringify(packet)).digest('hex')
}

export function assertPracticeStudyMaterial(packet: PracticeStudyMaterial, request: PracticeStudyRequest): void {
  check(packet && packet.version === PRACTICE_STUDY_MATERIAL_VERSION && packet.agentId === request.agentId
    && packet.queueId === request.runId && UUID.test(packet.planId) && UUID.test(packet.learningRunId)
    && Number.isSafeInteger(packet.studyAttempt) && packet.studyAttempt > 0 && packet.academicCredit === false
    && Array.isArray(packet.sources) && packet.sources.length > 0 && packet.sources.length <= MAX_PRACTICE_STUDY_SOURCES
    && packet.sources.every(s => HASH.test(s.contentHash) && typeof s.excerpt === 'string' && s.excerpt.trim().length > 0 && s.excerpt.length <= 1200
      && typeof s.sourceUri === 'string' && s.sourceUri.length <= 2000 && typeof s.title === 'string' && s.title.length <= 200), 'packet_invalid')
}
