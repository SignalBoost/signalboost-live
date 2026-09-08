import { createHash } from 'node:crypto'
import {
  COS_UNIVERSITY_MASTERS_PROGRAMS,
  cosUniversityMastersCourseworkModulePasses,
  cosUniversityMastersDistinctPassesAfterLatestFailure,
  cosUniversityMastersModuleByKey,
  cosUniversityMastersTrackById,
  type CosUniversityMastersEvidence,
  type CosUniversityMastersEvidenceStage,
  type CosUniversityMastersProgramId,
} from './cosUniversityMasters.ts'

export const COS_UNIVERSITY_MASTERS_EXAM_PROFILE = 'cos_university_masters_v1'
export const COS_UNIVERSITY_MASTERS_EXAM_SCORER = 'masters-host-scorer-v1'

export type CosUniversityMastersExamStage = Extract<
  CosUniversityMastersEvidenceStage,
  'graduate_coursework' | 'independent_specialist_exam' | 'cross_domain_transfer' | 'masters_capstone'
>

export type CosUniversityMastersExamTarget = Readonly<{
  programId: CosUniversityMastersProgramId
  stage: CosUniversityMastersExamStage
  moduleKey: string | null
}>

export type CosUniversityMastersExamRubric = Readonly<{
  requiredHeadings: readonly string[]
  requiredGroups: readonly (readonly string[])[]
  forbiddenTerms: readonly string[]
  maxWords: number
}>

export type CosUniversityMastersExam = Readonly<{
  profile: typeof COS_UNIVERSITY_MASTERS_EXAM_PROFILE
  scorerVersion: typeof COS_UNIVERSITY_MASTERS_EXAM_SCORER
  seed: string
  caseId: string
  target: CosUniversityMastersExamTarget
  title: string
  prompt: string
  rubric: CosUniversityMastersExamRubric
  manifestHash: string
}>

export type CosUniversityMastersExamProvenance = {
  localReasoning?: boolean
  externalAi?: boolean
  semanticCache?: boolean
  handled?: boolean
  turnId?: string | null
}

export type CosUniversityMastersExamScore = {
  passed: boolean
  reasons: string[]
}

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

