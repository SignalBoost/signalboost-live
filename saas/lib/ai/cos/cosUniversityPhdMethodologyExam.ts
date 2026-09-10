import { createHash } from 'node:crypto'
import type { CosUniversityPhdProgramId } from './cosUniversityPhd.ts'

export const COS_UNIVERSITY_PHD_METHODOLOGY_EXAM_PROFILE = 'cos_university_phd_methodology_v1'
export const COS_UNIVERSITY_PHD_METHODOLOGY_SCORER = 'phd-methodology-host-scorer-v2'

export type CosUniversityPhdMethodologyHeading = 'Claim' | 'Design' | 'Threats' | 'Test' | 'Reproducibility'

export type CosUniversityPhdMethodologyPublicPacket = Readonly<{
  interventionAnchor: string
  beforePercent: number
  afterPercent: number
  sampleSize: number
  changedConditionAnchor: string
}>

export type CosUniversityPhdMethodologySectionRubric = Readonly<{
  heading: CosUniversityPhdMethodologyHeading
  minWords: number
  conceptGroups: readonly (readonly string[])[]
}>

/**
 * Runtime-only host rubric contract. Production values are loaded from a service-only host store;
 * no production certification phrases or answer patterns are committed to this repository.
 */
export type CosUniversityPhdMethodologyRubric = Readonly<{
  maxWords: number
  sections: readonly CosUniversityPhdMethodologySectionRubric[]
  unsupportedAssertions: readonly string[]
  directRejectionPrefixes: readonly string[]
  directRejectionSuffixes: readonly string[]
}>

export type CosUniversityPhdMethodologyExam = Readonly<{
  profile: typeof COS_UNIVERSITY_PHD_METHODOLOGY_EXAM_PROFILE
  scorerVersion: typeof COS_UNIVERSITY_PHD_METHODOLOGY_SCORER
  seed: string
  caseId: string
  programId: CosUniversityPhdProgramId
  prompt: string
  packet: CosUniversityPhdMethodologyPublicPacket
  manifestHash: string
}>

export type CosUniversityPhdMethodologyExamProvenance = Readonly<{
  localReasoning?: boolean
  externalAi?: boolean
  semanticCache?: boolean
  handled?: boolean
  turnId?: string | null
}>

export type CosUniversityPhdMethodologyExamScore = Readonly<{
  passed: boolean
  reasons: string[]
}>

type ScenarioOption = Readonly<{ text: string; anchor: string }>

type ScenarioPacket = Readonly<{
  text: string
  packet: CosUniversityPhdMethodologyPublicPacket
}>

const REQUIRED_HEADINGS: readonly CosUniversityPhdMethodologyHeading[] = Object.freeze([
  'Claim', 'Design', 'Threats', 'Test', 'Reproducibility',
])

const INTERVENTIONS: readonly ScenarioOption[] = Object.freeze([
  Object.freeze({ text: 'a new model-routing policy', anchor: 'model-routing policy' }),
  Object.freeze({ text: 'a security training intervention', anchor: 'security training intervention' }),
  Object.freeze({ text: 'a production scheduling policy', anchor: 'production scheduling policy' }),
  Object.freeze({ text: 'a forecasting procedure', anchor: 'forecasting procedure' }),
  Object.freeze({ text: 'a sensor-calibration procedure', anchor: 'sensor-calibration procedure' }),
])

const CHANGED_CONDITIONS: readonly ScenarioOption[] = Object.freeze([
  Object.freeze({ text: 'the logging pipeline was upgraded halfway through the study', anchor: 'logging pipeline' }),
  Object.freeze({ text: 'the participating teams self-selected into the intervention', anchor: 'self-selected' }),
  Object.freeze({ text: 'the measurement threshold changed during the observation window', anchor: 'measurement threshold' }),
  Object.freeze({ text: 'the post-period coincided with a large workload shift', anchor: 'workload shift' }),
  Object.freeze({ text: 'the control population used a different instrument version', anchor: 'instrument version' }),
])

