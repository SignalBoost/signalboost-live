// saas/lib/ai/cos/directedStudyStore.ts
//
// Fetch-and-persist side of owner-directed study. Two fixes over the first landed version, both
// observed failing in production on 2026-08-22:
//
// 1. THE YOUTUBE TRANSCRIPT PATH IS REQUIRED BEHAVIOR, NOT AN OPTIMIZATION. "Feed COS this
//    YouTube URL" was the originating request for this feature. A YouTube page contains no
//    readable prose for the generic document reader, so without the transcript runtime call a
//    YouTube URL can only ever fail with "no readable text". Do not remove this path again;
//    when the transcript runtime is unreachable the error says so explicitly and the owner can
//    paste the transcript instead.
//
// 2. The fed-material history filters the jsonb `evidence` column. supabase-js `.contains` with a
//    JS array serializes to a Postgres ARRAY literal (`cs.{...}`), which jsonb rejects with
//    "invalid input syntax for type json". jsonb containment needs the JSON-string form.
//
// Everything else is unchanged in intent: owner-supplied material is never auto-trusted — every
// chunk passes the autonomous cycle's real admission gates, and only admitted chunks persist.

import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { candidate0Confidence, distinctTerms, relevanceOf, sourceAwareRelevant } from '@/lib/cos-core/layers/learning/cycle'
import { fetchReadableDocument, isFetchableDocumentUrl } from '@/lib/cos-core/layers/learning/documentFetch'
import { resolveYouTubeTranscriptRuntime } from '@/lib/cos-core/layers/learning/liveSources'
import { assessDirectedStudy, chunkDirectedText, directedEvidence, type DirectedStudySubmission } from '@/lib/ai/cos/directedStudy'

const gates = { candidate0Confidence, distinctTerms, relevanceOf, sourceAwareRelevant }
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

export type DirectedStudyResult = {
  ok: boolean
  error?: string
  resolvedFrom: 'youtube_transcript' | 'document_fetch' | 'pasted_text' | null
  assessment: ReturnType<typeof assessDirectedStudy> | null
  stored: number
  duplicates: number
  errors: string[]
  application: {
    status: 'not_applicable' | 'not_queued' | 'queued' | 'reinforced' | 'queue_failed'
    lessonId?: number
    message: string
  }
}

function proceduralLessonHash(submission: DirectedStudySubmission): string {
  return createHash('sha256').update([
    'owner_directed_procedural_study_v1',
    clean(submission.sourceUri).toLowerCase(),
    clean(submission.studyIntent).toLowerCase(),
  ].join(':')).digest('hex')
}

async function queueProceduralApplication(args: {
  db: NonNullable<ReturnType<typeof cosServiceDb>>
  submission: DirectedStudySubmission
  subject: string
  specialistFamily: 'software' | null
  curriculumTracks: string[]
  admittedText: string
}): Promise<DirectedStudyResult['application']> {
  if (args.specialistFamily !== 'software') {
    return { status: 'not_applicable', message: 'Retained for retrieval; no software application candidate was inferred.' }
  }
  if (!args.admittedText.trim()) {
    return { status: 'not_queued', message: 'No newly admitted software material was available to test.' }
  }

  const hash = proceduralLessonHash(args.submission)
  const existing = await args.db.from('cos_teacher_lessons').select('id,repeat_count').eq('prompt_hash', hash).maybeSingle()
  if (existing.error) throw existing.error
  const now = new Date().toISOString()
  const metadata = {
    origin: 'owner_directed_study',
    sourceUri: clean(args.submission.sourceUri).slice(0, 700),
    sourceTitle: clean(args.submission.sourceTitle).slice(0, 300) || null,
    specialistFamily: 'software',
    curriculumTracks: args.curriculumTracks,
    admissionBasis: 'owner_directed_intent',
    applicationLifecycle: 'queued_for_candidate_extraction_practice_and_independent_evaluation',
    authorityGranted: false,
  }
  const payload = {
    prompt_hash: hash,
    prompt: clean(`Learn and apply this software procedure: ${args.submission.studyIntent}`).slice(0, 20_000),
    subject: args.subject,
    local_answer: null,
    local_confidence: null,
    escalation_reason: 'Owner-directed procedural study; application has not yet been demonstrated.',
    teacher_answer: clean(args.admittedText).slice(0, 40_000),
    teacher_provider: 'owner_directed_material',
    teacher_model: null,
    status: 'captured',
    metadata,
    updated_at: now,
  }
  if (existing.data?.id) {
    const write = await args.db.from('cos_teacher_lessons').update({
      ...payload,
      repeat_count: Number(existing.data.repeat_count || 1) + 1,
    }).eq('id', existing.data.id)
    if (write.error) throw write.error
    return { status: 'reinforced', lessonId: Number(existing.data.id), message: 'Software application candidate reinforced and awaiting governed evaluation.' }
  }
  const write = await args.db.from('cos_teacher_lessons').insert(payload).select('id').single()
  if (write.error) throw write.error
  return { status: 'queued', lessonId: Number(write.data.id), message: 'Software application candidate queued for extraction, practice, and independent evaluation.' }
}

