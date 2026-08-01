// saas/lib/outreach/publish-mode.ts
// Resolve the buyer's chosen publish mode for a platform, falling back to the
// provider's safe default. Never throws — on any read error returns the default.
// Relative import with an explicit extension, not the @/ host alias: the alias is a
// SignalBoost tsconfig path that does not resolve when a buyer extracts this folder.
// Every other file in this layer already imports relatively; this was the outlier.
import { platformAvailableModes, platformDefaultMode, type SocialPlatform, type PublishMode } from './social-connectors.ts'

export async function resolvePublishMode(admin: any, userId: string, platform: SocialPlatform): Promise<PublishMode> {
  try {
    const { data } = await admin
      .from('outreach_social_settings')
      .select('publish_mode')
      .eq('user_id', userId)
      .eq('platform', platform)
      .maybeSingle()
    const stored = data?.publish_mode ? (String(data.publish_mode) as PublishMode) : null
    if (stored && platformAvailableModes(platform).includes(stored)) return stored
  } catch {}
  return platformDefaultMode(platform)
}
