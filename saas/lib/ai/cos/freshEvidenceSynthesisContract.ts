import { freshEvidenceGroundingBlock, type FreshEvidenceSource } from './cosFreshGrounding.ts'
import { replyCitesRequiredFreshEvidence } from './cosFreshAuthority.ts'
import { claimResearchPrompt, splitResearchClaims } from './cosClaimResearch.ts'

export type AcceptedFreshEvidenceSynthesis = {
  reply: string
  citedSourceIds: string[]
}

type ModelFreshEvidenceSynthesis = {
  answer?: unknown
  evidenceIds?: unknown
}

function languageLabel(language: string): string {
  const normalized = String(language || 'en').toLowerCase()
  if (normalized === 'es') return 'Spanish'
  if (normalized === 'pt' || normalized === 'pt-br') return 'Portuguese'
  if (normalized === 'pl') return 'Polish'
  if (normalized === 'ru') return 'Russian'
  return 'English'
}

export function freshEvidenceSynthesisSystemPrompt(language: string): string {
  return [
    `Answer in ${languageLabel(language)}.`,
    'You are reasoning over LIVE EVIDENCE retrieved moments ago. The evidence block is your ONLY permitted source of facts.',
    'Return ONLY strict JSON with this exact shape: {"answer":"...","evidenceIds":["LIVE1","LIVE2"]}.',
    'Rules, in order of priority:',
    '1. Use ONLY facts present in the evidence block. Your own memory is assumed stale and must not contribute facts.',
    '2. Put only the natural-language answer in "answer". Do NOT place URLs, markdown citations, or evidence labels inside the answer field.',
    '3. Put every evidence label that materially supports the answer in "evidenceIds". Never invent an evidence id.',
    '4. For life/death, current office-holder, or leadership claims, use at least two independent evidence ids when the supplied evidence supports them.',
    '5. Resolve pronouns only from the explicit user context supplied in QUESTION; never infer a different person or entity from model memory.',
    '6. Reason around the proposition the user actually asked. Identify what each source actually measures or establishes before combining it with another source; do not let a headline or the retrieval order define the answer.',
    '7. Keep materially different constructs, populations, denominators, time windows, comparison bases, and controls distinct. Explain a material mismatch instead of presenting unlike measurements as interchangeable evidence.',
    '8. Distinguish observation from explanation. Do not infer causation, an individual outcome, or a controlled comparison from an aggregate or associative result unless the evidence itself establishes that stronger claim.',
    '9. Synthesize the minimum set of strong, relevant evidence needed to answer. Do not enumerate the retrieval set, repeat every statistic, or include a source merely because it was retrieved.',
    '10. For a yes/no factual question, lead with yes or no when supported, then add only the qualification needed to state exactly what was established and what was not.',
    '11. If one distinct claim is not established, say exactly which claim remains unverified while preserving any other grounded conclusion. Return EVIDENCE_INSUFFICIENT only when no material claim can be established from the evidence.',
    '12. Be brief, but use a compact numbered list when the question requests a list.',
    '13. Named people are never excluded. Famous or not, office or not.',
    '14. State only what the evidence says. Do not add praise, condemnation, protection, or a COS ranking.',
    '15. Occupancy questions: report the sourced holder and date. If sources disagree on the name, report both.',
    '16. Evaluative questions (worst, best, rank): cite economic facts only — unemployment, inflation, real GDP, real wages, deficit — from the evidence. No COS opinion, ranking, praise, or condemnation. Do not treat historian surveys or magazine lists as the answer.',
    '17. Do not return EVIDENCE_INSUFFICIENT only because no official page names a best or worst person.',
    '18. If the evidence has series, publish only the figures that materially answer the question, with their dates or windows. Do not turn the source set itself into the answer.',
  ].join('\n')
}

export function freshEvidenceSynthesisPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
}): string {
  return `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nCLAIM PLAN (control-plane status; do not treat it as factual evidence):\n${claimResearchPrompt(splitResearchClaims(args.input).map(text => ({ text, status: 'needs_deeper_read' })))}\n\nFor every historical/list claim, use the dated rows from the read document, not its title, navigation, or a different source's summary.\n\nQUESTION: ${args.input}`
}

function parseJsonObject(text: string): ModelFreshEvidenceSynthesis | null {
  const raw = String(text || '').trim()
  if (!raw) return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    return parsed && typeof parsed === 'object' ? parsed as ModelFreshEvidenceSynthesis : null
  } catch {
    return null
  }
}

function answerRespectsRequestedWindow(answer: string, input: string, now = new Date()): boolean {
  const match = String(input || '').match(/\b(?:past|last)\s+(\d{1,3})\s+years?\b/i)
  if (!match) return true
  const startYear = now.getUTCFullYear() - Number(match[1])
  const ranges = [...String(answer || '').matchAll(/\b(\d{4})\s*[–-]\s*(\d{4})?\b/g)]
  // A claimed historical roster must contain dated rows, and no row may end before the window.
  // This rejects a real but stale archive being narrated as a current last-N-years roster.
  return ranges.length >= 2 && ranges.every(range => Number(range[2] || range[1]) >= startYear)
}

export function acceptFreshEvidenceSynthesis(args: {
  text: string
  input: string
  sources: FreshEvidenceSource[]
}): AcceptedFreshEvidenceSynthesis | null {
  const parsed = parseJsonObject(args.text)
  const answer = typeof parsed?.answer === 'string' ? parsed.answer.trim() : ''
  if (!answer || /EVIDENCE_INSUFFICIENT/i.test(answer)) return null
  if (!answerRespectsRequestedWindow(answer, args.input)) return null
  if (!Array.isArray(parsed?.evidenceIds)) return null

  const byId = new Map(args.sources.map(source => [source.id, source] as const))
  const citedSourceIds: string[] = []
  for (const rawId of parsed.evidenceIds) {
    const id = String(rawId || '').trim()
    if (!id || citedSourceIds.includes(id) || !byId.has(id)) continue
    citedSourceIds.push(id)
  }
  if (!citedSourceIds.length) return null

  const citations = citedSourceIds.map(id => {
    const source = byId.get(id)!
    return `[${source.id}] (${source.url})`
  })
  const reply = `${answer}\n\nSources: ${citations.join(' and ')}`

  // The server, not the model, owns citation rendering and enforces the evidence threshold.
  if (!replyCitesRequiredFreshEvidence(reply, args.input, args.sources)) return null
  return { reply, citedSourceIds }
}
