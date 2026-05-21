// saas/app/api/video/route.ts
// POST /api/video
// Accepts multipart/form-data: { file: File, langs: string (comma-separated), formats: string (comma-separated) }
// Returns: { jobId, status, captions: { lang, srt, vtt, ass }[], transcript, chapters, duration }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  uploadAudio,
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

// Plan limits: max video duration in minutes
const PLAN_VIDEO_LIMITS: Record<string, number> = {
  trial:    5,
  starter:  30,
  pro:      120,
  business: 999,
}

const SUPPORTED_LANGS = ['en', 'pt', 'es', 'pl', 'ru']

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  pt: 'Português',
  es: 'Español',
  pl: 'Polski',
  ru: 'Русский',
}

// GPT translation prompt per language
const TRANSLATE_PROMPTS: Record<string, string> = {
  pt: 'Translate the following English text to Brazilian Portuguese. Preserve all punctuation and line breaks. Return only the translated text.',
  es: 'Translate the following English text to Spanish (LATAM). Preserve all punctuation and line breaks. Return only the translated text.',
  pl: 'Translate the following English text to Polish. Preserve all punctuation and line breaks. Return only the translated text.',
  ru: 'Translate the following English text to Russian. Preserve all punctuation and line breaks. Return only the translated text.',
}

export const maxDuration = 300  // 5 min Vercel function timeout (Pro plan needed for longer)

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // ── Parse multipart form ──────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const langsRaw = (formData.get('langs') as string | null) ?? 'en'
  const formatsRaw = (formData.get('formats') as string | null) ?? 'srt'

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Validate file type
  const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4']
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp4|mov|avi|mkv|webm|mp3|wav|m4a)$/i)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }

  const langs = langsRaw.split(',').map(l => l.trim()).filter(l => SUPPORTED_LANGS.includes(l))
  if (!langs.length) langs.push('en')

  const formats = formatsRaw.split(',').map(f => f.trim()).filter(f => ['srt', 'vtt', 'ass'].includes(f))
  if (!formats.length) formats.push('srt')

  // ── Plan check ────────────────────────────────────────────────────────────
  const plan = await getUserPlan(supabaseAdmin, user.id)
  const maxMinutes = PLAN_VIDEO_LIMITS[plan] ?? 5

  // File size proxy for duration check (rough: 1MB ≈ 1 min for compressed video)
  const fileSizeMB = file.size / (1024 * 1024)
  if (fileSizeMB > maxMinutes * 100) {
    return NextResponse.json(
      { error: `File too large for your ${plan} plan. Max ~${maxMinutes} minutes.` },
      { status: 413 },
    )
  }

  // ── Create job record ─────────────────────────────────────────────────────
  const jobId = crypto.randomUUID()
  await supabaseAdmin.from('video_jobs').insert({
    id: jobId,
    user_id: user.id,
    file_name: file.name,
    file_size: file.size,
    langs,
    formats,
    status: 'uploading',
    plan,
  })

  // ── Upload to AssemblyAI ──────────────────────────────────────────────────
  let uploadUrl: string
  try {
    await supabaseAdmin.from('video_jobs').update({ status: 'uploading' }).eq('id', jobId)
    const buffer = await file.arrayBuffer()
    uploadUrl = await uploadAudio(buffer)
  } catch (err) {
    console.error('AssemblyAI upload error:', err)
    await supabaseAdmin.from('video_jobs').update({ status: 'error', error: 'Upload failed' }).eq('id', jobId)
    return NextResponse.json({ error: 'Failed to upload file for transcription' }, { status: 502 })
  }

  // ── Transcribe ────────────────────────────────────────────────────────────
  let transcript: TranscriptResult
  try {
    await supabaseAdmin.from('video_jobs').update({ status: 'transcribing' }).eq('id', jobId)
    const transcriptId = await startTranscription(uploadUrl, 'en')
    transcript = await pollTranscription(transcriptId)

    if (transcript.status === 'error') {
      throw new Error(transcript.error ?? 'Transcription failed')
    }
  } catch (err) {
    console.error('AssemblyAI transcription error:', err)
    await supabaseAdmin.from('video_jobs').update({ status: 'error', error: 'Transcription failed' }).eq('id', jobId)
    return NextResponse.json({ error: 'Transcription failed' }, { status: 502 })
  }

  // ── Generate captions for each language ──────────────────────────────────
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

  for (const lang of langs) {
    let words = transcript.words

    // For non-English, translate the text and rebuild word list with original timestamps
    if (lang !== 'en') {
      try {
        const translatedText = await translateText(transcript.text, lang)
        // Use translated text split back onto original timestamps (approximate)
        words = rebuildWordsFromTranslation(transcript.words, translatedText)
      } catch (err) {
        console.error(`Translation failed for ${lang}:`, err)
        // Fall back to English captions for this language
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

      if (!uploadError) {
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

  // ── Store transcript ──────────────────────────────────────────────────────
  const transcriptKey = `${user.id}/${jobId}/transcript.json`
  await supabaseAdmin.storage
    .from(VIDEO_BUCKET)
    .upload(transcriptKey, new Blob([JSON.stringify(transcript)], { type: 'application/json' }), { upsert: true })

  // ── Finalise job ──────────────────────────────────────────────────────────
  await supabaseAdmin.from('video_jobs').update({
    status: 'done',
    duration_seconds: Math.round(transcript.audio_duration),
    captions: captionResults,
    chapters: transcript.chapters,
    transcript_text: transcript.text.slice(0, 5000),  // store excerpt for display
    completed_at: new Date().toISOString(),
  }).eq('id', jobId)

  return NextResponse.json({
    jobId,
    status: 'done',
    fileName: file.name,
    duration: Math.round(transcript.audio_duration),
    captions: captionResults,
    chapters: transcript.chapters,
    transcriptExcerpt: transcript.text.slice(0, 500),
    langs,
    formats,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getUserPlan(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (!data?.plan) return 'trial'
  const plan = String(data.plan).toLowerCase()
  return ['trial', 'starter', 'pro', 'business'].includes(plan) ? plan : 'trial'
}

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

// Maps translated text back onto original word timestamps
// Strategy: split translated text into tokens, distribute across original word count
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
