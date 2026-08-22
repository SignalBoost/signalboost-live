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
  const result: DirectedStudyResult = { ok: false, resolvedFrom: null, assessment: null, stored: 0, duplicates: 0, errors: [] }

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
  return result
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
