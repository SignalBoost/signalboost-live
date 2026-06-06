// saas/app/api/video/route.ts
// Step 3 of the upload flow. Receives JSON { jobId, path, langs, formats }.
// The video is ALREADY in Supabase Storage (uploaded directly by the browser).
// This route creates a signed download URL and hands it to AssemblyAI, which
// fetches the file itself — so the video never passes through this function
// and there is no request-body size limit.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'
import {
  startTranscription,
  pollTranscription,
  wordsToCaption,
  captionEntriesToSRT,
  captionEntriesToVTT,
  captionEntriesToASS,
  type TranscriptResult,
} from '@/lib/assemblyai/client'

const VIDEO_BUCKET = 'video-jobs'
const SIGNED_URL_TTL = 60 * 60 * 6  // 6 hours

const SUPPORTED_LANGS = ['en', 'pt', 'es', 'pl', 'ru']

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  pt: 'Português',
  es: 'Español',
  pl: 'Polski',
  ru: 'Русский',
}

const TRANSLATE_PROMPTS: Record<string, string> = {
  pt: 'Translate the following English text to Brazilian Portuguese. Preserve all punctuation and line breaks. Return only the translated text.',
  es: 'Translate the following English text to Spanish (LATAM). Preserve all punctuation and line breaks. Return only the translated text.',
  pl: 'Translate the following English text to Polish. Preserve all punctuation and line breaks. Return only the translated text.',
  ru: 'Translate the following English text to Russian. Preserve all punctuation and line breaks. Return only the translated text.',
}

