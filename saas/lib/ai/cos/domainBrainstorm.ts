// saas/lib/ai/cos/domainBrainstorm.ts
import { callCosReasoner } from './cosReasoner.ts'
import {
  BRANDABLE_TLDS,
  brainstormVerifiedDomains,
  parseGeneratedDomainSuggestions,
  resolveVerifiableTlds,
  type DomainSuggestion,
} from './domainAvailability.ts'

function excludesLegacyWords(input: string): boolean {
  return /(?:forget|without|not|no)\b[^.\n]{0,80}\b(?:signal|boost)|unrelated\s+to\s+(?:the\s+)?current\s+name/i.test(input)
}

function formatTldList(tlds: readonly string[]): string {
  const dotted = tlds.map(tld => `.${tld}`)
  if (dotted.length <= 1) return dotted[0] || ''
  return `${dotted.slice(0, -1).join(', ')}, and ${dotted[dotted.length - 1]}`
}

async function generateWithCos(input: string, count: number, excludedDomains: string[] = []): Promise<{ candidates: DomainSuggestion[]; modelInvoked: boolean }> {
  const excludeLegacy = excludesLegacyWords(input)
  const candidates: DomainSuggestion[] = []
  let modelInvoked = false
  const target = Math.max(30, count * 2)

  // The TLD set the reasoner is told to use is the set the registry can
  // actually answer for, resolved live from the IANA RDAP bootstrap and cached
  // 24h. Previously the prompt asked for .io while the verification layer had
  // no RDAP service for it, so every .io candidate came back UNVERIFIED and the
  // slot was wasted. Nothing is excluded by name here; capability decides.
  const { tlds } = await resolveVerifiableTlds(BRANDABLE_TLDS)
  const allowed = tlds.length ? tlds : [...BRANDABLE_TLDS]
  const tldInstruction = `Every domain you return MUST end in one of these TLDs, distributed across them rather than concentrated on one: ${formatTldList(allowed)}. A domain on any other TLD cannot be verified and will be discarded.`

  for (let attempt = 0; attempt < 2 && candidates.length === 0; attempt += 1) {
    const result = await callCosReasoner({
      temperature: attempt === 0 ? .8 : .95,
      maxTokens: 3600,
      jsonObject: true,
      frequencyPenalty: 0,
      presencePenalty: 0,
      systemPrompt: `You are COS performing a naming assignment for your principal. Return ONLY strict JSON: {"candidates":[{"name":"...","domain":"...","meaning":"..."}]}. Generate distinct, short, pronounceable, globally usable brand names for a platform that builds software and also delivers SaaS. ${tldInstruction} Prefer coined or compound words over dictionary words and over names already used by known software products, because common single words on these TLDs are almost always registered. Avoid famous brands, generic two-word clichés, and unsupported claims. Do not ask questions. Domain availability will be verified separately, so never claim a candidate is available.`,
      prompt: `OWNER REQUEST:\n${input}\n\nGenerate at least ${target} new candidates.${excludedDomains.length ? ` These domains were already generated or rejected by live registry checks and MUST NOT be repeated: ${excludedDomains.join(', ')}.` : ''}`,
    }).catch(() => null)
    modelInvoked ||= Boolean(result)
    const parsed = result?.text ? parseGeneratedDomainSuggestions(result.text, excludeLegacy, allowed) : []
    for (const candidate of parsed) if (!candidates.some(existing => existing.domain === candidate.domain)) candidates.push(candidate)
  }
  return { candidates: candidates.slice(0, 50), modelInvoked }
}

export async function runOwnerDomainBrainstorm(args: { input: string; context?: string }) {
  return brainstormVerifiedDomains({ ...args, generateImpl: generateWithCos })
}
