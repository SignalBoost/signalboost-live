// saas/lib/cos/video-voice.ts
// Generates a real voiceover for a campaign video using ElevenLabs (with
// OpenAI tts-1-hd as fallback) and uploads the MP3 to Supabase Storage so
// the brand-overlay worker can composite it onto the video.
//
// Previously this was a stub that returned the base video URL unchanged
// (causing robotic/no-voice audio). Now it calls generateSpeech() and
// uploads the result to the cos-voice-audio bucket.

import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { generateSpeech } from '@/lib/elevenlabs/client'
import { CURATED_VOICES, DEFAULT_MODEL_ID } from '@/lib/elevenlabs/voices'
import { isVoiceQuotaError } from '@/lib/cos/video-silent-fallback'

const VOICE_BUCKET = 'cos-voice-audio'
const SIGNED_URL_TTL = 60 * 60 * 6 // 6 hours — long enough for the brand overlay worker
const MAX_SCRIPT_CHARS = 4000

// ── Voice selection ──────────────────────────────────────────────────────────

/** Map a campaign language code to a curated ElevenLabs voice id. */
function pickVoiceId(lang: string): string {
  const map: Record<string, string> = {
    en:    'EXAVITQu4vr4xnSDxMaL', // Sarah — English female
    'pt-BR': 'XB0fDUnXU5powFXDhCwa', // Charlotte — pt-BR female
    'pt-PT': 'Xb7hH8MSUJpSbSDYk0k2', // Alice — pt-PT female
    pt:    'XB0fDUnXU5powFXDhCwa', // fallback to pt-BR
    'es-LATAM': '9BWtsMINqrJLrRacOk9x', // Aria — es-LATAM female
    'es-ES': 'FGY2WhTYpPnrIDTdsKH5', // Laura — es-ES female
    es:    '9BWtsMINqrJLrRacOk9x', // fallback to es-LATAM
    pl:    'ThT5KcBeYPX3keUQqHPh', // Dorothy — Polish female
    ru:    'z9fAnlkpzviPz146aGWa', // Glinda — Russian female
  }
  return map[lang] || map['en']
}

// ── Script extraction ─────────────────────────────────────────────────────────

/** Pull the best available script text from a campaign row. */
function extractScript(campaign: any, lang: string): string {
  const meta = campaign?.metadata || {}
  const scripts: Record<string, string> = meta.scripts || meta.voiceScripts || {}

  // Try the requested language first, then English, then any available
  const candidates = [
    scripts[lang],
    scripts['en'],
    ...Object.values(scripts),
    meta.script,
    meta.voiceScript,
    campaign.description,
    campaign.title,
  ]

  for (const c of candidates) {
    const s = String(c || '').trim()
    if (s.length >= 10) return s.slice(0, MAX_SCRIPT_CHARS)
  }

  return ''
}

// ── Supabase admin client ─────────────────────────────────────────────────────

function adminSupabase() {
  return createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  )
}

// ── Storage helpers ───────────────────────────────────────────────────────────

async function ensureVoiceBucket(sb: ReturnType<typeof adminSupabase>): Promise<void> {
  const { data: buckets } = await sb.storage.listBuckets()
  const exists = (buckets || []).some((b: any) => b.name === VOICE_BUCKET || b.id === VOICE_BUCKET)
  if (exists) return

  const { error } = await sb.storage.createBucket(VOICE_BUCKET, {
    public: false,
    fileSizeLimit: 20 * 1024 * 1024, // 20 MB
    allowedMimeTypes: ['audio/mpeg'],
  })
  // Ignore "already exists" races
  if (error && !String(error.message || '').toLowerCase().includes('already')) {
    throw new Error(`Failed to create voice bucket: ${error.message}`)
  }
}

async function uploadAudio(
  sb: ReturnType<typeof adminSupabase>,
  key: string,
  buffer: ArrayBuffer,
): Promise<void> {
  const { error } = await sb.storage
    .from(VOICE_BUCKET)
    .upload(key, Buffer.from(buffer), { contentType: 'audio/mpeg', upsert: true })
  if (error) throw new Error(`Voice audio upload failed: ${error.message}`)
}

async function signedUrl(
  sb: ReturnType<typeof adminSupabase>,
  key: string,
): Promise<string> {
  const { data, error } = await sb.storage
    .from(VOICE_BUCKET)
    .createSignedUrl(key, SIGNED_URL_TTL)
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to sign voice audio URL: ${error?.message || 'no signedUrl'}`)
  }
  return data.signedUrl
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate a real voiceover MP3 for the campaign video in the requested
 * language, upload it to Supabase Storage, and return a signed URL that the
 * brand-overlay worker can use.
 *
 * Falls back to the base video URL (silent pass-through) only when:
 *  - No script text is available, OR
 *  - The TTS provider returns a quota / billing error.
 *
 * Any other error is surfaced as { ok: false } so the caller can log it.
 */
export async function addVoiceToCampaignVideo(
  campaign: any,
  lang: string = 'en',
): Promise<{ ok: boolean; url?: string; error?: string; fallback?: boolean; fallbackReason?: string }> {
  try {
    const videoUrl = String(
      campaign?.metadata?.video?.url ||
      campaign?.metadata?.video?.previewUrl ||
      '',
    ).trim()

    if (!videoUrl) {
      return { ok: false, error: 'No rendered video to voice.' }
    }

    // ── 1. Extract script ──────────────────────────────────────────────────
    const script = extractScript(campaign, lang)

    if (!script) {
      // No script — pass the base video through so branding can still run
      return {
        ok: true,
        url: videoUrl,
        fallback: true,
        fallbackReason: `NO_SCRIPT: no voice script found for lang=${lang}; passing base video to brand overlay.`,
      }
    }

    // ── 2. Generate speech ─────────────────────────────────────────────────
    const voiceId = pickVoiceId(lang)
    let audioBuffer: ArrayBuffer

    try {
      audioBuffer = await generateSpeech({
        text: script,
        voiceId,
        modelId: DEFAULT_MODEL_ID,
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0,
      })
    } catch (ttsErr) {
      const errMsg = ttsErr instanceof Error ? ttsErr.message : String(ttsErr)

      // Quota / billing errors → silent fallback (don't block the video)
      if (isVoiceQuotaError(ttsErr)) {
        console.warn(`[video-voice] TTS quota error for campaign ${campaign?.id}, lang=${lang}: ${errMsg}`)
        return {
          ok: true,
          url: videoUrl,
          fallback: true,
          fallbackReason: `QUOTA_FALLBACK: ${errMsg}`,
        }
      }

      // All other TTS errors → hard failure so the caller logs it
      return { ok: false, error: `TTS generation failed: ${errMsg}` }
    }

    // ── 3. Upload to Supabase Storage ──────────────────────────────────────
    const sb = adminSupabase()
    await ensureVoiceBucket(sb)

    const hash = crypto
      .createHash('sha256')
      .update(`${campaign?.id || 'unknown'}::${lang}::${voiceId}::${script.slice(0, 200)}`)
      .digest('hex')
      .slice(0, 32)

    const storageKey = `${campaign?.id || 'unknown'}/${lang}/${hash}.mp3`
    await uploadAudio(sb, storageKey, audioBuffer)

    const audioUrl = await signedUrl(sb, storageKey)

    return { ok: true, url: audioUrl, fallback: false }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Voice generation failed.',
    }
  }
}
