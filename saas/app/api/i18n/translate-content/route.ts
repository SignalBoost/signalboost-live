// saas/app/api/i18n/translate-content/route.ts
// Authenticated translation endpoint used by the global generated-content
// localizer. Original documents remain untouched; translated display copies are
// cached by user, source hash, and target language when the cache table exists.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import {
  generatedContentSourceHash,
  normalizeGeneratedContentSegments,
  translateGeneratedContent,
  type GeneratedContentSegment,
} from '@/lib/i18n/contentTranslation'
import { normalizeReportLang } from '@/lib/i18n/reportLanguage'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 120

type RequestBody = {
  segments?: unknown
  targetLanguage?: string
  targetLang?: string
  sourceLanguage?: string
  sourceLang?: string
  contentKind?: string
}

type CachedPayload = {
  segments?: GeneratedContentSegment[]
  sourceLanguage?: string
  targetLanguage?: string
}

function safeContentKind(value: unknown): string {
  const normalized = String(value || 'generated-content').trim().slice(0, 80)
  return normalized || 'generated-content'
}

async function readCache(params: {
  admin: ReturnType<typeof getAdminSupabase>
  userId: string
  sourceHash: string
  targetLanguage: string
}): Promise<CachedPayload | null> {
  try {
    const result = await params.admin
      .from('generated_content_translations')
      .select('translated_payload,source_language,target_language')
      .eq('user_id', params.userId)
      .eq('source_hash', params.sourceHash)
      .eq('target_language', params.targetLanguage)
      .maybeSingle()

    if (result.error || !result.data) return null
    const payload = result.data.translated_payload as CachedPayload | null
    const segments = normalizeGeneratedContentSegments(payload?.segments)
    if (!segments.length) return null
    return {
      segments,
      sourceLanguage: String(result.data.source_language || payload?.sourceLanguage || ''),
      targetLanguage: String(result.data.target_language || payload?.targetLanguage || ''),
    }
  } catch {
    // Translation remains functional before the optional cache migration runs.
    return null
  }
}

async function writeCache(params: {
  admin: ReturnType<typeof getAdminSupabase>
  userId: string
  sourceHash: string
  sourceLanguage: string
  targetLanguage: string
  contentKind: string
  segments: GeneratedContentSegment[]
}) {
  try {
    await params.admin.from('generated_content_translations').upsert({
      user_id: params.userId,
      source_hash: params.sourceHash,
      source_language: params.sourceLanguage,
      target_language: params.targetLanguage,
      content_kind: params.contentKind,
      translated_payload: {
        sourceLanguage: params.sourceLanguage,
        targetLanguage: params.targetLanguage,
        segments: params.segments,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,source_hash,target_language' })
  } catch {
    // Cache failures must not prevent the user from viewing a translation.
  }
}

export async function POST(req: NextRequest) {
  const access = await getAccess()
  if (!access.userId) {
    return NextResponse.json({ ok: false, code: 'authentication_required' }, { status: 401 })
  }

  let body: RequestBody
  try {
    body = await req.json() as RequestBody
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }

  const segments = normalizeGeneratedContentSegments(body.segments)
  if (!segments.length) {
    return NextResponse.json({ ok: false, code: 'invalid_segments' }, { status: 400 })
  }

  const targetLanguage = normalizeReportLang(body.targetLanguage || body.targetLang)
  const sourceLanguage = body.sourceLanguage || body.sourceLang || null
  const sourceHash = generatedContentSourceHash(segments, sourceLanguage)
  const admin = getAdminSupabase()

  const cached = await readCache({
    admin,
    userId: access.userId,
    sourceHash,
    targetLanguage,
  })
  if (cached) {
    return NextResponse.json({
      ok: true,
      cached: true,
      sourceHash,
      sourceLanguage: normalizeReportLang(cached.sourceLanguage),
      targetLanguage,
      segments: cached.segments,
    })
  }

  try {
    const translation = await translateGeneratedContent({
      segments,
      targetLanguage,
      sourceLanguage,
    })

    await writeCache({
      admin,
      userId: access.userId,
      sourceHash: translation.sourceHash,
      sourceLanguage: translation.sourceLanguage,
      targetLanguage: translation.targetLanguage,
      contentKind: safeContentKind(body.contentKind),
      segments: translation.segments,
    })

    return NextResponse.json({
      ok: true,
      cached: false,
      ...translation,
    })
  } catch (error) {
    // Never break a page because translation is unavailable. The original text
    // remains authoritative and is returned unchanged. Do not cache this result,
    // so a later request can translate normally once the local model is healthy.
    console.warn('generated content local translation unavailable; serving original content', error instanceof Error ? error.message : error)
    return NextResponse.json({
      ok: true,
      cached: false,
      fallback: 'source-content',
      sourceHash,
      sourceLanguage: sourceLanguage ? normalizeReportLang(sourceLanguage) : 'en',
      targetLanguage,
      segments,
    })
  }
}