export const maxDuration = 300  // 5 min Vercel function timeout

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  try { return String(err) } catch { return 'unknown error' }
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  )

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const missingEnv: string[] = []
  if (!process.env.ASSEMBLYAI_API_KEY) missingEnv.push('ASSEMBLYAI_API_KEY')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnv.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missingEnv.length) {
    return NextResponse.json(
      { error: `Server config error: missing env var(s): ${missingEnv.join(', ')}` },
      { status: 500 },
    )
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: any
  try {
    body = await req.json()
  } catch (err) {
    return NextResponse.json({ error: `Invalid request body: ${errMsg(err)}` }, { status: 400 })
  }

  const jobId = String(body?.jobId ?? '').trim()
  const path = String(body?.path ?? '').trim()
  if (!jobId || !path) {
    return NextResponse.json({ error: 'jobId and path are required' }, { status: 400 })
  }

  // ── Verify the job belongs to this user ────────────────────────────────────
  const { data: job, error: jobError } = await supabaseAdmin
    .from('video_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (jobError) {
    return NextResponse.json({ error: `Database error reading job: ${jobError.message}` }, { status: 500 })
  }
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const langs: string[] = Array.isArray(job.langs)
    ? job.langs.filter((l: string) => SUPPORTED_LANGS.includes(l))
    : ['en']
  if (!langs.length) langs.push('en')

  const formats: string[] = Array.isArray(job.formats)
    ? job.formats.filter((f: string) => ['srt', 'vtt', 'ass'].includes(f))
    : ['srt']
  if (!formats.length) formats.push('srt')

  // ── Signed download URL for AssemblyAI to fetch ────────────────────────────
  const { data: dl, error: dlError } = await supabaseAdmin.storage
    .from(VIDEO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL)

  if (dlError || !dl?.signedUrl) {
    await supabaseAdmin.from('video_jobs').update({ status: 'error', error: dlError?.message ?? 'no signed url' }).eq('id', jobId)
    return NextResponse.json(
      { error: `Could not read the uploaded file from storage: ${dlError?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  // ── Transcribe (AssemblyAI fetches the signed URL directly) ────────────────
  let transcript: TranscriptResult
  try {
    await supabaseAdmin.from('video_jobs').update({ status: 'transcribing' }).eq('id', jobId)
    const transcriptId = await startTranscription(dl.signedUrl, 'en')
    transcript = await pollTranscription(transcriptId)

    if (transcript.status === 'error') {
      throw new Error(transcript.error ?? 'Transcription failed')
    }
  } catch (err) {
    const m = errMsg(err)
    console.error('AssemblyAI transcription error:', err)
    await supabaseAdmin.from('video_jobs').update({ status: 'error', error: m }).eq('id', jobId)
    return NextResponse.json({ error: `Transcription failed: ${m}` }, { status: 502 })
  }

  // ── Generate captions for each language ────────────────────────────────────
  await supabaseAdmin.from('video_jobs').update({ status: 'generating' }).eq('id', jobId)

  const captionResults: Array<{
    lang: string
    langName: string
    srtKey?: string
    vttKey?: string
    assKey?: string
    srtUrl?: string
    vttUrl?: string
    assUrl?: string
  }> = []

  let storageError: string | null = null

  for (const lang of langs) {
    let words = transcript.words

    if (lang !== 'en') {
      try {
        const translatedText = await translateText(transcript.text, lang)
        words = rebuildWordsFromTranslation(transcript.words, translatedText)
      } catch (err) {
        console.error(`Translation failed for ${lang}:`, err)
      }
    }

    const entries = wordsToCaption(words, 'srt')
    const result: (typeof captionResults)[0] = { lang, langName: LANG_NAMES[lang] ?? lang }

    for (const fmt of formats) {
      let content: string
      let mimeType: string
      let ext: string

      if (fmt === 'srt') {
        content = captionEntriesToSRT(entries)
        mimeType = 'text/plain'
        ext = 'srt'
      } else if (fmt === 'vtt') {
        const vttEntries = wordsToCaption(words, 'vtt')
        content = captionEntriesToVTT(vttEntries)
        mimeType = 'text/vtt'
        ext = 'vtt'
      } else {
        const assEntries = wordsToCaption(words, 'ass')
        content = captionEntriesToASS(assEntries)
        mimeType = 'text/plain'
        ext = 'ass'
      }

      const storageKey = `${user.id}/${jobId}/${lang}.${ext}`
      const { error: uploadError } = await supabaseAdmin.storage
        .from(VIDEO_BUCKET)
        .upload(storageKey, new Blob([content], { type: mimeType }), { upsert: true })

      if (uploadError) {
        storageError = uploadError.message
        console.error(`Storage upload failed for ${storageKey}:`, uploadError)
      } else {
        const { data: signed } = await supabaseAdmin.storage
          .from(VIDEO_BUCKET)
          .createSignedUrl(storageKey, SIGNED_URL_TTL)

        if (signed?.signedUrl) {
          if (fmt === 'srt') { result.srtKey = storageKey; result.srtUrl = signed.signedUrl }
          if (fmt === 'vtt') { result.vttKey = storageKey; result.vttUrl = signed.signedUrl }
          if (fmt === 'ass') { result.assKey = storageKey; result.assUrl = signed.signedUrl }
        }
      }
    }

    captionResults.push(result)
  }

  const anyUrls = captionResults.some((r) => r.srtUrl || r.vttUrl || r.assUrl)
  if (!anyUrls && storageError) {
    await supabaseAdmin.from('video_jobs').update({ status: 'error', error: storageError }).eq('id', jobId)
    return NextResponse.json(
      { error: `Captions generated but could not be saved. Storage error (check the '${VIDEO_BUCKET}' bucket exists): ${storageError}` },
      { status: 500 },
    )
  }

  // ── Store transcript + finalise ────────────────────────────────────────────
  const transcriptKey = `${user.id}/${jobId}/transcript.json`
  await supabaseAdmin.storage
    .from(VIDEO_BUCKET)
    .upload(transcriptKey, new Blob([JSON.stringify(transcript)], { type: 'application/json' }), { upsert: true })

  await supabaseAdmin.from('video_jobs').update({
    status: 'done',
    duration_seconds: Math.round(transcript.audio_duration),
    captions: captionResults,
    chapters: transcript.chapters,
    transcript_text: transcript.text.slice(0, 5000),
    completed_at: new Date().toISOString(),
  }).eq('id', jobId)

  return NextResponse.json({
    jobId,
    status: 'done',
    fileName: job.file_name,
    duration: Math.round(transcript.audio_duration),
    captions: captionResults,
    chapters: transcript.chapters,
    transcriptExcerpt: transcript.text.slice(0, 500),
    langs,
    formats,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function translateText(text: string, targetLang: string): Promise<string> {
  const prompt = TRANSLATE_PROMPTS[targetLang]
  if (!prompt) return text

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  })

  if (!res.ok) throw new Error(`OpenAI translation failed: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() ?? text
}

function rebuildWordsFromTranslation(
  originalWords: Array<{ text: string; start: number; end: number; confidence: number }>,
  translatedText: string,
): Array<{ text: string; start: number; end: number; confidence: number }> {
  const translatedTokens = translatedText.split(/\s+/).filter(Boolean)
  if (!translatedTokens.length || !originalWords.length) return originalWords

  const ratio = translatedTokens.length / originalWords.length
  return translatedTokens.map((text, i) => {
    const srcIndex = Math.min(Math.round(i / ratio), originalWords.length - 1)
    const srcWord = originalWords[srcIndex]
    return {
      text,
      start: srcWord.start,
      end: srcWord.end,
      confidence: srcWord.confidence,
    }
  })
}
