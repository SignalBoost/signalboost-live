import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

type SupportedVideoLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type JsonSafeVideoResponse<T> = {
  ok: boolean
  data: T | null
  error: string | null
  meta: {
    locale: SupportedVideoLocale
    generatedAt: string
  }
}

const supportedLocales: SupportedVideoLocale[] = ['en', 'es', 'pt', 'pl', 'ru']
const maxUploadMb = 250

function json<T>(body: JsonSafeVideoResponse<T>, status = 200) {
  return NextResponse.json(body, { status })
}

function locale(value: FormDataEntryValue | null): SupportedVideoLocale {
  const requested = String(value || 'en')
  return supportedLocales.includes(requested as SupportedVideoLocale)
    ? requested as SupportedVideoLocale
    : 'en'
}

function safeFileName(name: string) {
  return String(name || 'video.mp4')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 140)
}

function extensionFromName(name: string) {
  const match = name.match(/\.([a-zA-Z0-9]+)$/)
  return match ? match[1].toLowerCase() : 'mp4'
}

export async function POST(request: Request) {
  const form = await request.formData()
  const lang = locale(form.get('locale'))
  const video = form.get('video')

  if (!(video instanceof File)) {
    return json(
      {
        ok: false,
        data: null,
        error: 'A video file is required.',
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      400,
    )
  }

  const sizeMb = Number((video.size / 1024 / 1024).toFixed(2))

  if (sizeMb > maxUploadMb) {
    return json(
      {
        ok: false,
        data: null,
        error: `Video upload limit is ${maxUploadMb} MB. Please upload a smaller file.`,
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      413,
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = process.env.VIDEO_STORAGE_BUCKET || 'video-storage'

  if (!supabaseUrl || !serviceRoleKey) {
    return json(
      {
        ok: false,
        data: null,
        error:
          'Video storage is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.',
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      500,
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const originalName = safeFileName(video.name || 'source-video.mp4')
  const ext = extensionFromName(originalName)
  const filename = `${randomUUID()}-${originalName.replace(/\.[^.]+$/, '')}.${ext}`
  const path = `uploads/${new Date().toISOString().slice(0, 10)}/${filename}`

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, video, {
      contentType: video.type || 'video/mp4',
      upsert: false,
    })

  if (uploadError) {
    return json(
      {
        ok: false,
        data: null,
        error: uploadError.message,
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      500,
    )
  }

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path)

  return json({
    ok: true,
    data: {
      filename,
      originalName,
      path,
      bucket,
      publicUrl: publicData.publicUrl,
      sizeMb,
      contentType: video.type || 'video/mp4',
    },
    error: null,
    meta: { locale: lang, generatedAt: new Date().toISOString() },
  })
}
