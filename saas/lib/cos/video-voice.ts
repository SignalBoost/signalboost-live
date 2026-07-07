export async function addVoiceToCampaignVideo(
  campaign: any,
  lang: string = 'en',
): Promise<{ ok: boolean; url?: string; error?: string; fallback?: boolean; fallbackReason?: string }> {
  try {
    const videoUrl = String(campaign?.metadata?.video?.url || campaign?.metadata?.video?.previewUrl || '').trim()
    if (!videoUrl) return { ok: false, error: 'No rendered video to voice.' }

    return {
      ok: true,
      url: videoUrl,
      fallback: true,
      fallbackReason: `COST_SAFETY_FALLBACK: using rendered base video for ${lang} and advancing to the brand overlay worker.`,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Voice fallback failed.' }
  }
}
