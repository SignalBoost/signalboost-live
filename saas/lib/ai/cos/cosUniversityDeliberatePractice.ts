import { createHash } from 'node:crypto'
import { cosUniversitySubjectById, type CosUniversitySubjectId } from './cosUniversity.ts'
import { type CosPlatformLanguage } from './cosUniversityLanguages.ts'
import { type CosUniversityFailureClass } from './cosUniversityStudyStrategy.ts'
import { type CognitivePracticeRubric } from './cognitiveSkillCandidate.ts'

export const COS_UNIVERSITY_PRACTICE_PROFILE = 'cos_university_deliberate_practice_v1'
export const COS_UNIVERSITY_PRACTICE_VARIANTS_PER_ROUND = 2

export type CosUniversityDeliberatePracticePlan = {
  planKey: string
  subjectId: CosUniversitySubjectId
  language: CosPlatformLanguage | null
  failureClass: CosUniversityFailureClass
  objective: string
  practiceRound: number
}

export type CosUniversityDeliberatePracticeVariant = {
  profile: typeof COS_UNIVERSITY_PRACTICE_PROFILE
  planKey: string
  subjectId: CosUniversitySubjectId
  language: CosPlatformLanguage | null
  failureClass: CosUniversityFailureClass
  practiceRound: number
  variantIndex: number
  variantKey: string
  prompt: string
  rubric: CognitivePracticeRubric
  manifestHash: string
}

const SUBJECT_TERMS: Record<CosUniversitySubjectId, readonly string[]> = {
  computer_science: ['system', 'software', 'api', 'database', 'architecture'],
  mathematics: ['model', 'constraint', 'equation', 'quantitative', 'optimization'],
  statistics_data_science: ['measurement', 'uncertainty', 'sample', 'confidence', 'statistical'],
  physics_natural_sciences: ['physical', 'scientific', 'experiment', 'energy', 'measurement'],
  cybersecurity: ['security', 'identity', 'threat', 'containment', 'evidence'],
  politics_government_international_relations: ['policy', 'government', 'diplomatic', 'international', 'geopolitical'],
  social_behavioral_sciences: ['behavior', 'people', 'human', 'organization', 'stakeholder'],
  economics_finance: ['cost', 'budget', 'financial', 'economic', 'risk'],
  business_operations: ['operations', 'customer', 'process', 'delivery', 'commercial'],
  law_regulation_governance: ['legal', 'regulatory', 'compliance', 'governance', 'jurisdiction'],
  language_communication: ['communication', 'audience', 'message', 'language', 'localization'],
  history_culture_philosophy_religion: ['historical', 'culture', 'ethical', 'context', 'institution'],
  reasoning_decision_science: ['evidence', 'uncertainty', 'assumption', 'decision', 'verification'],
}

const LANGUAGE_MARKERS: Record<CosPlatformLanguage, readonly string[]> = {
  en: ['unknown', 'verify', 'evidence', 'please'],
  es: ['desconocido', 'desconocida', 'verificar', 'evidencia', 'por favor'],
  pt: ['desconhecido', 'desconhecida', 'verificar', 'evidência', 'por favor'],
  pl: ['nieznane', 'nieznany', 'zweryfikować', 'dowody', 'proszę'],
  ru: ['неизвестно', 'неизвестный', 'проверить', 'доказательства', 'пожалуйста'],
}

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
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

function practiceSeed(plan: CosUniversityDeliberatePracticePlan, variantIndex: number): string {
  return createHash('sha256')
    .update(`${plan.planKey}:${plan.practiceRound}:${variantIndex}:${plan.subjectId}:${plan.failureClass}:${plan.language || 'none'}`)
    .digest('hex')
}

function subjectGroups(subjectId: CosUniversitySubjectId): string[][] {
  const terms = SUBJECT_TERMS[subjectId]
  return [[terms[0], terms[1]], [terms[2], terms[3], terms[4]]]
}

