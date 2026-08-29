import { freshEvidenceGroundingBlock, type FreshEvidenceSource } from './cosFreshGrounding.ts'
import { replyCitesRequiredFreshEvidence } from './cosFreshAuthority.ts'

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
    'You are summarizing LIVE EVIDENCE retrieved moments ago. The evidence block is your ONLY permitted source of facts.',
    'Return ONLY strict JSON with this exact shape: {"answer":"...","evidenceIds":["LIVE1","LIVE2"]}.',
    'Rules, in order of priority:',
    '1. Use ONLY facts present in the evidence block. Your own memory is assumed stale and must not contribute facts.',
    '2. Put only the natural-language answer in "answer". Do NOT place URLs, markdown citations, or evidence labels inside the answer field.',
    '3. Put every evidence label that materially supports the answer in "evidenceIds". Never invent an evidence id.',
    '4. For life/death, current office-holder, or leadership claims, use at least two independent evidence ids when the supplied evidence supports them.',
    '5. Resolve pronouns only from the explicit user context supplied in QUESTION; never infer a different person or entity from model memory.',
    '6. Answer every distinct part of the QUESTION. For a request that combines a current fact with a past/former/history list, provide both; never release only one half.',
    '7. If the evidence does not establish any required part, return {"answer":"EVIDENCE_INSUFFICIENT","evidenceIds":[]}.',
    '8. Be brief, but use a compact numbered list when the question requests a list.',
  ].join('\n')
}

export function freshEvidenceSynthesisPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
}): string {
  return `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nQUESTION: ${args.input}`
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

export function acceptFreshEvidenceSynthesis(args: {
  text: string
  input: string
  sources: FreshEvidenceSource[]
}): AcceptedFreshEvidenceSynthesis | null {
  const parsed = parseJsonObject(args.text)
  const answer = typeof parsed?.answer === 'string' ? parsed.answer.trim() : ''
  if (!answer || /EVIDENCE_INSUFFICIENT/i.test(answer)) return null
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