function digest(seed: string, label: string): Buffer {
  return createHash('sha256').update(`${seed}:${label}`).digest()
}

function integer(seed: string, label: string, min: number, max: number): number {
  return min + (digest(seed, label).readUInt32BE(0) % (max - min + 1))
}

function choose<T>(seed: string, label: string, values: readonly T[]): T {
  return values[digest(seed, label).readUInt32BE(0) % values.length]
}

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function words(value: string): number {
  return String(value ?? '').trim().match(/\S+/g)?.length ?? 0
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function phrasePattern(value: string): RegExp {
  const parts = normalize(value).split(' ').filter(Boolean).map(escapeRegExp)
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${parts.join('\\s+')}(?=$|[^\\p{L}\\p{N}_])`, 'u')
}

function containsBoundedPhrase(text: string, value: string): boolean {
  return Boolean(value.trim()) && phrasePattern(value).test(normalize(text))
}

function containsExactPercent(text: string, value: number): boolean {
  return new RegExp(`(^|[^\\d%])${value}\\s*(?:%|percent)(?=$|[^\\d%\\p{L}])`, 'u').test(normalize(text))
}

function containsExactInteger(text: string, value: number): boolean {
  return new RegExp(`(^|\\D)${value}(?=\\D|$)`, 'u').test(normalize(text))
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function hashCosUniversityPhdMethodologyRubric(rubric: CosUniversityPhdMethodologyRubric): string {
  return createHash('sha256').update(canonicalJson(rubric)).digest('hex')
}

function stringList(value: unknown, label: string, options: { min: number; max: number; maxLength: number }): string[] {
  if (!Array.isArray(value) || value.length < options.min || value.length > options.max) throw new Error(`invalid_${label}`)
  return value.map((item, index) => {
    const text = String(item || '').trim()
    if (!text || text.length > options.maxLength) throw new Error(`invalid_${label}_${index}`)
    return text
  })
}

export function validateCosUniversityPhdMethodologyRubric(value: unknown): CosUniversityPhdMethodologyRubric {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_methodology_rubric')
  const row = value as Record<string, unknown>
  const maxWords = Number(row.maxWords)
  if (!Number.isInteger(maxWords) || maxWords < 180 || maxWords > 700) throw new Error('invalid_methodology_max_words')
  if (!Array.isArray(row.sections) || row.sections.length !== REQUIRED_HEADINGS.length) throw new Error('invalid_methodology_sections')
  const sections = row.sections.map((entry, sectionIndex) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`invalid_methodology_section_${sectionIndex}`)
    const section = entry as Record<string, unknown>
    const heading = String(section.heading || '') as CosUniversityPhdMethodologyHeading
    if (heading !== REQUIRED_HEADINGS[sectionIndex]) throw new Error(`invalid_methodology_heading_${sectionIndex}`)
    const minWords = Number(section.minWords)
    if (!Number.isInteger(minWords) || minWords < 8 || minWords > 120) throw new Error(`invalid_methodology_min_words_${sectionIndex}`)
    if (!Array.isArray(section.conceptGroups) || section.conceptGroups.length < 1 || section.conceptGroups.length > 6) {
      throw new Error(`invalid_methodology_groups_${sectionIndex}`)
    }
    const conceptGroups = section.conceptGroups.map((group, groupIndex) =>
      stringList(group, `methodology_group_${sectionIndex}_${groupIndex}`, { min: 1, max: 8, maxLength: 96 }),
    )
    return Object.freeze({ heading, minWords, conceptGroups })
  })
  return Object.freeze({
    maxWords,
    sections: Object.freeze(sections),
    unsupportedAssertions: Object.freeze(stringList(row.unsupportedAssertions, 'methodology_unsupported_assertions', { min: 1, max: 12, maxLength: 120 })),
    directRejectionPrefixes: Object.freeze(stringList(row.directRejectionPrefixes, 'methodology_rejection_prefixes', { min: 1, max: 16, maxLength: 80 })),
    directRejectionSuffixes: Object.freeze(stringList(row.directRejectionSuffixes, 'methodology_rejection_suffixes', { min: 1, max: 16, maxLength: 80 })),
  })
}

function scenario(seed: string): ScenarioPacket {
  const intervention = choose(seed, 'intervention', INTERVENTIONS)
  const beforePercent = integer(seed, 'before', 18, 42)
  const afterPercent = integer(seed, 'after', 7, 17)
  const sampleSize = integer(seed, 'sample', 180, 920)
  const changed = choose(seed, 'changed', CHANGED_CONDITIONS)
  return {
    text: [
      `A research team reports that ${intervention.text} reduced the primary failure metric from ${beforePercent}% to ${afterPercent}% across ${sampleSize} observed cases.`,
      'The result comes from a before/after observational comparison rather than randomized assignment.',
      `${changed.text}.`,
      'The team wants to publish the result as causal and broadly generalizable. No independent replication has occurred.',
    ].join(' '),
    packet: Object.freeze({
      interventionAnchor: intervention.anchor,
      beforePercent,
      afterPercent,
      sampleSize,
      changedConditionAnchor: changed.anchor,
    }),
  }
}

export function buildCosUniversityPhdMethodologyExam(
  seed: string,
  programId: CosUniversityPhdProgramId,
): CosUniversityPhdMethodologyExam {
  const generated = scenario(seed)
  const prompt = [
    'UNSEEN PHD RESEARCH METHODOLOGY EXAM.',
    'Use only the supplied study packet. Do not invent observations or claim that any proposed test has already been run.',
    `Research program: ${programId}.`,
    `Study packet: ${generated.text}`,
    `Use these headings in this exact order: ${REQUIRED_HEADINGS.join(', ')}.`,
    'Ground your analysis in this specific packet: identify the reported intervention, both before/after values, the sample size, and the specific condition that changed during observation.',
    'Evaluate what the study can and cannot support, design a stronger falsifiable test, and specify what would make the result reproducible and independently challengeable.',
  ].join('\n')
  const base = {
    profile: COS_UNIVERSITY_PHD_METHODOLOGY_EXAM_PROFILE,
    scorerVersion: COS_UNIVERSITY_PHD_METHODOLOGY_SCORER,
    seed,
    caseId: createHash('sha256').update(`${seed}:${programId}:research_methodology_exam`).digest('hex').slice(0, 20),
    programId,
    prompt,
    packet: generated.packet,
  } as const
  return Object.freeze({ ...base, manifestHash: createHash('sha256').update(canonicalJson(base)).digest('hex') })
}

function parseSections(text: string): { sections: Map<CosUniversityPhdMethodologyHeading, string>; reasons: string[] } {
  const reasons: string[] = []
  const markers = REQUIRED_HEADINGS.map(heading => {
    const expression = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(heading)}\\s*:`, 'i')
    const match = expression.exec(text)
    return { heading, index: match?.index ?? -1, contentStart: match ? match.index + match[0].length : -1 }
  })
  let previous = -1
  for (const marker of markers) {
    if (marker.index < 0) reasons.push(`heading_missing:${marker.heading}`)
    else if (marker.index <= previous) reasons.push(`heading_order:${marker.heading}`)
    else previous = marker.index
  }
  const sections = new Map<CosUniversityPhdMethodologyHeading, string>()
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index]
    if (marker.index < 0) continue
    const later = markers.slice(index + 1).find(item => item.index > marker.index)
    sections.set(marker.heading, text.slice(marker.contentStart, later?.index ?? text.length).trim())
  }
  return { sections, reasons }
}

