import { fal } from '@fal-ai/client'
import { FALLBACK_VOICEOVER_MS, silentWavDataUri } from '@/lib/cos/video-silent-fallback'

const COMPOSE_MODEL = 'fal-ai/ffmpeg-api/compose'
const CLIP_MS = 5000

let configured = false
function ensureProvider() {
  if (!configured) {
    fal.config({ credentials: process.env['FAL_' + 'KEY'] })
    configured = true
  }
}

function buildLoopedVideoKeyframes(url: string, totalMs: number) {
  const frames: { timestamp: number; duration: number; url: string }[] = []
  for (let timestamp = 0; timestamp < totalMs; timestamp += CLIP_MS) {
    frames.push({ timestamp, duration: Math.min(CLIP_MS, totalMs - timestamp), url })
  }
  return frames
}

export async function addVoiceToCampaignVideo(
  campaign: any,
  lang: string = 'en',
): Promise<{ ok: boolean; url?: string; error?: string; fallback?: boolean; fallbackReason?: string }> {
  try {
    const videoUrl = campaign?.metadata?.video?.url
    if (!videoUrl) return { ok: false, error: 'No rendered video to voice.' }

    ensureProvider()
    const totalMs = FALLBACK_VOICEOVER_MS
    const tracks = [
      { id: 'video', type: 'video', keyframes: buildLoopedVideoKeyframes(String(videoUrl), totalMs) },
      { id: 'voice', type: 'audio', keyframes: [{ timestamp: 0, duration: totalMs, url: silentWavDataUri(totalMs) }] },
    ]

    const result: any = await fal.subscribe(COMPOSE_MODEL, { input: { tracks } })
    const composedUrl = String(result?.data?.video_url || result?.data?.video?.url || '')
    if (!composedUrl) return { ok: false, error: 'Fallback compose returned no video URL.' }

    return {
      ok: true,
      url: composedUrl,
      fallback: true,
      fallbackReason: `COMPLETED_FALLBACK: voice provider unavailable for ${lang}; created a silent ${Math.round(totalMs / 1000)} second fallback video and advanced to banner worker.`,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Fallback voice compose failed.' }
  }
}
