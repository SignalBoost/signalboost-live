// saas/app/api/admin/cos-directed-study/route.ts
//
// Owner-only directed-study intake. POST feeds COS material by URL, pasted text, or an uploaded
// file (.txt / .md / .pdf — PDFs go through the dependency-free extractor, whose refusals for
// scanned, encrypted, or undecodable documents are returned verbatim so the owner knows to paste
// instead). POST ?dry=1 assesses without storing. GET lists everything fed by hand.
// Owner-supplied is never auto-trusted: every chunk passes the autonomous cycle's admission gates.

import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { readDirectedStudyHistory, runDirectedStudy } from '@/lib/ai/cos/directedStudyStore'
import { CHUNK_TARGET_CHARACTERS, MAX_CHUNKS_PER_SUBMISSION, MAX_SUBMISSION_CHARACTERS, type DirectedMaterialKind } from '@/lib/ai/cos/directedStudy'
import { MAX_PDF_BYTES, extractPdfText, pdfExtractionFailureMessage } from '@/lib/ai/cos/pdfTextExtract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const limits = {
  chunkTargetCharacters: CHUNK_TARGET_CHARACTERS,
  maxChunksPerSubmission: MAX_CHUNKS_PER_SUBMISSION,
  maxSubmissionCharacters: MAX_SUBMISSION_CHARACTERS,
  maxUploadBytes: MAX_PDF_BYTES,
  uploadTypes: ['.txt', '.md', '.pdf'],
  materialKinds: ['book', 'article', 'video', 'documentation', 'own_notes'] as DirectedMaterialKind[],
}
const note = 'Owner-supplied material is never auto-trusted: each chunk uses the autonomous cycle admission gates. License declaration is recorded; only admitted chunks are retained.'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const history = await readDirectedStudyHistory()
  return NextResponse.json({ ...history, limits, note }, { status: history.ok ? 200 : 503 })
}

/**
 * Resolve an uploaded file to study text: .txt/.md decode as UTF-8, .pdf goes through the
 * dependency-free extractor. Returns the owner-facing error when the file cannot honestly yield
 * text — a refusal here is always better than feeding garbage into admission scoring.
 */
function textFromUpload(fileName: string, fileData: string): { text: string } | { error: string } {
  let buffer: Buffer
  try {
    buffer = Buffer.from(fileData.replace(/^data:[^;]+;base64,/, ''), 'base64')
  } catch {
    return { error: 'Uploaded file data is not valid base64.' }
  }
  if (!buffer.length) return { error: 'Uploaded file is empty.' }
  if (buffer.length > MAX_PDF_BYTES) return { error: `Uploaded file exceeds the ${Math.floor(MAX_PDF_BYTES / (1024 * 1024))} MB limit. Split it or paste the relevant chapter.` }

  if (fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.markdown')) {
    const text = buffer.toString('utf8')
    if (!text.trim()) return { error: 'Uploaded file contains no text.' }
    return { text }
  }
  if (fileName.endsWith('.pdf')) {
    const extracted = extractPdfText(buffer)
    if (!extracted.ok) return { error: pdfExtractionFailureMessage(extracted.reason || 'no_text_content') }
    return { text: extracted.text }
  }
  return { error: 'Unsupported file type. Upload .txt, .md, or .pdf — or paste the text.' }
}

export async function POST(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'JSON body required' }, { status: 400 })

  let uploadedText: string | null = null
  const fileName = String((body as any).fileName || '').trim().toLowerCase()
  const fileData = typeof (body as any).fileData === 'string' ? (body as any).fileData : ''
  if (fileName && fileData) {
    const resolved = textFromUpload(fileName, fileData)
    if ('error' in resolved) return NextResponse.json({ ok: false, error: resolved.error }, { status: 400 })
    uploadedText = resolved.text
  }

  const result = await runDirectedStudy({
    dryRun: request.nextUrl.searchParams.get('dry') === '1',
    submission: {
      topic: String((body as any).topic || ''),
      studyIntent: String((body as any).studyIntent || ''),
      materialKind: String((body as any).materialKind || '') as DirectedMaterialKind,
      license: String((body as any).license || ''),
      sourceUri: String((body as any).sourceUri || ''),
      sourceTitle: (body as any).sourceTitle ? String((body as any).sourceTitle) : null,
      text: uploadedText ?? ((body as any).text ? String((body as any).text) : null),
      submittedBy: guard.ctx?.email || guard.ctx?.userId || 'owner',
    },
  })
  return NextResponse.json({ ...result, limits, note }, { status: result.ok ? 200 : 400 })
}