function hasOtherScenarioAnchor(text: string, active: string, options: readonly ScenarioOption[]): boolean {
  return options.some(option => option.anchor !== active && containsBoundedPhrase(text, option.anchor))
}

function assertionEndorsed(clause: string, assertion: string, rubric: CosUniversityPhdMethodologyRubric): boolean {
  const normalizedClause = normalize(clause)
  const pattern = phrasePattern(assertion)
  const match = pattern.exec(normalizedClause)
  if (!match) return false
  const assertionIndex = match.index + (match[1]?.length || 0)
  const assertionEnd = assertionIndex + normalize(assertion).length
  const before = normalizedClause.slice(0, assertionIndex).trimEnd()
  const after = normalizedClause.slice(assertionEnd).trimStart()
  const rejectedBefore = rubric.directRejectionPrefixes.some(prefix => before.endsWith(normalize(prefix)))
  const rejectedAfter = rubric.directRejectionSuffixes.some(suffix => after.startsWith(normalize(suffix)))
  return !rejectedBefore && !rejectedAfter
}

export function scoreCosUniversityPhdMethodologyExam(
  exam: CosUniversityPhdMethodologyExam,
  reply: string,
  provenance: CosUniversityPhdMethodologyExamProvenance,
  rubric: CosUniversityPhdMethodologyRubric,
): CosUniversityPhdMethodologyExamScore {
  const reasons: string[] = []
  const text = String(reply || '')
  if (!provenance.handled) reasons.push('not_handled')
  if (!provenance.localReasoning) reasons.push('local_reasoning_required')
  if (provenance.externalAi) reasons.push('external_ai_used')
  if (provenance.semanticCache) reasons.push('semantic_cache_used')
  if (!String(provenance.turnId || '').trim()) reasons.push('turn_id_required')
  if (!text.trim()) reasons.push('empty_reply')
  if (words(text) > rubric.maxWords) reasons.push('word_limit_exceeded')
  if ((text.match(/\S{96,}/g) || []).length) reasons.push('suspicious_long_token')

  const parsed = parseSections(text)
  reasons.push(...parsed.reasons)
  const claim = parsed.sections.get('Claim') || ''
  const threats = parsed.sections.get('Threats') || ''
  const packet = exam.packet
  if (!containsBoundedPhrase(claim, packet.interventionAnchor)) reasons.push('packet_intervention_missing_from_claim')
  if (!containsExactPercent(claim, packet.beforePercent)) reasons.push('packet_before_value_missing_from_claim')
  if (!containsExactPercent(claim, packet.afterPercent)) reasons.push('packet_after_value_missing_from_claim')
  if (!containsExactInteger(claim, packet.sampleSize)) reasons.push('packet_sample_missing_from_claim')
  if (!containsBoundedPhrase(threats, packet.changedConditionAnchor)) reasons.push('packet_changed_condition_missing_from_threats')
  if (hasOtherScenarioAnchor(text, packet.interventionAnchor, INTERVENTIONS)) reasons.push('cross_packet_intervention_contamination')
  if (hasOtherScenarioAnchor(text, packet.changedConditionAnchor, CHANGED_CONDITIONS)) reasons.push('cross_packet_condition_contamination')

  for (const rule of rubric.sections) {
    const section = parsed.sections.get(rule.heading) || ''
    if (words(section) < rule.minWords) reasons.push(`section_too_short:${rule.heading}`)
    for (let index = 0; index < rule.conceptGroups.length; index += 1) {
      if (!rule.conceptGroups[index].some(term => containsBoundedPhrase(section, term))) {
        reasons.push(`methodology_concept_missing:${rule.heading}:${index + 1}`)
      }
    }
  }

  const clauses = text.split(/[.!?;\n]+/).map(item => item.trim()).filter(Boolean)
  for (let index = 0; index < rubric.unsupportedAssertions.length; index += 1) {
    const assertion = rubric.unsupportedAssertions[index]
    if (clauses.some(clause => assertionEndorsed(clause, assertion, rubric))) reasons.push(`unsupported_assertion:${index + 1}`)
  }
  return { passed: reasons.length === 0, reasons }
}