export type CredibilityGoldSpec = {
  requiredAll?: string[]
  requiredAnyGroups?: string[][]
  forbidden?: string[]
  expectedAbstain?: boolean
  conclusionKey?: string | null
}

export type CredibilityCaseEvaluation = {
  correct: boolean
  correctness: 0 | 1
  abstained: boolean
  shouldAbstain: boolean
  matched: string[]
  missing: string[]
  forbiddenHits: string[]
}

const ABSTENTION_PATTERNS = [
  /\bi (?:do not|don't) know\b/i,
  /\bnot enough (?:information|evidence|context)\b/i,
  /\binsufficient (?:information|evidence|context)\b/i,
  /\bcannot (?:determine|know|verify|confirm)\b/i,
  /\bcan't (?:determine|know|verify|confirm)\b/i,
  /\bunable to (?:determine|know|verify|confirm)\b/i,
  /\bno (?:reliable|available) (?:information|evidence)\b/i,
]

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function terms(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((value) => normalize(value)).filter(Boolean).slice(0, 50)
    : []
}

export function detectSemanticAbstention(answer: string): boolean {
  return ABSTENTION_PATTERNS.some((pattern) => pattern.test(String(answer || '')))
}

export function evaluateCredibilityAnswer(
  answer: string,
  gold: CredibilityGoldSpec,
  systemAbstained = false,
): CredibilityCaseEvaluation {
  const normalized = normalize(answer)
  const requiredAll = terms(gold.requiredAll)
  const requiredAnyGroups = Array.isArray(gold.requiredAnyGroups)
    ? gold.requiredAnyGroups.map((group) => terms(group)).filter((group) => group.length)
    : []
  const forbidden = terms(gold.forbidden)
  const abstained = Boolean(systemAbstained || detectSemanticAbstention(answer))
  const shouldAbstain = gold.expectedAbstain === true

  if (shouldAbstain) {
    return {
      correct: abstained,
      correctness: abstained ? 1 : 0,
      abstained,
      shouldAbstain,
      matched: [],
      missing: abstained ? [] : ['expected_abstention'],
      forbiddenHits: [],
    }
  }

  const matched = requiredAll.filter((term) => normalized.includes(term))
  const missing = requiredAll.filter((term) => !normalized.includes(term))
  for (const group of requiredAnyGroups) {
    const hit = group.find((term) => normalized.includes(term))
    if (hit) matched.push(hit)
    else missing.push(`one_of:${group.join('|')}`)
  }
  const forbiddenHits = forbidden.filter((term) => normalized.includes(term))
  const correct = !abstained && missing.length === 0 && forbiddenHits.length === 0
  return {
    correct,
    correctness: correct ? 1 : 0,
    abstained,
    shouldAbstain,
    matched,
    missing,
    forbiddenHits,
  }
}

export function provenanceMatchesAnswer(
  answer: string,
  observed: { knowledgeFactsCited?: number | null; learnedItemsCited?: number | null; userMemoriesCited?: number | null },
): boolean {
  const unique = (pattern: RegExp) => new Set([...String(answer || '').matchAll(pattern)].map((match) => match[1])).size
  const claimedKg = unique(/\[KG(\d+)\]/gi)
  const claimedCl = unique(/\[CL(\d+)\]/gi)
  const claimedEm = unique(/\[EM(\d+)\]/gi)
  return claimedKg === Number(observed.knowledgeFactsCited || 0)
    && claimedCl === Number(observed.learnedItemsCited || 0)
    && claimedEm === Number(observed.userMemoriesCited || 0)
}
