// saas/lib/portable-products/cos-summary.ts
import { portableProductRegistry } from './product-registry.ts'

// Compact, always-current product catalog for AI system prompts (COS and
// Concierge). Built directly from the SAME canonical registry that drives
// the buyer-facing /dashboard/portable-products page, so this can never
// drift out of sync with what SignalBoost actually offers — no hand-typed
// duplicate list to go stale. If a product is added, renamed, or its status
// changes in the registry, this updates automatically on next request.
export function buildProductCatalogSummary(): string {
  const entries = [...portableProductRegistry]
    .filter(p => p.manifest.publicVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  if (entries.length === 0) return ''

  const lines = entries.map(p => {
    const m = p.manifest
    return `- ${m.displayName} (${m.status}): ${m.shortDescription}`
  })

  const allLanguages = entries.every(p =>
    p.manifest.supportedLanguages.length === 5 &&
    ['en', 'es', 'pt', 'pl', 'ru'].every(l => p.manifest.supportedLanguages.includes(l)),
  )

  return [
    'SIGNALBOOST PRODUCT CATALOG — the full current product lineup you work for. This is generated from the canonical registry, not memorized: treat it as ground truth. Never invent a product, omit one, or misdescribe its status. If asked about something not listed here, say plainly you are not aware of it as a current SignalBoost product rather than guessing.',
    ...lines,
    allLanguages
      ? 'Every listed product supports the same 5 languages: English, Spanish, Portuguese, Polish, Russian.'
      : '', // omitted if the registry ever stops being uniform — do not hardcode the claim
  ].filter(Boolean).join('\n')
}
