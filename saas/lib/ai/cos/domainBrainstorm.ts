import { callCosReasoner } from './cosReasoner.ts'
import {
  brainstormVerifiedDomains,
  parseGeneratedDomainSuggestions,
  type DomainSuggestion,
} from './domainAvailability.ts'

function excludesLegacyWords(input: string): boolean {
  return /(?:forget|without|not|no)\b[^.\n]{0,80}\b(?:signal|boost)|unrelated\s+to\s+(?:the\s+)?current\s+name/i.test(input)
}

async function generateWithCos(input: string, count: number): Promise<{ candidates: DomainSuggestion[]; modelInvoked: boolean }> {
  const excludeLegacy = excludesLegacyWords(input)
  const candidates: DomainSuggestion[] = []
  let modelInvoked = false
  for (let attempt = 0; attempt < 2 && candidates.length < Math.max(30, count * 2); attempt += 1) {
    const result = await callCosReasoner({
      temperature: attempt === 0 ? .8 : .95,
      maxTokens: 3600,
      systemPrompt: 'You are COS performing a naming assignment for your principal. Return ONLY strict JSON: {"candidates":[{"name":"...","domain":"...","meaning":"..."}]}. Generate distinct, short, pronounceable, globally usable brand names for a platform that builds software and also delivers SaaS. Use .com, .ai, .dev, .app, or .io. Avoid famous brands, generic two-word clichés, and unsupported claims. Do not ask questions. Domain availability will be verified separately, so never claim a candidate is available.',
      prompt: `OWNER REQUEST:\n${input}\n\nGenerate at least ${Math.max(30, count * 2)} candidates.${attempt ? ` Do not repeat these earlier candidates: ${candidates.map(candidate => candidate.domain).join(', ')}.` : ''}`,
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
