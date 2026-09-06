import { callCosReasoner } from './cosReasoner.ts'
import {
  brainstormVerifiedDomains,
  parseGeneratedDomainSuggestions,
  type DomainSuggestion,
} from './domainAvailability.ts'

function excludesLegacyWords(input: string): boolean {
  return /(?:forget|without|not|no)\b[^.\n]{0,80}\b(?:signal|boost)|unrelated\s+to\s+(?:the\s+)?current\s+name/i.test(input)
}

async function generateWithCos(input: string, count: number, excludedDomains: string[] = []): Promise<{ candidates: DomainSuggestion[]; modelInvoked: boolean }> {
  const excludeLegacy = excludesLegacyWords(input)
  const candidates: DomainSuggestion[] = []
  let modelInvoked = false
  const target = Math.max(30, count * 2)
  for (let attempt = 0; attempt < 2 && candidates.length === 0; attempt += 1) {
    const result = await callCosReasoner({
      temperature: attempt === 0 ? .8 : .95,
      maxTokens: 3600,
      jsonObject: true,
      frequencyPenalty: 0,
      presencePenalty: 0,
      systemPrompt: 'You are COS performing a naming assignment for your principal. Return ONLY strict JSON: {"candidates":[{"name":"...","domain":"...","meaning":"..."}]}. Return the full requested candidate count in one response. Coin distinct, short, pronounceable, globally usable names for a platform that builds software and also delivers SaaS; favor original invented words over existing brands, abbreviations, and generic two-word clichés. Distribute candidates across .com, .ai, .dev, .app, and .io instead of concentrating on one TLD. Obey all naming exclusions in the owner conversation. Do not ask questions. Domain availability will be verified separately, so never claim a candidate is available.',
      prompt: `OWNER REQUEST:\n${input}\n\nGenerate at least ${target} new candidates.${excludedDomains.length ? ` These domains were already generated or rejected by live registry checks and MUST NOT be repeated: ${excludedDomains.join(', ')}.` : ''}`,
    }).catch(() => null)
    modelInvoked ||= Boolean(result)
    const parsed = result?.text ? parseGeneratedDomainSuggestions(result.text, excludeLegacy) : []
    for (const candidate of parsed) if (!candidates.some(existing => existing.domain === candidate.domain)) candidates.push(candidate)
  }
  return { candidates: candidates.slice(0, 50), modelInvoked }
}

export async function runOwnerDomainBrainstorm(args: { input: string; context?: string }) {
  return brainstormVerifiedDomains({ ...args, generateImpl: generateWithCos })
}
