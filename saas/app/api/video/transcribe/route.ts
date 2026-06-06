import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

const BUCKET = 'video-uploads'
const AAI = 'https://api.assemblyai.com/v2'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * POST /api/video/transcribe
 * Body: { path: string }  — the storage path returned by /api/video/upload-url
 * Returns: { ok: true, data: { transcriptId: string, status: string } }
 *
 * Submits the video to AssemblyAI and returns immediately with a transcriptId.
 * The client polls GET /api/video/transcribe?id=<transcriptId> until completed.
 */
export async function POST(req: Request) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'Captions unavailable: add ASSEMBLYAI_API_KEY in Vercel environment variables.' },
      { status: 500 },
    )
  }
  const supabase = admin()
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Storage not configured: add SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables.' },
      { status: 500 },
    )
  }

  let body: { path?: string } = {}
  try { body = await req.json() } catch {}
  const path = typeof body.path === 'string' ? body.path.trim() : ''
  if (!path) {
    return NextResponse.json({ ok: false, error: 'Missing storage path. Upload the video first.' }, { status: 400 })
  }

  // Create a short-lived signed URL so AssemblyAI can download the file
  const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: signErr?.message || 'Could not create a read URL for the uploaded file. Confirm the file uploaded successfully.' },
      { status: 500 },
    )
  }

  // Submit transcription job to AssemblyAI
  const res = await fetch(`${AAI}/transcript`, {
    method: 'POST',
    headers: { authorization: apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      audio_url: signed.signedUrl,
      language_detection: true,
      punctuate: true,
      format_text: true,
    }),
  })
  const json = await res.json()
  if (!res.ok || !json?.id) {
    return NextResponse.json(
      { ok: false, error: json?.error || 'AssemblyAI rejected the request. Verify ASSEMBLYAI_API_KEY is valid.' },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, data: { transcriptId: json.id, status: json.status || 'queued' } })
}

/**
 * GET /api/video/transcribe?id=<transcriptId>
 * Poll an in-progress transcription job.
 * Returns { ok: true, data: { status: 'processing'|'completed'|'error', cues?, cueCount? } }
 * Client keeps polling every 3 seconds until status === 'completed'.
 */
export async function GET(req: Request) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'Captions unavailable: add ASSEMBLYAI_API_KEY in Vercel environment variables.' },
      { status: 500 },
    )
  }

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'Missing transcript id.' }, { status: 400 })

  const res = await fetch(`${AAI}/transcript/${id}`, { headers: { authorization: apiKey } })
  const json = await res.json()
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: json?.error || 'Could not read transcript status.' }, { status: 502 })
  }
  if (json.status === 'error') {
    return NextResponse.json({ ok: false, error: json.error || 'Transcription failed on AssemblyAI.' }, { status: 502 })
  }
  if (json.status !== 'completed') {
    return NextResponse.json({ ok: true, data: { status: json.status } })
  }

  // Build caption cues from sentence-level results (best granularity)
  type Cue = { id: string; start: number; end: number; text: string }
  let cues: Cue[] = []

  try {
    const sRes = await fetch(`${AAI}/transcript/${id}/sentences`, { headers: { authorization: apiKey } })
    const sJson = await sRes.json()
    if (Array.isArray(sJson?.sentences) && sJson.sentences.length) {
      cues = sJson.sentences
        .map((s: { text?: string; start?: number; end?: number }, i: number) => ({
          id: `cue-${i + 1}`,
          start: (s.start || 0) / 1000,
          end: (s.end || 0) / 1000,
          text: String(s.text || '').trim(),
        }))
        .filter((c: Cue) => c.text)
    }
  } catch {}

  // Fallback: chunk word-level results into groups of 7 words
  if (!cues.length && Array.isArray(json.words) && json.words.length) {
    const chunk = 7
    for (let i = 0; i < json.words.length; i += chunk) {
      const grp = json.words.slice(i, i + chunk)
      cues.push({
        id: `cue-${cues.length + 1}`,
        start: (grp[0].start || 0) / 1000,
        end: (grp[grp.length - 1].end || 0) / 1000,
        text: grp.map((w: { text: string }) => w.text).join(' '),
      })
    }
  }

  // Last resort: whole transcript as one cue
  if (!cues.length && json.text) {
    cues = [{ id: 'cue-1', start: 0, end: Math.max(2, Number(json.audio_duration) || 3), text: String(json.text) }]
  }

  return NextResponse.json({ ok: true, data: { status: 'completed', cues, cueCount: cues.length } })
}
