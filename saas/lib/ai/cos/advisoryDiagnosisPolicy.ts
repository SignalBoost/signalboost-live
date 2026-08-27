export type PublishedDiagnosticReferenceKind = 'official_documentation' | 'scientific_journal'

export type PublishedDiagnosticReference = {
  kind: PublishedDiagnosticReferenceKind
  title: string
  url: string
  snippet: string
}

const DIAGNOSIS_RE = /\b(?:diagnos\w*|troubleshoot\w*|root\s+cause|incident|fault|failure|failed|alarm|alert|degrad\w*|bottleneck|why\s+.*(?:slow|fail|error)|candidate\s+causes?|hypotheses?)\b/i
const METHODS_RE = /\b(?:what|which)\s+(?:diagnostic\s+)?(?:methods?|techniques?|approaches?|mechanisms?)\s+(?:exist|are\s+used|can\s+be\s+used)|\b(?:methods?|techniques?|approaches?)\s+(?:exist|for|to)\s+(?:diagnos\w*|troubleshoot\w*|distinguish|investigate)|\bhow\s+(?:would|should|can)\s+(?:you|we|an?\s+operator)\s+(?:diagnos\w*|troubleshoot\w*|distinguish|investigate)\b/i
const REFUSAL_RE = /\b(?:i\s+(?:do\s+not|don't)\s+know|i\s+cannot\s+stand\s+behind|i\s+can't\s+stand\s+behind|cannot\s+(?:determine|identify|name)|can't\s+(?:determine|identify|name)|unable\s+to\s+(?:determine|identify|name)|insufficient\s+(?:evidence|information)|not\s+enough\s+(?:evidence|information))\b/i

const LABEL_GROUPS = {
  observations: /\b(?:observed|observations?|established\s+facts?|what\s+we\s+know|facts?\s+in\s+hand|observado|observaciones|fatos?\s+observados|zaobserwowane|obserwacje|наблюдения|факты)\b/i,
  hypotheses: /\b(?:candidate\s+(?:causes?|hypotheses)|hypotheses|possible\s+causes?|hip[oó]tesis|hip[oó]teses|hipotezy|гипотезы|возможные\s+причины)\b/i,
  distinguishers: /\b(?:distinguishing\s+checks?|what\s+would\s+distinguish|how\s+to\s+distinguish|discriminating\s+checks?|distinguir|rozr[oó]żni|odr[oó]żni|различить|отличить)\b/i,
  missing: /\b(?:missing\s+(?:readings?|evidence|data|baselines?)|readings?\s*\/\s*baselines?|still\s+needed|faltan|faltantes|brakuj[aą]c|недостающ|отсутствующ)\b/i,
} as const

function requestText(prompt: string): string {
  const text = String(prompt || '').trim()
  const markers = [
    'CURRENT USER INPUT (QUESTION, STATEMENT, OR PASTED TEXT):',
    'CURRENT USER INPUT:',
    'USER REQUEST:',
    'USER QUESTION:',
    'USER INSTRUCTION:',
  ]
  let best = -1
  let marker = ''
  for (const candidate of markers) {
    const index = text.lastIndexOf(candidate)
    if (index > best) { best = index; marker = candidate }
  }
  return (best >= 0 ? text.slice(best + marker.length) : text).trim().slice(0, 16_000)
}

export function advisoryDiagnosisUserRequest(prompt: string): string {
  return requestText(prompt)
}

export function isAdvisoryDiagnosisPrompt(prompt: string): boolean {
  return DIAGNOSIS_RE.test(requestText(prompt))
}

export function asksForPublishedDiagnosticMethods(prompt: string): boolean {
  const request = requestText(prompt)
  return DIAGNOSIS_RE.test(request) && METHODS_RE.test(request)
}

export function diagnosticPublishedSearchQuery(prompt: string): string {
  const request = requestText(prompt).replace(/\s+/g, ' ').trim()
  const bounded = request.split(' ').slice(0, 34).join(' ').slice(0, 280)
  return `${bounded} diagnostic methods`.trim()
}

export function selectOfficialDiagnosticReferences(
  rows: Array<{ title?: string; url?: string; snippet?: string; authorityTier?: string }>,
  limit = 2,
): PublishedDiagnosticReference[] {
  const selected: PublishedDiagnosticReference[] = []
  const seen = new Set<string>()
  for (const row of rows || []) {
    if (row.authorityTier !== 'first_party' && row.authorityTier !== 'institutional') continue
    const url = String(row.url || '').trim()
    const title = String(row.title || '').replace(/\s+/g, ' ').trim()
    const snippet = String(row.snippet || '').replace(/\s+/g, ' ').trim()
    if (!url || !title || seen.has(url)) continue
    seen.add(url)
    selected.push({ kind: 'official_documentation', title: title.slice(0, 200), url, snippet: snippet.slice(0, 700) })
    if (selected.length >= Math.max(1, Math.min(4, limit))) break
  }
  return selected
}

export function buildPublishedDiagnosticReferenceBlock(references: PublishedDiagnosticReference[]): string {
  const refs = (references || []).slice(0, 4)
  if (!refs.length) return ''
  const lines = refs.map((ref, index) => [
    `[PUB${index + 1}] ${ref.kind === 'scientific_journal' ? 'SCIENTIFIC JOURNAL / SCHOLARLY METADATA' : 'OFFICIAL / INSTITUTIONAL DOCUMENTATION'}`,
    `Title: ${ref.title}`,
    `URL: ${ref.url}`,
    `Reference text: ${ref.snippet}`,
  ].join('\n'))
  return [
    'PUBLISHED DIAGNOSTIC REFERENCES — METHODS/MECHANISMS ONLY; NEVER INCIDENT TELEMETRY:',
    ...lines,
    '',
    'REFERENCE BOUNDARY:',
    '- These publications may establish that a diagnostic method, mechanism, observable, or discrimination technique exists.',
    '- They do NOT establish what is happening in the user\'s plant, rack, service, network, database, or other live system.',
    '- Never turn a web page, paper, manual, benchmark, or vendor document into an observed sensor value, equipment state, alarm state, workload fact, or root-cause finding.',
    '- Incident conclusions must still come from the user-supplied or retrieved system evidence. Use the publications only to improve the hypothesis set and the read-only checks that would distinguish it.',
  ].join('\n')
}

export const ADVISORY_DIAGNOSIS_OWNER_POLICY = [
  'OWNER POLICY — ADVISORY DIAGNOSIS: WORK FIRST, HUMILITY LAST.',
  '- Do not lead with “I do not know”, “I cannot stand behind a cause”, or a refusal when useful diagnostic work remains possible.',
  '- Use the internal evidence already supplied to you first: Knowledge Graph, learned corpus, authorized memory, and validated procedural skills. Never claim one was used unless it is actually present in the prompt.',
  '- If a PUBLISHED DIAGNOSTIC REFERENCES block is present, use it only for methods/mechanisms and read-only discrimination techniques; it is never plant or production telemetry and never proves the incident root cause.',
  '- Return a labeled hypothesis-discrimination brief. Use equivalent labels in the response language for: Observed / established facts; Candidate hypotheses; Distinguishing checks; Missing readings / baselines.',
  '- Every candidate hypothesis must say what observable would support it and what observation would falsify or materially demote it.',
  '- Do not name a failed component or single winning cause without incident evidence that distinguishes it from the alternatives.',
  '- Ask for the missing readings/baselines after laying out the useful hypotheses and discriminating checks.',
  '- If the available evidence still cannot select a winner, say that only at the END, after the useful diagnostic work. The uncertainty statement must be the last sentence, not the opening.',
  '- Advisory only: recommend inspection, comparison, logs, traces, metrics, captured plans, approved runbooks, or other read-only checks. Do not issue facility-control or production-mutation instructions merely to resolve uncertainty.',
].join('\n')

export function advisoryDiagnosisBriefDefects(prompt: string, answer: string): string[] {
  if (!isAdvisoryDiagnosisPrompt(prompt)) return []
  const text = String(answer || '').trim()
  if (!text) return ['empty_diagnostic_answer']
  const defects: string[] = []
  const first = text.slice(0, 320)
  const refusal = text.match(REFUSAL_RE)
  if (REFUSAL_RE.test(first)) defects.push('uncertainty_or_refusal_leads_answer')
  if (!LABEL_GROUPS.observations.test(text)) defects.push('observations_label_missing')
  if (!LABEL_GROUPS.hypotheses.test(text)) defects.push('hypotheses_label_missing')
  if (!LABEL_GROUPS.distinguishers.test(text)) defects.push('distinguishing_checks_label_missing')
  if (!LABEL_GROUPS.missing.test(text)) defects.push('missing_readings_label_missing')
  if (refusal && refusal.index !== undefined && refusal.index < Math.max(0, text.length - 420)) {
    defects.push('uncertainty_not_last')
  }
  return defects
}
