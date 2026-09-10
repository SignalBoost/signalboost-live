import { createHash } from 'node:crypto'
import type { CosUniversityPhdProgramId } from './cosUniversityPhd.ts'

export const COS_UNIVERSITY_PHD_METHODOLOGY_EXAM_PROFILE = 'cos_university_phd_methodology_v1'
export const COS_UNIVERSITY_PHD_METHODOLOGY_SCORER = 'phd-methodology-host-scorer-v1'
export const COS_UNIVERSITY_PHD_METHODOLOGY_EXAMINER_ACTOR_ID = 'host-phd-methodology-examiner-v1'

export type CosUniversityPhdMethodologyExamRubric = Readonly<{
  requiredHeadings: readonly string[]
  requiredGroups: readonly (readonly string[])[]
  requiredPacketGroups: readonly (readonly string[])[]
  forbiddenTerms: readonly string[]
  maxWords: number
}>

export type CosUniversityPhdMethodologyExam = Readonly<{
  profile: typeof COS_UNIVERSITY_PHD_METHODOLOGY_EXAM_PROFILE
  scorerVersion: typeof COS_UNIVERSITY_PHD_METHODOLOGY_SCORER
  seed: string
  caseId: string
  programId: CosUniversityPhdProgramId
  prompt: string
  rubric: CosUniversityPhdMethodologyExamRubric
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

type ScenarioPacket = Readonly<{
  text: string
  requiredPacketGroups: readonly (readonly string[])[]
}>

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

function manifestHash(input: Omit<CosUniversityPhdMethodologyExam, 'manifestHash'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function unsupportedClaimEndorsed(normalized: string, term: string): boolean {
  const needle = normalize(term)
  let from = 0
  while (from < normalized.length) {
    const index = normalized.indexOf(needle, from)
    if (index < 0) return false
    const sentenceStart = Math.max(
      normalized.lastIndexOf('.', index),
      normalized.lastIndexOf('!', index),
      normalized.lastIndexOf('?', index),
      normalized.lastIndexOf(';', index),
    ) + 1
    const ends = [
      normalized.indexOf('.', index + needle.length),
      normalized.indexOf('!', index + needle.length),
      normalized.indexOf('?', index + needle.length),
      normalized.indexOf(';', index + needle.length),
    ].filter(value => value >= 0)
    const sentenceEnd = ends.length ? Math.min(...ends) : normalized.length
    const before = normalized.slice(sentenceStart, index)
    const after = normalized.slice(index + needle.length, sentenceEnd)
    const rejectedBefore = /(?:\bnot\b|\bnever\b|\bcannot\b|can't\b|isn't\b|\bis not\b|doesn't\b|\bdoes not\b|\bno evidence that\b)[^.!?;]{0,80}$/.test(before)
    const rejectedAfter = /^[^.!?;]{0,40}\b(?:unsupported|unjustified|unproven|incorrect|false|overstated|not established|not supported|cannot be concluded)\b/.test(after)
    if (!rejectedBefore && !rejectedAfter) return true
    from = index + needle.length
  }
  return false
}

function scenario(seed: string): ScenarioPacket {
  const intervention = choose(seed, 'intervention', [
    { text: 'a new model-routing policy', anchor: 'model-routing policy' },
    { text: 'a security training intervention', anchor: 'security training intervention' },
    { text: 'a production scheduling policy', anchor: 'production scheduling policy' },
    { text: 'a forecasting procedure', anchor: 'forecasting procedure' },
    { text: 'a sensor-calibration procedure', anchor: 'sensor-calibration procedure' },
  ] as const)
  const before = integer(seed, 'before', 18, 42)
  const after = integer(seed, 'after', 7, 17)
  const sample = integer(seed, 'sample', 180, 920)
  const changed = choose(seed, 'changed', [
    { text: 'the logging pipeline was upgraded halfway through the study', anchor: 'logging pipeline' },
    { text: 'the participating teams self-selected into the intervention', anchor: 'self-selected' },
    { text: 'the measurement threshold changed during the observation window', anchor: 'measurement threshold' },
    { text: 'the post-period coincided with a large workload shift', anchor: 'workload shift' },
    { text: 'the control population used a different instrument version', anchor: 'instrument version' },
  ] as const)
  return {
    text: [
      `A research team reports that ${intervention.text} reduced the primary failure metric from ${before}% to ${after}% across ${sample} observed cases.`,
      'The result comes from a before/after observational comparison rather than randomized assignment.',
      `${changed.text}.`,
      'The team wants to publish the result as causal and broadly generalizable. No independent replication has occurred.',
    ].join(' '),
    requiredPacketGroups: [
      [intervention.anchor],
      [`${before}%`, `${before} percent`],
      [`${after}%`, `${after} percent`],
      [String(sample)],
      [changed.anchor],
    ],
  }
}

export function buildCosUniversityPhdMethodologyExam(
  seed: string,
  programId: CosUniversityPhdProgramId,
): CosUniversityPhdMethodologyExam {
  const packet = scenario(seed)
  const requiredHeadings = ['Claim', 'Design', 'Threats', 'Test', 'Reproducibility'] as const
  const prompt = [
    'UNSEEN PHD RESEARCH METHODOLOGY EXAM.',
    'Use only the supplied study packet. Do not invent observations or claim that any proposed test has already been run.',
    `Research program: ${programId}.`,
    `Study packet: ${packet.text}`,
    `Use these headings in this exact order: ${requiredHeadings.join(', ')}.`,
    'Ground your analysis in this specific packet: identify the reported intervention, both before/after values, the sample size, and the specific condition that changed during observation.',
    'Evaluate what the study can and cannot support, design a stronger falsifiable test, and specify what would make the result reproducible and independently challengeable.',
  ].join('\n')

  const base: Omit<CosUniversityPhdMethodologyExam, 'manifestHash'> = {
    profile: COS_UNIVERSITY_PHD_METHODOLOGY_EXAM_PROFILE,
    scorerVersion: COS_UNIVERSITY_PHD_METHODOLOGY_SCORER,
    seed,
    caseId: createHash('sha256').update(`${seed}:${programId}:research_methodology_exam`).digest('hex').slice(0, 20),
    programId,
    prompt,
    rubric: {
      requiredHeadings,
      requiredGroups: [
        ['causal', 'causality', 'association', 'correlation'],
        ['confound', 'selection bias', 'bias', 'self-select'],
        ['control', 'comparison', 'random', 'baseline'],
        ['hypothesis', 'falsif', 'prediction'],
        ['measure', 'instrument', 'operationalize', 'measurement'],
        ['preregister', 'replicat', 'reproduc'],
        ['uncertain', 'not proven', 'cannot conclude', 'limitation'],
      ],
      requiredPacketGroups: packet.requiredPacketGroups,
      forbiddenTerms: ['causality is proven', 'causal effect is proven', 'replication succeeded', 'experiment was run'],
      maxWords: 480,
    },
  }
  return Object.freeze({ ...base, manifestHash: manifestHash(base) })
}

export function scoreCosUniversityPhdMethodologyExam(
  exam: CosUniversityPhdMethodologyExam,
  reply: string,
  provenance: CosUniversityPhdMethodologyExamProvenance,
): CosUniversityPhdMethodologyExamScore {
  const reasons: string[] = []
  const text = String(reply || '')
  const normalized = normalize(text)

  if (!provenance.handled) reasons.push('not_handled')
  if (!provenance.localReasoning) reasons.push('local_reasoning_required')
  if (provenance.externalAi) reasons.push('external_ai_used')
  if (provenance.semanticCache) reasons.push('semantic_cache_used')
  if (!String(provenance.turnId || '').trim()) reasons.push('turn_id_required')
  if (!normalized) reasons.push('empty_reply')
  if (words(text) > exam.rubric.maxWords) reasons.push('word_limit_exceeded')

  let lastHeading = -1
  for (const heading of exam.rubric.requiredHeadings) {
    const index = normalized.indexOf(`${heading.toLowerCase()}:`)
    if (index < 0) reasons.push(`heading_missing:${heading}`)
    else if (index <= lastHeading) reasons.push(`heading_order:${heading}`)
    else lastHeading = index
  }
  for (let index = 0; index < exam.rubric.requiredGroups.length; index += 1) {
    const group = exam.rubric.requiredGroups[index]
    if (!group.some(term => normalized.includes(normalize(term)))) reasons.push(`methodology_group_missing:${index + 1}`)
  }
  for (let index = 0; index < exam.rubric.requiredPacketGroups.length; index += 1) {
    const group = exam.rubric.requiredPacketGroups[index]
    if (!group.some(term => normalized.includes(normalize(term)))) reasons.push(`packet_evidence_missing:${index + 1}`)
  }
  for (const term of exam.rubric.forbiddenTerms) {
    if (unsupportedClaimEndorsed(normalized, term)) reasons.push(`unsupported_claim:${term}`)
  }
  return { passed: reasons.length === 0, reasons }
}