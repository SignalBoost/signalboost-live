export async function addVoiceToCampaignVideo(campaign: any, lang: string = 'en'): Promise<{ ok: boolean; url?: string; error?: string }> {
  const videoUrl = campaign?.metadata?.video?.url
  if (!videoUrl) return { ok: false, error: 'No rendered video to voice.' }
  return { ok: true, url: String(videoUrl) }
}