function failureGroups(failureClass: CosUniversityFailureClass): string[][] {
  switch (failureClass) {
    case 'retrieval':
      return [
        ['evidence', 'record', 'source'],
        ['relevant', 'material', 'directly supports'],
        ['unknown', 'unverified', 'not established'],
      ]
    case 'evidence_selection':
      return [
        ['relevant', 'material', 'probative'],
        ['irrelevant', 'does not establish', 'insufficient'],
        ['evidence', 'record', 'observed'],
      ]
    case 'grounding':
      return [
        ['supported', 'evidence', 'recorded'],
        ['unknown', 'unverified', 'not established'],
        ['cannot conclude', 'do not infer', 'not enough evidence'],
      ]
    case 'stale_or_missing_knowledge':
      return [
        ['current', 'latest', 'recent'],
        ['authoritative', 'official', 'primary source'],
        ['stale', 'older', 'superseded'],
      ]
    case 'reasoning':
      return [
        ['assumption', 'hypothesis', 'premise'],
        ['trade-off', 'alternative', 'option'],
        ['verify', 'falsify', 'test'],
      ]
    case 'calibration':
      return [
        ['confidence', 'uncertainty', 'probability'],
        ['falsifier', 'would change', 'disconfirm'],
        ['unknown', 'unverified', 'uncertain'],
      ]
    case 'tool_execution':
      return [
        ['read-only', 'inspect', 'observe'],
        ['verify', 'test', 'check'],
        ['rollback', 'reversible', 'safe'],
      ]
    case 'cross_domain':
      return [
        ['interaction', 'dependency', 'cross-domain'],
        ['trade-off', 'conflict', 'constraint'],
        ['verify', 'test', 'evidence'],
      ]
    case 'retention':
      return [
        ['principle', 'rule', 'mechanism'],
        ['apply', 'transfer', 'use'],
        ['verify', 'check', 'falsify'],
      ]
    case 'language':
      return [
        ['audience', 'tone', 'register'],
        ['meaning', 'intent', 'instruction'],
        ['verify', 'check', 'clarify'],
      ]
    case 'unknown':
    default:
      return [
        ['evidence', 'fact', 'record'],
        ['uncertainty', 'unknown', 'unverified'],
        ['verify', 'test', 'check'],
      ]
  }
}

function commonRubric(args: {
  subjectId: CosUniversitySubjectId
  failureClass: CosUniversityFailureClass
  project: string
  factA: number
  factB: number
  language: CosPlatformLanguage | null
}): CognitivePracticeRubric {
  const languageGroups = args.language
    ? [
        [LANGUAGE_MARKERS[args.language][0], LANGUAGE_MARKERS[args.language][1]],
        [LANGUAGE_MARKERS[args.language][2], LANGUAGE_MARKERS[args.language][3]],
      ]
    : []
  return {
    requiredConceptGroups: [
      [args.project.toLowerCase()],
      [String(args.factA)],
      [String(args.factB)],
      ...subjectGroups(args.subjectId),
      ...failureGroups(args.failureClass),
      ...languageGroups,
    ],
    forbiddenPatterns: [
      'production is verified',
      'production is confirmed',
      'guaranteed success',
      'all evidence proves',
      'no uncertainty',
    ],
    minimumConceptCoverage: 0.68,
    minimumAnswerCharacters: 260,
  }
}

function localizedInstruction(language: CosPlatformLanguage, packet: string, subjectTitle: string, objective: string): string {
  if (language === 'es') {
    return `PRÁCTICA DELIBERADA. Responde únicamente en español. Usa los hechos del caso y cualquier conocimiento gobernado pertinente que COS pueda recuperar; no inventes hechos. ${packet} Disciplina principal: ${subjectTitle}. Objetivo de aprendizaje: ${objective}. Explica qué está respaldado, qué sigue siendo desconocido, qué evidencia es realmente relevante y cuál es la siguiente verificación.`
  }
  if (language === 'pt') {
    return `PRÁTICA DELIBERADA. Responda somente em português. Use os fatos do caso e qualquer conhecimento governado pertinente que o COS possa recuperar; não invente fatos. ${packet} Disciplina principal: ${subjectTitle}. Objetivo de aprendizagem: ${objective}. Explique o que é sustentado, o que continua desconhecido, qual evidência é realmente relevante e qual é a próxima verificação.`
  }
  if (language === 'pl') {
    return `ĆWICZENIE CELOWE. Odpowiedz wyłącznie po polsku. Użyj faktów z przypadku oraz odpowiedniej wiedzy zarządzanej, którą COS może odzyskać; nie wymyślaj faktów. ${packet} Główna dziedzina: ${subjectTitle}. Cel nauki: ${objective}. Wyjaśnij, co jest poparte dowodami, co pozostaje nieznane, które dowody są naprawdę istotne i jaka powinna być następna weryfikacja.`
  }
  if (language === 'ru') {
    return `ЦЕЛЕНАПРАВЛЕННАЯ ПРАКТИКА. Ответьте только по-русски. Используйте факты задачи и релевантные управляемые знания, которые COS может извлечь; не выдумывайте факты. ${packet} Основная дисциплина: ${subjectTitle}. Цель обучения: ${objective}. Объясните, что подтверждено, что остаётся неизвестным, какие доказательства действительно релевантны и какая проверка должна быть следующей.`
  }
  return `DELIBERATE PRACTICE. Answer only in English. Use the case facts and any relevant governed knowledge COS can retrieve; do not invent facts. ${packet} Primary discipline: ${subjectTitle}. Learning objective: ${objective}. Explain what is supported, what remains unknown, which evidence is actually relevant, and the next verification.`
}