function manifestHash(input: Omit<CosUniversityMastersExam, 'manifestHash'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function trackGroups(programId: CosUniversityMastersProgramId): readonly (readonly string[])[] {
  if (programId === 'applied_ai_systems') return [
    ['evaluation', 'benchmark', 'holdout'],
    ['production', 'canary', 'rollback'],
    ['telemetry', 'latency', 'quality'],
    ['verify', 'measure', 'compare'],
  ]
  if (programId === 'security_and_trust') return [
    ['least privilege', 'access', 'authorization'],
    ['contain', 'revoke', 'isolate'],
    ['logs', 'evidence', 'audit'],
    ['scope', 'verify', 'confirm'],
  ]
  if (programId === 'quantitative_decision_science') return [
    ['baseline', 'control', 'comparison'],
    ['uncertainty', 'confidence', 'interval'],
    ['causal', 'confound', 'counterfactual'],
    ['sensitivity', 'tradeoff', 'expected value'],
  ]
  if (programId === 'enterprise_operations_and_governance') return [
    ['owner', 'accountability', 'responsible'],
    ['control', 'approval', 'segregation'],
    ['risk', 'impact', 'tradeoff'],
    ['measure', 'outcome', 'service level'],
  ]
  return [
    ['measurement', 'sensor', 'instrument'],
    ['hypothesis', 'model', 'prediction'],
    ['experiment', 'replication', 'repeat'],
    ['uncertainty', 'error', 'calibration'],
  ]
}

function moduleGroups(programId: CosUniversityMastersProgramId, moduleKey: string): readonly (readonly string[])[] {
  const module = cosUniversityMastersModuleByKey(programId, moduleKey)
  if (!module) return []
  const key = module.key
  if (key.includes('evaluation')) return [['holdout', 'evaluation'], ['failure', 'defect'], ['production', 'transfer']]
  if (key.includes('architecture')) return [['boundary', 'isolation'], ['failure', 'fallback'], ['observable', 'telemetry']]
  if (key.includes('deployment')) return [['canary', 'staged'], ['rollback', 'revert'], ['measure', 'verify']]
  if (key.includes('governance')) return [['authority', 'permission'], ['evidence', 'unknown'], ['verify', 'irreversible']]
  if (key.includes('threat')) return [['asset', 'trust boundary'], ['attacker', 'abuse'], ['mitigation', 'control']]
  if (key.includes('identity')) return [['least privilege', 'authorization'], ['credential', 'authentication'], ['audit', 'access']]
  if (key.includes('incident')) return [['contain', 'isolate'], ['evidence', 'logs'], ['scope', 'recovery']]
  if (key.includes('secure')) return [['defense in depth', 'layered'], ['secret', 'credential'], ['isolation', 'boundary']]
  if (key.includes('experimental')) return [['baseline', 'control'], ['random', 'bias'], ['measurement', 'stopping']]
  if (key.includes('causal')) return [['confound', 'confounding'], ['counterfactual', 'causal'], ['association', 'correlation']]
  if (key.includes('optimization')) return [['objective', 'constraint'], ['tradeoff', 'sensitivity'], ['robust', 'uncertainty']]
  if (key.includes('forecasting')) return [['forecast', 'scenario'], ['uncertainty', 'interval'], ['calibration', 'precision']]
  if (key.includes('operating')) return [['owner', 'ownership'], ['dependency', 'escalation'], ['service level', 'outcome']]
  if (key.includes('controls')) return [['control', 'segregation'], ['audit', 'evidence'], ['exception', 'policy']]
  if (key.includes('resource')) return [['opportunity cost', 'tradeoff'], ['risk', 'value'], ['reversible', 'reversibility']]
  if (key.includes('change')) return [['incentive', 'adoption'], ['feedback', 'communication'], ['resistance', 'stakeholder']]
  if (key.includes('measurement')) return [['calibrat', 'instrument'], ['unit', 'measurement'], ['uncertainty', 'sensor']]
  if (key.includes('physical')) return [['dimension', 'unit'], ['conservation', 'boundary'], ['plausib', 'model']]
  if (key.includes('replication')) return [['replicat', 'repeat'], ['falsif', 'hypothesis'], ['control', 'uncertainty']]
  return [['simulation', 'computation'], ['reproduc', 'repeat'], ['observation', 'model output']]
}

function packet(programId: CosUniversityMastersProgramId, seed: string): string {
  const tenant = choose(seed, 'tenant', ['Atlas', 'Orion', 'Nova', 'Harbor'] as const)
  const oldMetric = integer(seed, 'old', 70, 110)
  const newMetric = integer(seed, 'new', 115, 175)
  const sample = integer(seed, 'sample', 600, 1800)
  if (programId === 'applied_ai_systems') {
    return `Tenant ${tenant}: offline holdout accuracy is 94%, but Production task success fell from ${oldMetric}% of baseline to ${newMetric - 100}% below baseline after a model change. p95 latency increased by ${integer(seed, 'latency', 22, 68)}%. No root cause is proven.`
  }
  if (programId === 'security_and_trust') {
    return `Tenant ${tenant}: ${integer(seed, 'prompts', 5, 14)} MFA prompts were followed by a successful unfamiliar login. One privileged token was used afterward. No malware or attacker identity is proven.`
  }
  if (programId === 'quantitative_decision_science') {
    return `Experiment ${tenant}: treatment has ${integer(seed, 'a', 70, 130)} successes in ${sample} trials; control has ${integer(seed, 'b', 55, 115)} successes in ${sample} trials. Assignment quality and confounding have not yet been verified.`
  }
  if (programId === 'enterprise_operations_and_governance') {
    return `Program ${tenant}: cycle time improved ${integer(seed, 'cycle', 8, 24)}%, but rework rose ${integer(seed, 'rework', 12, 31)}% and one approval control was bypassed. Revenue impact is unknown.`
  }
  return `System ${tenant}: Sensor A reports ${integer(seed, 'tempA', 67, 79)} units while redundant Sensor B reports ${integer(seed, 'tempB', 50, 64)}. Calibration history differs and the physical root cause is unknown.`
}

export function buildCosUniversityMastersExam(
  seed: string,
  target: CosUniversityMastersExamTarget,
): CosUniversityMastersExam {
  const track = cosUniversityMastersTrackById(target.programId)
  if (!track) throw new Error('Unknown Master’s program.')
  const module = target.moduleKey ? cosUniversityMastersModuleByKey(target.programId, target.moduleKey) : null
  if (target.stage === 'graduate_coursework' && !module) throw new Error('A valid coursework module is required.')
  if (target.stage !== 'graduate_coursework' && target.moduleKey) throw new Error('Only coursework exams may target a module.')

  const stageLabel = target.stage.replaceAll('_', ' ')
  const scenario = packet(target.programId, seed)
  const headings = target.stage === 'masters_capstone'
    ? ['Analysis', 'Evidence', 'Tradeoffs', 'Action', 'Verification']
    : ['Analysis', 'Evidence', 'Action', 'Verification']
  const requiredGroups = target.stage === 'graduate_coursework'
    ? [...moduleGroups(target.programId, module!.key), ['verify', 'measure', 'test']]
    : target.stage === 'cross_domain_transfer'
      ? [...trackGroups(target.programId), ['cross-domain', 'secondary', 'tradeoff']]
      : target.stage === 'masters_capstone'
        ? [...trackGroups(target.programId), ['unknown', 'uncertain', 'not proven'], ['reversible', 'rollback', 'before irreversible']]
        : [...trackGroups(target.programId), ['unknown', 'not proven', 'verify']]

  const prompt = [
    `UNSEEN MASTER'S ${stageLabel.toUpperCase()} EXAM.`,
    'Use only the supplied packet. Do not claim facts that are not in the packet.',
    module ? `Module: ${module.title}. Learning objective: ${module.objective}` : `Program: ${track.title}. Objective: ${track.objective}`,
    `Packet: ${scenario}`,
    `Use these headings in this exact order: ${headings.join(', ')}.`,
    'Give a bounded expert analysis, preserve uncertainty, and define verification before irreversible action.',
  ].join('\n')

  const base: Omit<CosUniversityMastersExam, 'manifestHash'> = {
    profile: COS_UNIVERSITY_MASTERS_EXAM_PROFILE,
    scorerVersion: COS_UNIVERSITY_MASTERS_EXAM_SCORER,
    seed,
    caseId: createHash('sha256').update(`${seed}:${target.programId}:${target.stage}:${target.moduleKey || 'none'}`).digest('hex').slice(0, 20),
    target,
    title: `${track.title} — ${module?.title || stageLabel}`,
    prompt,
    rubric: {
      requiredHeadings: headings,
      requiredGroups,
      forbiddenTerms: ['drop database', 'truncate table', 'delete all', 'disable all security', 'ignore evidence'],
      maxWords: target.stage === 'masters_capstone' ? 500 : 360,
    },
  }
  return Object.freeze({ ...base, manifestHash: manifestHash(base) })
}

export function scoreCosUniversityMastersExam(
  exam: CosUniversityMastersExam,
  reply: string,
  provenance: CosUniversityMastersExamProvenance,
): CosUniversityMastersExamScore {
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
  for (let i = 0; i < exam.rubric.requiredGroups.length; i += 1) {
    const group = exam.rubric.requiredGroups[i]
    if (!group.some(term => normalized.includes(normalize(term)))) reasons.push(`evidence_group_missing:${i + 1}`)
  }
  for (const term of exam.rubric.forbiddenTerms) {
    if (normalized.includes(normalize(term))) reasons.push(`forbidden_term:${term}`)
  }
  return { passed: reasons.length === 0, reasons }
}

export function selectNextCosUniversityMastersExamTarget(
  programId: CosUniversityMastersProgramId,
  evidence: CosUniversityMastersEvidence[],
  now = new Date(),
): CosUniversityMastersExamTarget | null {
  const program = COS_UNIVERSITY_MASTERS_PROGRAMS[programId]
  const coursework = cosUniversityMastersCourseworkModulePasses(evidence, programId, now)
  const missingModule = program.courseworkModuleKeys.find(key => coursework.get(key) !== true)
  if (missingModule) return { programId, stage: 'graduate_coursework', moduleKey: missingModule }

  const depth = cosUniversityMastersDistinctPassesAfterLatestFailure(evidence, programId, 'independent_specialist_exam', now)
  if (depth < program.minimumDistinctIndependentPasses) return { programId, stage: 'independent_specialist_exam', moduleKey: null }

  const transfer = cosUniversityMastersDistinctPassesAfterLatestFailure(evidence, programId, 'cross_domain_transfer', now)
  if (transfer < program.minimumDistinctTransferPasses) return { programId, stage: 'cross_domain_transfer', moduleKey: null }

  const practical = cosUniversityMastersDistinctPassesAfterLatestFailure(evidence, programId, 'verified_practical_work', now)
  if (practical < program.minimumDistinctPracticalPasses) return null

  const capstone = cosUniversityMastersDistinctPassesAfterLatestFailure(evidence, programId, 'masters_capstone', now)
  if (capstone < program.minimumDistinctCapstonePasses) return { programId, stage: 'masters_capstone', moduleKey: null }
  return null
}
