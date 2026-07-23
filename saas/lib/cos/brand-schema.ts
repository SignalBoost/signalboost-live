export const BRAND_SCHEMA_VERSION = 7

// Burned-in video overlay brand. A configured buyer (PORTABLE_BRAND_NAME) wins; a blank
// sold copy shows a neutral placeholder; SignalBoost's own deployment keeps 'SignalBoostAi'
// and its URL exactly as before. This is the name/URL rendered INTO delivered videos, so it
// must never leak the seller's brand onto a buyer's asset.
import { isSoldCopy, portableBrandUrl } from '@/lib/portable/companyIdentity'

function overlayName(): string {
  const configured = String(process.env.PORTABLE_BRAND_NAME || '').trim()
  if (configured) return configured
  return isSoldCopy() ? '[YOUR COMPANY]' : 'SignalBoostAi'
}

export const BRAND_TEXT = {
  name: overlayName(),
  url: portableBrandUrl(),
}