function genericPrompt(args: {
  seed: string
  subjectId: CosUniversitySubjectId
  failureClass: CosUniversityFailureClass
  objective: string
  variantIndex: number
}): { project: string; factA: number; factB: number; prompt: string } {
  const project = choose(args.seed, 'project', ['Atlas', 'Orion', 'Lumen', 'Cedar', 'Harbor'] as const)
  const family = choose(args.seed, 'family', ['reliability', 'procurement', 'customer', 'policy'] as const)
  const factA = integer(args.seed, 'fact-a', 17, 79)
  const factB = integer(args.seed, 'fact-b', 3, 16)
  const title = cosUniversitySubjectById(args.subjectId).title
  let packet: string
  if (family === 'reliability') {
    packet = `${project} has ${factA} passing pre-release checks. A customer-facing incident remains open. The proposed repair changed ${factB} files. Production deployment and customer recovery have not been verified.`
  } else if (family === 'procurement') {
    packet = `${project} is evaluating a vendor. ${factA} control requirements are documented, ${factB} remain unresolved, and the technical demo passed. Data residency, final commercial terms, and live operating evidence are not yet verified.`
  } else if (family === 'customer') {
    packet = `${project} support resolved ${factA} tickets this week, while ${factB} were reopened. First-response time improved, but the packet contains no direct evidence that customer satisfaction improved or that the underlying causes of reopenings are known.`
  } else {
    packet = `${project} has a policy review with ${factA} recorded requirements and ${factB} unresolved exceptions. An older internal note conflicts with the current review packet. Final approval and live implementation are not verified.`
  }
  const prompt = `HOST-CURATED UNIVERSITY PRACTICE — round ${args.variantIndex + 1}. ${packet} Primary discipline: ${title}. Current learning objective: ${clean(args.objective, 1200)}. Diagnose the case in a way that specifically practices ${args.failureClass.replace(/_/g, ' ')}. Separate recorded facts from inference, identify the most relevant evidence, state material uncertainty, and give the next safe verification. Do not claim a deployment, approval, recovery, or outcome that the packet does not establish.`
  return { project, factA, factB, prompt }
}

function finishVariant(input: Omit<CosUniversityDeliberatePracticeVariant, 'manifestHash'>): CosUniversityDeliberatePracticeVariant {
  const manifestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  return Object.freeze({ ...input, manifestHash })
}

export function buildCosUniversityDeliberatePracticeVariants(
  plan: CosUniversityDeliberatePracticePlan,
): CosUniversityDeliberatePracticeVariant[] {
  const planKey = clean(plan.planKey, 160)
  if (!/^[0-9a-f]{32,128}$/i.test(planKey)) throw new Error('A stable University plan key is required for deliberate practice.')
  const practiceRound = Math.max(1, Math.floor(Number(plan.practiceRound || 1)))
  const objective = clean(plan.objective, 1600) || `Improve ${cosUniversitySubjectById(plan.subjectId).title}.`
  const variants: CosUniversityDeliberatePracticeVariant[] = []

  for (let index = 0; index < COS_UNIVERSITY_PRACTICE_VARIANTS_PER_ROUND; index += 1) {
    const seed = practiceSeed({ ...plan, planKey, practiceRound, objective }, index)
    const base = genericPrompt({
      seed,
      subjectId: plan.subjectId,
      failureClass: plan.failureClass,
      objective,
      variantIndex: index,
    })
    const subjectTitle = cosUniversitySubjectById(plan.subjectId).title
    const prompt = plan.language
      ? localizedInstruction(plan.language, base.prompt, subjectTitle, objective)
      : base.prompt
    const rubric = commonRubric({
      subjectId: plan.subjectId,
      failureClass: plan.failureClass,
      project: base.project,
      factA: base.factA,
      factB: base.factB,
      language: plan.language,
    })
    const variantKey = `university:${planKey.slice(0, 20)}:r${practiceRound}:v${index + 1}:${seed.slice(0, 12)}`
    variants.push(finishVariant({
      profile: COS_UNIVERSITY_PRACTICE_PROFILE,
      planKey,
      subjectId: plan.subjectId,
      language: plan.language,
      failureClass: plan.failureClass,
      practiceRound,
      variantIndex: index,
      variantKey,
      prompt,
      rubric,
    }))
  }

  return variants
}

export function cosUniversityPracticeSkillKey(planKey: string): string {
  const cleanKey = clean(planKey, 160)
  return `university-practice-${createHash('sha256').update(cleanKey).digest('hex').slice(0, 32)}`
}