export function youTubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(String(rawUrl || ''))
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (url.pathname === '/watch') return url.searchParams.get('v')
      const nested = url.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/)
      if (nested) return nested[2] || null
    }
    return null
  } catch {
    return null
  }
}

function transcriptTextOf(payload: any): string {
  if (typeof payload?.transcript === 'string') return payload.transcript
  if (typeof payload?.text === 'string') return payload.text
  if (Array.isArray(payload?.segments)) return payload.segments.map((s: any) => s?.text ?? '').join(' ')
  if (Array.isArray(payload?.transcript)) return payload.transcript.map((s: any) => s?.text ?? s ?? '').join(' ')
  return ''
}

async function fetchYouTubeTranscript(videoId: string, videoUrl: string): Promise<{ text: string } | { error: string }> {
  const runtime = resolveYouTubeTranscriptRuntime(process.env)
  if (!runtime.url) return { error: 'No transcript runtime is configured (YOUTUBE_TRANSCRIPT_API_URL or the RunPod transcript service). Paste the video transcript into the text box instead.' }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60_000)
    try {
      const response = await fetch(runtime.url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', ...(runtime.token ? { authorization: `Bearer ${runtime.token}` } : {}) },
        body: JSON.stringify({ videoId, videoUrl, languages: ['en'] }),
      })
      if (!response.ok) return { error: `Transcript service returned ${response.status}. The transcript pod may be stopped. Paste the transcript instead.` }
      const text = clean(transcriptTextOf(await response.json().catch(() => null)))
      if (!text) return { error: 'Transcript service returned no caption text for this video. Paste the transcript instead.' }
      return { text }
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    return { error: `Transcript fetch failed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown error'}. Paste the transcript instead.` }
  }
}

export async function runDirectedStudy(input: { submission: Omit<DirectedStudySubmission, 'text'> & { text?: string | null }; dryRun?: boolean }): Promise<DirectedStudyResult> {
  const result: DirectedStudyResult = { ok: false, resolvedFrom: null, assessment: null, stored: 0, duplicates: 0, errors: [], application: { status: 'not_queued', message: 'Application evaluation was not queued.' } }

  let text = String(input.submission.text || '').trim()
  if (text) {
    result.resolvedFrom = 'pasted_text'
  } else {
    const sourceUri = String(input.submission.sourceUri || '')
    const videoId = youTubeVideoId(sourceUri)
    if (videoId) {
      const transcript = await fetchYouTubeTranscript(videoId, sourceUri)
      if ('error' in transcript) { result.error = transcript.error; return result }
      text = transcript.text
      result.resolvedFrom = 'youtube_transcript'
    } else {
      if (!isFetchableDocumentUrl(sourceUri)) { result.error = 'URL is not fetchable under document-reader guards; paste the text instead.'; return result }
      text = (await fetchReadableDocument(sourceUri, { maxCharacters: 80_000 }).catch(() => null)) || ''
      if (!text.trim()) { result.error = 'The page produced no readable text under document-reader guards. Paste the text instead.'; return result }
      result.resolvedFrom = 'document_fetch'
    }
  }

  const submission: DirectedStudySubmission = { ...input.submission, text }
  const assessment = assessDirectedStudy(submission, gates)
  result.assessment = assessment
  if (!assessment.ok) { result.error = assessment.error; return result }

  result.ok = true
  if (input.dryRun) return result

  const db = cosServiceDb()
  if (!db) { result.errors.push('COS service database is not configured; nothing was stored.'); return result }

  const chunks = chunkDirectedText(text).chunks
  const evidence = directedEvidence(submission)
  const observedAt = submission.observedAt || new Date().toISOString()
  for (const verdict of assessment.chunks.filter(chunk => chunk.admitted)) {
    const write = await db.from('cos_continuous_learning').insert({
      content_hash: verdict.contentHash,
      source_kind: assessment.sourceKind,
      source_uri: clean(submission.sourceUri).slice(0, 700),
      source_title: submission.sourceTitle ? clean(submission.sourceTitle).slice(0, 300) : null,
      observed_at: observedAt,
      subject: assessment.subject,
      summary: clean(chunks[verdict.index] ?? '').slice(0, 8_000) || verdict.summary,
      facts: [],
      confidence: verdict.confidence,
      license: clean(submission.license).slice(0, 300),
      evidence,
    })
    if (write.error) {
      if (String(write.error.code || '') === '23505' || /duplicate/i.test(String(write.error.message || ''))) result.duplicates += 1
      else result.errors.push(`store:${String(write.error.message || write.error).slice(0, 300)}`)
    } else {
      result.stored += 1
    }
  }
  try {
    const admittedText = assessment.chunks
      .filter(chunk => chunk.admitted)
      .map(chunk => chunks[chunk.index] || '')
      .join('\n\n')
    result.application = await queueProceduralApplication({
      db,
      submission,
      subject: assessment.subject,
      specialistFamily: assessment.learningRoute.specialistFamily,
      curriculumTracks: assessment.learningRoute.curriculumTracks,
      admittedText,
    })
  } catch (error) {
    result.application = { status: 'queue_failed', message: 'Knowledge was retained, but application evaluation could not be queued.' }
    result.errors.push(`application-queue:${String(error instanceof Error ? error.message : error).slice(0, 300)}`)
  }
  return result
}

