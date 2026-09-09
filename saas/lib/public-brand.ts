export const PUBLIC_BRAND = {
  name: 'iTMounts',
  siteUrl: 'https://itmounts.com',
  tagline: 'AI software that works for you',
} as const

const LEGACY_PUBLIC_BRAND_PATTERN = /\bSignalBoost(?:Ai|\s+AI)?\b/gi

/**
 * Keep implementation identifiers stable while presenting the current public brand.
 * This is intentionally a display-layer transform: domains, repository names, database
 * identifiers, COS/Builder internals, and legacy contact addresses are not rewritten.
 */
export function publicBrandText(value: string): string {
  return value.replace(LEGACY_PUBLIC_BRAND_PATTERN, PUBLIC_BRAND.name)
}
