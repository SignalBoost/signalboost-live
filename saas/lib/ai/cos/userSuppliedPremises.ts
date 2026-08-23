// saas/lib/ai/cos/userSuppliedPremises.ts
//
// Provenance must name facts the user supplied inline. Those facts are grounding for an
// answer, not retrieved evidence and not model-generated knowledge.

const LABELLED_PREMISE = /(?:^|\n|[.;!?]['"'\u2019\u00bb)\]]*\s+|['"'\u2019\u00bb)\]]\s+|;\s*)\s*(?:context\s+)?(?:record|document|doc|policy|clause|exhibit|source|note|memo|item|entry|snippet|extract|attachment|registro|documento|política|dokument|polityka|запись|документ|политика)\s*(?:[A-Z0-9]|[ivx]+\b)[\s:.)—-]/giu
const PREMISE_FRAMING = /(?:^|\n|\.\s+)\s*(?:given(?:\s+that)?|assume|suppose|per the following|as (?:stated|described|set out) (?:below|here|above)|considering the following|based on the following|here (?:is|are) the|the following (?:records?|documents?|policies|facts?|context))\b/giu
const QUOTED_BLOCK = /(?:^|\n)\s*(?:>|"|'|«|„)[^\n]{40,}/gu

export type UserSuppliedPremises = {
  present: boolean
  labelledCount: number
  signals: string[]
}

function countMatches(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0
  let count = 0
  while (pattern.exec(text) !== null) {
    count += 1
    if (count > 50) break
  }
  return count
}

/** Detect conservatively labelled, framed, or quoted factual material in a user prompt. */
export function detectUserSuppliedPremises(input: string): UserSuppliedPremises {
  const text = String(input || '')
  if (text.trim().length < 80) return { present: false, labelledCount: 0, signals: [] }

  const labelledCount = countMatches(text, LABELLED_PREMISE)
  const framing = countMatches(text, PREMISE_FRAMING)
  const quoted = countMatches(text, QUOTED_BLOCK)
  const signals: string[] = []

  if (labelledCount > 0) signals.push(`labelled_premises:${labelledCount}`)
  if (framing > 0) signals.push(`premise_framing:${framing}`)
  if (quoted > 0) signals.push(`quoted_block:${quoted}`)

  return { present: signals.length > 0, labelledCount, signals }
}

export function userSuppliedPremiseLine(premises: UserSuppliedPremises): string | null {
  if (!premises.present) return null
  const detail = premises.labelledCount > 0
    ? `${premises.labelledCount} labelled premise${premises.labelledCount === 1 ? '' : 's'} stated in your request`
    : 'factual premises stated in your request'
  return `User-Supplied Premises : USED — ${detail}. These were the factual basis; COS reasoned over them rather than retrieving them.`
}
