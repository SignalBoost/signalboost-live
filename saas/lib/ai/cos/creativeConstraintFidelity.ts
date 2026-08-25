import { parseLocalResult } from './reasonerOutput.ts'
import { classifyScriptRequest } from './scriptRequestIntent.ts'

export type UnsupportedCreativeConstraint =
  | 'humor'
  | 'professionalism'
  | 'compliance'
  | 'formal_tone'
  | 'casual_tone'
  | 'dramatic_tone'
  | 'brevity_or_length'

const ATTRIBUTES_TO_USER = /\b(?:the\s+)?(?:prompt|user|request|instructions?)\b[^.?!\n]{0,100}\b(?:requested|asked\s+for|required|specified|called\s+for|wanted|said\s+to|told\s+(?:me|us)\s+to)\b|\b(?:you|the\s+user)\s+(?:requested|asked\s+for|required|specified|wanted)\b/i

const CONSTRAINTS: Array<{
  code: UnsupportedCreativeConstraint
  prompt: RegExp
  claim: RegExp
}> = [
  { code: 'humor', prompt: /\b(?:humou?r|humou?rous|funny|comedic|comedy|joke|witty)\b/i, claim: /\b(?:humou?r|humou?rous|funny|comedic|comedy|joke|witty)\b/i },
  { code: 'professionalism', prompt: /\b(?:professional|professionalism|businesslike|business\s+tone)\b/i, claim: /\b(?:professional|professionalism|businesslike|business\s+tone)\b/i },
  { code: 'compliance', prompt: /\b(?:compliance|compliant|policy-safe|policy\s+safe)\b/i, claim: /\b(?:compliance|compliant|policy-safe|policy\s+safe)\b/i },
  { code: 'formal_tone', prompt: /\b(?:formal|formally)\b/i, claim: /\b(?:formal|formally)\b/i },
  { code: 'casual_tone', prompt: /\b(?:casual|informal|conversational)\b/i, claim: /\b(?:casual|informal|conversational)\b/i },
  { code: 'dramatic_tone', prompt: /\b(?:dramatic|drama|tense|tension)\b/i, claim: /\b(?:dramatic|drama|tense|tension)\b/i },
  { code: 'brevity_or_length', prompt: /\b(?:short|brief|concise|under\s+\d+|\d+\s+(?:lines?|words?|minutes?))\b/i, claim: /\b(?:short|brief|concise|under\s+\d+|\d+\s+(?:lines?|words?|minutes?)|length)\b/i },
]

function answerText(raw: string): string {
  const parsed = parseLocalResult(String(raw ?? ''))
  return parsed?.answer?.trim() || ''
}

/**
 * Detects a narrow but high-impact hallucination: the draft explicitly says the USER/PROMPT asked
 * for a creative constraint that is absent from the actual request. COS may choose humor, tone,
 * setting, names, etc. as creative decisions; it may not retroactively attribute those choices to
 * the user and then score/criticize the draft against an invented requirement.
 */
export function unsupportedCreativeConstraintClaims(prompt: string, raw: string): UnsupportedCreativeConstraint[] {
  if (classifyScriptRequest(prompt) !== 'content') return []
  const answer = answerText(raw)
  if (!answer) return []

  const attributedSegments = answer
    .split(/(?<=[.!?])\s+|\n+/)
    .map(segment => segment.trim())
    .filter(segment => segment && ATTRIBUTES_TO_USER.test(segment))

  if (!attributedSegments.length) return []
  const unsupported: UnsupportedCreativeConstraint[] = []
  for (const constraint of CONSTRAINTS) {
    if (constraint.prompt.test(prompt)) continue
    if (attributedSegments.some(segment => constraint.claim.test(segment))) unsupported.push(constraint.code)
  }
  return unsupported
}

export function creativeConstraintRepairInstruction(prompt: string, raw: string): string | null {
  const unsupported = unsupportedCreativeConstraintClaims(prompt, raw)
  if (!unsupported.length) return null
  return [
    'CREATIVE REQUEST-FIDELITY REPAIR:',
    `The rejected draft falsely attributed these constraints to the user: ${unsupported.join(', ')}.`,
    'Re-read the ORIGINAL USER REQUEST literally. Never say that the prompt/user requested, required, specified, or called for a tone, style, length, humor, professionalism, compliance requirement, or other constraint unless that requirement is actually present in the original request.',
    'Creative details you invent (setting, names, conflict, humor, technical scenario, tone) are allowed when the request leaves them open, but they are COS creative choices—not user requirements.',
    'If the response contains a critique, judge the first draft against the real request and ordinary writing quality. Do not list failure to satisfy an invented constraint as a weakness.',
    'If the response contains a rewrite, make it respond to the corrected critique rather than an invented requirement.',
  ].join('\n')
}
