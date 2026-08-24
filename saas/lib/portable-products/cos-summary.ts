// saas/lib/portable-products/cos-summary.ts
import { portableProductRegistry } from './product-registry.ts'
import { FACTUAL_DISCIPLINE } from '@/portable-kernel'

// Compact, always-current product catalog for AI system prompts (COS and
// Concierge). Built directly from the SAME canonical registry that drives
// the buyer-facing /dashboard/portable-products page, so this can never
// drift out of sync with what SignalBoost actually offers — no hand-typed
// duplicate list to go stale. If a product is added, renamed, or its status
// changes in the registry, this updates automatically on next request.
//
// ─────────────────────────────────────────────────────────────────────────────
// AND THE RULES FOR TALKING ABOUT IT.
//
// The catalog above already said "never invent a product". That was one rule about
// one kind of fact, and everything else was left open — so on 5 Aug 2026 COS wrote a
// press brief aimed at TechCrunch containing a market size, a CAGR, an enterprise
// adoption percentage, an industry time-spend figure, two competitive superlatives,
// and the claim that every Self-Healing Supervisor action is reversible. None of it
// came from a tool. It came from the model.
//
// The generation paths were already protected: press-media-host/ports.ts and the video
// script worker both prepend the kernel's FACTUAL_DISCIPLINE. The CHAT path never did,
// which is exactly the path the owner uses to draft the things that get sent to
// journalists. So the same kernel constant is prepended here, in the one block that is
// appended UNCONDITIONALLY to every persona — owner, admin and public Concierge alike.
//
// WHY THIS MODULE AND NOT A NEW ONE: the catalog is what tells the AI who it works for
// and what that employer sells. The limits on what may be claimed about those products
// are inseparable from the list of them; splitting the two invites a future prompt to
// include one without the other, which is precisely the failure being fixed.
//
// The kernel rules are written for RELEASE generation, where an unknown fact becomes a
// visible [PLACEHOLDER]. In conversation a placeholder is wrong — the honest move is to
// say the number is not known. The chat rules below adapt that, and name the specific
// failures observed rather than restating the general principle a fourth time.
const CHAT_CLAIM_RULES = [
  'IN CONVERSATION, APPLY THOSE RULES AS FOLLOWS:',
  'a. A bracketed placeholder belongs in generated copy, not in chat. Here, say plainly that you do not have the figure and name what would produce it — a search, a tool, or the owner.',
  'b. NEVER PRESENT A CLAIM AS SOURCED THAT YOU DID NOT SOURCE. Phrases like "publicly sourced", "verified", "quotable in press materials", "according to industry data" are forbidden unless a tool in THIS conversation returned that fact and you can name the tool. A fabricated figure labelled as verified is worse than a fabricated figure, because it switches off the reader\'s own check.',
  'c. Market sizes, CAGRs, adoption percentages, analyst forecasts, and "teams spend X% of their time" statistics are NEVER written from memory. Not approximately, not "roughly", not with a hedge. If you have not retrieved it in this conversation, it does not go in the text.',
  'd. Competitive superlatives — "the only", "the first", "no mainstream competitor offers", "the leading" — require evidence you do not have. Describe what the product does instead; a specific capability is more persuasive than a superlative and it survives a journalist checking it.',
  'e. SELF-HEALING SUPERVISOR IS NEVER DESCRIBED AS "REVERSIBLE". It snapshots state and COMPENSATES; some actions cannot be undone at all, which is why they are refused before they start rather than rolled back after. Write "snapshot-first", "compensating", or "refused when it cannot be checkpointed". "Every action is reversible" is a false statement about this product.',
  'f. Editorial contacts, publication names and submission addresses come from the findPublications tool, which reads them from the outlet\'s own site. Never write an editor address, a publication name or a submissions URL from memory, however confident you are that it is right.',
  'g. These rules bind hardest when the output is going OUTSIDE the company — a press brief, a pitch, an editor email, marketing copy. That is the moment a wrong fact stops being a mistake and becomes a published one.',
  'h. FACTS THE USER EXPLICITLY SUPPLIES IN THE CURRENT REQUEST ARE VALID TASK PREMISES. They are not private SignalBoost records retrieved by the assistant. You may reason over, compare, calculate from, and restate those supplied facts. Do not refuse merely because the scenario describes a private company, confidential term sheet, internal metric, or non-public business fact. Instead, make clear that those facts are user-supplied and were not independently verified. The public-only boundary forbids retrieving undisclosed private SignalBoost data; it does not forbid reasoning from information the user just gave you.',
].join('\n')

export function buildProductCatalogSummary(): string {
  const entries = [...portableProductRegistry]
    .filter(p => p.manifest.publicVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // The discipline is NOT conditional on the catalog having entries. An empty registry is
  // exactly when a model is most likely to fill the silence with something plausible.
  const claimRules = `${FACTUAL_DISCIPLINE}\n\n${CHAT_CLAIM_RULES}`

  if (entries.length === 0) return claimRules

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
    '',
    claimRules,
  ].filter(Boolean).join('\n')
}