type DirectedSoftwareBackfillRow = {
  source_uri?: string | null
  source_title?: string | null
  subject?: string | null
  summary?: string | null
  license?: string | null
  evidence?: unknown
  created_at?: string | null
}

export type DirectedSoftwareBackfillResult = {
  inspectedRows: number
  sources: number
  queued: number
  reinforced: number
  failed: number
  errors: string[]
}

function evidenceValues(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => clean(item)).filter(Boolean) : []
}

/**
 * Recover the pre-#1883 owner-directed software corpus into the same governed cognitive queue used
 * by new submissions. Source URI + original study intent retain idempotency, so scheduled reruns
 * reinforce the same lesson instead of multiplying candidates. Nothing is promoted here.
 */
export async function backfillDirectedSoftwareApplications(limit = 200): Promise<DirectedSoftwareBackfillResult> {
  const summary: DirectedSoftwareBackfillResult = { inspectedRows: 0, sources: 0, queued: 0, reinforced: 0, failed: 0, errors: [] }
  const db = cosServiceDb()
  if (!db) { summary.errors.push('COS service database is not configured'); return summary }

  const rowsResult = await db.from('cos_continuous_learning')
    .select('source_uri,source_title,subject,summary,license,evidence,created_at')
    .contains('evidence', JSON.stringify(['owner_directed_study', 'specialist_family:software']))
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(1000, Math.floor(limit))))
  if (rowsResult.error) throw rowsResult.error
  const rows = (rowsResult.data || []) as DirectedSoftwareBackfillRow[]
  summary.inspectedRows = rows.length

  const bySource = new Map<string, DirectedSoftwareBackfillRow[]>()
  for (const row of rows) {
    const sourceUri = clean(row.source_uri)
    if (!sourceUri) continue
    const group = bySource.get(sourceUri) || []
    group.push(row)
    bySource.set(sourceUri, group)
  }
  summary.sources = bySource.size

  for (const [sourceUri, sourceRows] of bySource) {
    const first = sourceRows[0]
    const evidence = evidenceValues(first.evidence)
    const studyIntent = clean(evidence.find(item => item.startsWith('study_intent:'))?.slice('study_intent:'.length))
      || `Build transferable software capability from ${clean(first.source_title) || sourceUri}`
    const curriculumTracks = [...new Set(evidence
      .filter(item => item.startsWith('curriculum_track:'))
      .map(item => clean(item.slice('curriculum_track:'.length)))
      .filter(Boolean))]
    const materialKind = clean(evidence.find(item => item.startsWith('material_kind:'))?.slice('material_kind:'.length)) as DirectedStudySubmission['materialKind']
    const submission: DirectedStudySubmission = {
      topic: clean(first.subject) || 'software engineering',
      studyIntent,
      materialKind: materialKind || 'documentation',
      license: clean(first.license) || 'previously admitted owner-directed material',
      sourceUri,
      sourceTitle: clean(first.source_title) || null,
      text: sourceRows.map(row => clean(row.summary)).filter(Boolean).join('\n\n').slice(0, 40_000),
      submittedBy: 'owner-directed-backfill',
      observedAt: first.created_at || undefined,
    }
    try {
      const result = await queueProceduralApplication({
        db,
        submission,
        subject: submission.topic,
        specialistFamily: 'software',
        curriculumTracks,
        admittedText: submission.text,
      })
      if (result.status === 'queued') summary.queued += 1
      else if (result.status === 'reinforced') summary.reinforced += 1
    } catch (error) {
      summary.failed += 1
      summary.errors.push(`${sourceUri}:${String(error instanceof Error ? error.message : error).slice(0, 240)}`)
    }
  }
  return summary
}

export async function readDirectedStudyHistory(limit = 50): Promise<{ ok: boolean; error?: string; records?: Array<Record<string, unknown>> }> {
  const db = cosServiceDb()
  if (!db) return { ok: false, error: 'COS service database is not configured' }
  // jsonb containment: the filter value MUST be a JSON string. A JS array here serializes to a
  // Postgres ARRAY literal, which jsonb rejects with "invalid input syntax for type json".
  const result = await db
    .from('cos_continuous_learning')
    .select('content_hash,source_kind,source_uri,source_title,subject,confidence,license,observed_at,created_at')
    .contains('evidence', JSON.stringify(['owner_directed_study']))
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, Math.floor(limit))))
  if (result.error) return { ok: false, error: String(result.error.message || result.error).slice(0, 300) }
  return { ok: true, records: (result.data || []) as Array<Record<string, unknown>> }
}
