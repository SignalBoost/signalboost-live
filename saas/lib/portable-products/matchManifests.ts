// saas/lib/portable-products/matchManifests.ts
//
// MATCH A CAMPAIGN'S OFFER TEXT TO THE PRODUCTS IT IS ACTUALLY SELLING.
//
// The offer is free text a person typed into a campaign brief, and the product_key stored
// on each queued draft is a slug of it. Neither is a product id, so both need matching
// rather than lookup — and the first version of this did an exact slug comparison, which
// failed on the two cases that actually occur:
//
//   ONE CAMPAIGN, TWO PRODUCTS. Real briefs sell more than one thing: "Self-Healing
//   Supervisor and Marketing and Sales Engine" slugs to a key matching no manifest, so
//   every draft in the queue was skipped as unrecognised. Matching must return a LIST.
//
//   THE SAME PRODUCT, WRITTEN LIKE A HUMAN. Nobody types "Marketing + Sales Engine
//   Software". They type "Marketing and Sales Engine". An exact comparison treats those
//   as different products; a buyer would not.
//
// So the comparison is on meaningful WORDS. Both sides are reduced to tokens, connector
// and category filler is dropped, and a manifest matches when its tokens all appear in
// the offer in order. Order matters: it keeps "sales engine" from matching a manifest
// whose name merely contains both words somewhere.

import { portableProductManifests } from './manifests/index.ts'
import type { PortableProductManifest } from './manifestTypes.ts'

// Dropped from both sides. 'software' and 'engine' are category filler in these names —
// every second product carries one — while the distinguishing words (press, media,
// supervisor, browser, marketing, sales) are never in this list.
const FILLER = new Set(['and', 'the', 'a', 'an', 'of', 'for', 'with', 'plus', 'software', 'suite', 'platform', 'system'])

function tokens(value: string): string[] {
  return String(value || '')
    .toLowerCase()
    .replace(/[+&]/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(word => word && !FILLER.has(word))
}

/** True when `needle` appears inside `haystack` as a contiguous run of words. */
function containsSequence(haystack: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > haystack.length) return false
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let hit = true
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) { hit = false; break }
    }
    if (hit) return true
  }
  return false
}

/**
 * Every product an offer or product_key refers to, in manifest order. Empty when nothing
 * matches — which stays a deliberate outcome: a campaign selling something the manifests
 * do not describe gets no fact sheet rather than the nearest-looking product's.
 */
export function manifestsForOffer(offerOrProductKey: string | null | undefined): PortableProductManifest[] {
  const offer = tokens(offerOrProductKey || '')
  if (!offer.length) return []

  const matched: PortableProductManifest[] = []
  for (const manifest of portableProductManifests) {
    const byName = tokens(manifest.displayName)
    const byId = tokens(manifest.productId)
    if (containsSequence(offer, byName) || containsSequence(offer, byId)) matched.push(manifest)
  }
  return matched
}

/** Convenience for callers that only need to know whether anything matched. */
export function firstManifestForOffer(offerOrProductKey: string | null | undefined): PortableProductManifest | undefined {
  return manifestsForOffer(offerOrProductKey)[0]
}
