/**
 * Detect private-COS advisory diagnosis / discrimination prompts.
 * Used to keep this class off the "need a current primary source" exit
 * and to inject the hypothesis-brief contract.
 *
 * No @/ imports: vercel-cos-gates runs these tests in raw Node.
 */

export type AdvisoryDiagnosisIntent = {
  isAdvisoryDiagnosis: boolean
  wantsProvenanceTitles: boolean
  suppressFreshnessAbort: boolean
  reasons: string[]
}

const METHOD_MARKERS = [
  /advisory method/i,
  /hypothesis (table|brief|discrimination)/i,
  /dependence map/i,
  /do not pick a winner/i,
  /cannot stand behind a single cause/i,
  /owner advisory-diagnosis brief/i,
  /not a live lookup/i,
  /no live data/i,
  /labeled assumption/i,
]

const DISCRIMINATE_MARKERS = [
  /discriminat(?:e|ion)/i,
  /differentiate between/i,
  /trade-?offs? between/i,
  /hypothes[ie]s?\b/i,
]

const LEVER_OR_FAULT_MARKERS = [
  /\bdvfs\b/i,
  /packet pac(?:e|ing)/i,
  /preempt(?:ing|ion)/i,
  /cold plates?/i,
  /heat exchanger bypass/i,
  /cavitat/i,
  /micro-?blockage/i,
  /pdu\b/i,
  /power (?:spike|transient)/i,
  /telemetry control loop/i,
]

const PROVENANCE_TITLE_MARKERS = [
  /which of the \d+ injected/i,
  /injected corpus items/i,
  /name titles/i,
  /quote the section headings/i,
  /was the owner advisory-diagnosis brief injected/i,
]

const LIVE_LOOKUP_OVERRIDE = [
  /\b(direct flights?|stock price|who (?:is|died)|today'?s (?:price|score)|exchange rate)\b/i,
]

export function detectAdvisoryDiagnosisIntent(prompt: unknown): AdvisoryDiagnosisIntent {
  const text = String(prompt ?? '').replace(/\s+/g, ' ').trim()
  const reasons: string[] = []

  if (!text) {
    return { isAdvisoryDiagnosis: false, wantsProvenanceTitles: false, suppressFreshnessAbort: false, reasons }
  }

  const wantsProvenanceTitles = PROVENANCE_TITLE_MARKERS.some(re => re.test(text))
  if (wantsProvenanceTitles) reasons.push('provenance-titles')

  const method = METHOD_MARKERS.some(re => re.test(text))
  const discriminate = DISCRIMINATE_MARKERS.some(re => re.test(text))
  const domain = LEVER_OR_FAULT_MARKERS.some(re => re.test(text))
  if (method) reasons.push('method-brief')
  if (discriminate) reasons.push('discriminate')
  if (domain) reasons.push('ops-domain')

  const liveOverride = LIVE_LOOKUP_OVERRIDE.some(re => re.test(text))
  if (liveOverride) reasons.push('live-lookup-override')

  const isAdvisoryDiagnosis = !liveOverride && (method || (discriminate && domain) || wantsProvenanceTitles)
  const suppressFreshnessAbort = isAdvisoryDiagnosis

  return { isAdvisoryDiagnosis, wantsProvenanceTitles, suppressFreshnessAbort, reasons }
}

export const ADVISORY_DIAGNOSIS_PROMPT_BLOCK = [
  'This turn is an advisory diagnosis / method brief, not a live current-fact lookup.',
  'Do not abort for lack of a current primary source.',
  'Do not open with a refusal. Work first.',
  'Required order: known facts; unknowns; candidates plus Other/combined; qualitative belief state; dependence map (do not double-count common-cause sensors); discrimination table; next read-only measurements; last sentence exactly that you cannot stand behind a single cause with the readings given.',
  'If the user asked about control levers (DVFS, ToR pacing, checkpoint preemption) treat them as levers to shed load, not as three competing root causes of a glitch, unless they explicitly asked for causes.',
  'No facility actuation. No invented 1ms telemetry recipes, SKUs, or 24-hour project plans unless boxed as ASSUMPTION — standard published practice — override if this site differs.',
  'Do not use GPU memory-scrubbing or tenant security facts as power or cooling evidence.',
  'If asked which corpus titles were injected: do not invent titles and do not send the user to a web primary source. Say that titles live only in recorded provenance and were not printed in the answer if citation count is zero.',
].join(' ')

export const ADVISORY_PROVENANCE_TITLES_REPLY = {
  en: 'I must not invent document titles. Recorded provenance said corpus items were injected only if that turn listed them; titles are not in this chat. Use the provenance panel. This is not a live current-fact question.',
}
