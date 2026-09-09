// saas/lib/cos/brand-schema.ts
export const BRAND_SCHEMA_VERSION = 8

// Burned-in video overlay brand. A configured buyer (PORTABLE_BRAND_NAME) wins; a blank
// sold copy shows a neutral placeholder; the seller's own deployment uses the public brand
// and its URL exactly as before. This is the name/URL rendered INTO delivered videos, so it
// must never leak the seller's brand onto a buyer's asset.
import { isSoldCopy, portableBrandUrl } from '@/lib/portable/companyIdentity'
import { PUBLIC_BRAND } from '@/lib/public-brand'

function overlayName(): string {
  const configured = String(process.env.PORTABLE_BRAND_NAME || '').trim()
  if (configured) return configured
  return isSoldCopy() ? '[YOUR COMPANY]' : PUBLIC_BRAND.name
}

export const BRAND_TEXT = {
  name: overlayName(),
  url: portableBrandUrl(),
}
