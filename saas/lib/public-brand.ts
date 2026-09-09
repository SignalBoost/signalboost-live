// saas/lib/public-brand.ts
export const PUBLIC_BRAND = {
  name: 'iTMounts',
  siteUrl: 'https://itmounts.com',
  tagline: 'AI software that works for you',
} as const

/** Hostname only, no scheme. This is what the burned-in video overlay and CTA copy render. */
export const PUBLIC_BRAND_DOMAIN = new URL(PUBLIC_BRAND.siteUrl).hostname

/**
 * Accepts the canonical domain and, for the duration of the iTMounts migration, the retired
 * SignalBoost origin — so campaigns already carrying the old burned-in banner are not blocked
 * at approval. Tighten this to PUBLIC_BRAND_DOMAIN alone once the queue has drained.
 */
export const BRANDED_URL_PATTERN = /(?:itmounts\.com|saas\.signalboostapp\.com)/i

const LEGACY_PUBLIC_BRAND_PATTERN = /\bSignalBoost(?:Ai|\s+AI)?\b/gi

/**
 * Keep implementation identifiers stable while presenting the current public brand.
 * This is intentionally a display-layer transform: domains, repository names, database
 * identifiers, COS/Builder internals, and legacy contact addresses are not rewritten.
 */
export function publicBrandText(value: string): string {
  return value.replace(LEGACY_PUBLIC_BRAND_PATTERN, PUBLIC_BRAND.name)
}
