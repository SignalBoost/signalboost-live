// saas/lib/ai/cos/cosUniversityIndependentExam.ts
import { createHash } from 'node:crypto'
import {
  COS_UNIVERSITY_SUBJECTS,
  cosUniversitySubjectById,
  type CosUniversityAssessmentKind,
  type CosUniversitySubjectId,
} from './cosUniversity.ts'
import {
  COS_PLATFORM_LANGUAGES,
  type CosPlatformLanguage,
  type CosPlatformLanguageDimension,
} from './cosUniversityLanguages.ts'

export const COS_UNIVERSITY_EXAM_PROFILE = 'cos_university_unseen_v1'
export const COS_UNIVERSITY_EXAM_SCORER = 'university-host-scorer-v3'
export const COS_UNIVERSITY_MINIMUM_UNSEEN_PASSES = 2

export type CosUniversityExamTarget =
  | { kind: 'subject'; subjectId: CosUniversitySubjectId }
  | { kind: 'language'; language: CosPlatformLanguage; dimension: CosPlatformLanguageDimension }

export type CosUniversityExamRubric = Readonly<{
  requiredGroups: readonly (readonly string[])[]
  forbiddenTerms?: readonly string[]
  exactPatterns?: readonly string[]
  /**
   * Required computed values, matched numerically rather than as a literal string. A correct answer
   * written as "3,333.33" must not fail because the host computed 3333.3333333333335 in floating point.
   */
  exactNumbers?: readonly Readonly<{ value: number; allowCeilInteger?: boolean }>[]
  maxWords?: number
  numberedActions?: number
  targetLanguage?: CosPlatformLanguage
}>

export type CosUniversityBlindExam = Readonly<{
  profile: typeof COS_UNIVERSITY_EXAM_PROFILE
  scorerVersion: typeof COS_UNIVERSITY_EXAM_SCORER
  seed: string
  caseId: string
  assessmentKind: Extract<CosUniversityAssessmentKind, 'unseen_subject_exam'>
  target: CosUniversityExamTarget
  title: string
  prompt: string
  rubric: CosUniversityExamRubric
  manifestHash: string
}>

export type CosUniversityExamProvenance = {
  localReasoning?: boolean
  externalAi?: boolean
  semanticCache?: boolean
  handled?: boolean
  turnId?: string | null
}

export type CosUniversityExamScore = {
  passed: boolean
  reasons: string[]
}

export type CosUniversityExamAssessmentRow = {
  subject_id: CosUniversitySubjectId | null
  language_code: CosPlatformLanguage | null
  language_dimension: CosPlatformLanguageDimension | null
  assessment_kind: CosUniversityAssessmentKind
  passed: boolean
  independent_scorer: boolean
  scorer_authority: string
  observed_at: string
  valid_until: string
}

const LANGUAGE_DIMENSIONS: readonly CosPlatformLanguageDimension[] = [
  'comprehension',
  'writing',
  'instruction_following',
  'translation_localization',
  'cultural_pragmatics',
]

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

function hasAny(text: string, terms: readonly string[]): boolean {
  const value = normalize(text)
  return terms.some(term => value.includes(normalize(term)))
}

/**
 * Scorer v3. v2 required the literal JavaScript string of each computed value, so a non-integer such
 * as 100000 / 30 demanded "3333.3333333333335" and rejected every correctly rounded answer, and an
 * integer written with a thousands separator ("6,000") was rejected too. A stated value now matches
 * when it equals the expected value at the precision the learner wrote it:
 *  - integers: exact after removing thousands separators ("6,000" = 6000; "6,000.00" = 6000);
 *  - non-integers: written with at least one decimal and within half a unit of its last decimal
 *    ("3,333.33" and "3333.3" match 3333.333…; "3333.4" does not);
 *  - allowCeilInteger: a whole-unit answer rounded up, for counts that cannot be fractional
 *    (break-even units: 3,334).
 * Nothing is looser than the stated precision: a wrong number never matches.
 */
function statedNumbers(text: string): Array<{ value: number; decimals: number }> {
  const found: Array<{ value: number; decimals: number }> = []
  for (const match of text.matchAll(/(?<![0-9.,])-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?![0-9])/g)) {
    const raw = match[0].replace(/,/g, '')
    const value = Number(raw)
    if (!Number.isFinite(value)) continue
    const dot = raw.indexOf('.')
    found.push({ value, decimals: dot >= 0 ? raw.length - dot - 1 : 0 })
  }
  return found
}

export function statesExpectedNumber(text: string, expected: number, allowCeilInteger = false): boolean {
  if (!Number.isFinite(expected)) return false
  const integer = Number.isInteger(expected)
  return statedNumbers(String(text ?? '')).some(({ value, decimals }) => {
    if (integer) return value === expected
    if (decimals === 0) return allowCeilInteger && value === Math.ceil(expected)
    return Math.abs(value - expected) <= 0.5 * 10 ** -decimals + 1e-9
  })
}

/**
 * This is only a bounded script/language sanity check after the substantive rubric has passed.
 * It must recognize valid exam vocabulary rather than demand one arbitrary phrase. Scorer v2 fixes
 * the first Polish blind-exam defect without changing any required facts or task semantics.
 */
function languageMarker(language: CosPlatformLanguage): RegExp {
  if (language === 'ru') return /[А-Яа-яЁё]{3,}/
  if (language === 'pl') return /(?:[ąćęłńóśźż]|\b(?:proszę|dziękuj\w*|jest|będzie|spotkanie|raport|sprawdzenie|projekt|wdrożenia|pozostaje|nieznan\w*)\b)/i
  if (language === 'pt') return /(?:[ãõçáéíóúâêô]|\b(?:obrigad\w*|por favor|está|será|reunião|relatório|verificação|projeto|implantação|desconhecid\w*)\b)/i
  if (language === 'es') return /(?:[ñáéíóúü¿¡]|\b(?:gracias|por favor|está|será|reunión|informe|verificación|proyecto|despliegue|desconocid\w*)\b)/i
  if (language === 'de') return /(?:[äöüß]|(?<!\p{L})(?:bitte|danke|ist|wird|besprechung|bericht|prüfung\p{L}*|projekt|bereitstellung|unbekannt\p{L}*|nicht)(?!\p{L}))/iu
  if (language === 'fr') return /(?:[œ]|(?<!\p{L})(?:merci|s’il vous plaît|s'il vous plaît|est|sera|réunion|rapport|vérification\p{L}*|projet|déploiement|inconnu\p{L}*|les|des|du|vous|nous|avec|dans|sur)(?!\p{L}))/iu
  if (language === 'it') return /(?<!\p{L})(?:grazie|per favore|è|sarà|riunione|rapporto|controll[io]|progetto|rilascio|sconosciut\p{L}*|della|sono)(?!\p{L})/iu
  // Hiragana separates Japanese from Chinese-only text; Hangul and Arabic script identify Korean and Arabic.
  if (language === 'ja') return /[\u3040-\u309f]{2,}/u
  if (language === 'ko') return /[\uac00-\ud7af]{2,}/u
  if (language === 'ar') return /[\u0621-\u064a]{3,}/u
  return /\b(?:the|please|is|are|will|meeting|report|check|project|deployment|unknown)\b/i
}

function manifestHash(input: Omit<CosUniversityBlindExam, 'manifestHash'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function finishExam(input: Omit<CosUniversityBlindExam, 'manifestHash'>): CosUniversityBlindExam {
  return Object.freeze({ ...input, manifestHash: manifestHash(input) })
}

function subjectExam(seed: string, subjectId: CosUniversitySubjectId): CosUniversityBlindExam {
  const base = {
    profile: COS_UNIVERSITY_EXAM_PROFILE,
    scorerVersion: COS_UNIVERSITY_EXAM_SCORER,
    seed,
    caseId: `${subjectId}:${createHash('sha256').update(seed).digest('hex').slice(0, 12)}`,
    assessmentKind: 'unseen_subject_exam' as const,
    target: { kind: 'subject' as const, subjectId },
    title: `Unseen ${cosUniversitySubjectById(subjectId).title} examination`,
  } as const

  if (subjectId === 'computer_science') {
    const oldP95 = integer(seed, 'cs:old', 180, 320)
    const newP95 = integer(seed, 'cs:new', 780, 1180)
    const cpu = integer(seed, 'cs:cpu', 32, 54)
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. Use only this packet; do not use outside facts. A multi-tenant API changed from p95 ${oldP95} ms to ${newP95} ms for Tenant Atlas. Database CPU is ${cpu}%. Queue depth is normal. The slow query plan shows a sequential scan of orders, and there is no composite index on tenant_id plus created_at. Give a safe diagnosis before any Production mutation. Use three headings: Diagnosis, Evidence, Next check.`,
      rubric: {
        requiredGroups: [
          ['sequential scan', 'seq scan'],
          ['index', 'composite index'],
          ['explain', 'query plan'],
          ['measure', 'compare', 'baseline'],
          ['atlas'],
        ],
        forbiddenTerms: ['drop database', 'truncate table', 'delete all'],
        maxWords: 260,
      },
    })
  }

  if (subjectId === 'mathematics') {
    const x = integer(seed, 'math:x', 2, 9)
    const y = integer(seed, 'math:y', 2, 9)
    const a = x + y
    const b = 2 * x - y
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. Solve the system exactly and verify by substitution: x + y = ${a}; 2x - y = ${b}. Do not use an external calculator or source. State x and y clearly, then show a short verification.`,
      rubric: {
        requiredGroups: [['verify', 'verification', 'substitut']],
        exactPatterns: [`\\bx\\s*=\\s*${x}\\b`, `\\by\\s*=\\s*${y}\\b`],
        maxWords: 180,
      },
    })
  }

  if (subjectId === 'statistics_data_science') {
    const n = 1000
    const aConv = choose(seed, 'stats:a', [80, 100, 120] as const)
    const bConv = Math.round(aConv * 1.2)
    const rateA = aConv / 10
    const rateB = bConv / 10
    const pp = Number((rateB - rateA).toFixed(1))
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. Variant A has ${aConv} conversions out of ${n}; Variant B has ${bConv} out of ${n}. Compute both conversion rates and the absolute percentage-point difference. Then state what additional statistical evidence is needed before claiming the treatment caused the difference.`,
      rubric: {
        requiredGroups: [
          ['confidence interval', 'statistical test', 'hypothesis test', 'uncertainty'],
          ['causal', 'causation', 'caused'],
        ],
        forbiddenTerms: ['proves b is better', 'proves the treatment'],
        exactNumbers: [{ value: rateA }, { value: rateB }, { value: pp }],
        maxWords: 220,
      },
    })
  }

  if (subjectId === 'physics_natural_sciences') {
    const acceleration = integer(seed, 'physics:a', 2, 5)
    const seconds = integer(seed, 'physics:t', 3, 6)
    const speed = acceleration * seconds
    const distance = 0.5 * acceleration * seconds * seconds
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. A cart starts from rest and accelerates uniformly at ${acceleration} m/s^2 for ${seconds} s. Compute its final speed and distance traveled. Show the equations used and include units.`,
      rubric: {
        requiredGroups: [['v =', 'velocity', 'speed'], ['distance', 's =', 'displacement'], ['m/s'], ['m/s^2', 'm/s²']],
        exactNumbers: [{ value: speed }, { value: distance }],
        maxWords: 180,
      },
    })
  }

  if (subjectId === 'quantum_computing') {
    const extraQubits = integer(seed, 'quantum:extra-qubits', 1, 5)
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. Use only this packet and standard quantum-computing concepts. A ${2 + extraQubits}-qubit register starts in |0...0>. On the first two qubits, apply a Hadamard gate to qubit 0 followed by a CNOT with qubit 0 as control and qubit 1 as target. The remaining qubits are untouched. Explain the ideal relationship between the first two measured bits, distinguish superposition from entanglement, and explain why repeated hardware measurements plus a classical baseline are required before claiming practical quantum advantage. State one effect of noise or decoherence and one error-mitigation, error-correction, or fault-tolerance direction.`,
      rubric: {
        requiredGroups: [
          ['hadamard', 'superposition'],
          ['cnot', 'controlled-not', 'controlled not'],
          ['entangl', 'correlat'],
          ['00', '11'],
          ['measurement', 'shots', 'repeated'],
          ['classical baseline', 'classical comparison', 'benchmark'],
          ['noise', 'decoherence'],
          ['error correction', 'error mitigation', 'fault tolerance'],
        ],
        forbiddenTerms: ['proves quantum advantage', 'guaranteed quantum advantage'],
        maxWords: 320,
      },
    })
  }

  if (subjectId === 'cybersecurity') {
    const count = integer(seed, 'cyber:count', 4, 11)
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. Use only this incident packet. One employee account generated ${count} MFA prompts in ten minutes, followed by a successful login from a country not previously observed for that account. No malware evidence is supplied. Produce a defensive triage plan that preserves evidence, limits account risk, verifies the user, and avoids claiming an unproven root cause.`,
      rubric: {
        requiredGroups: [
          ['preserve', 'retain', 'logs', 'evidence'],
          ['revoke session', 'contain', 'reset credential', 'disable account'],
          ['verify the user', 'contact the user', 'confirm with the user'],
          ['scope', 'review other', 'check other'],
          ['unknown', 'not proven', 'cannot conclude', 'unproven'],
        ],
        forbiddenTerms: ['delete logs', 'disable all security', 'confirmed malware'],
        maxWords: 300,
      },
    })
  }

  if (subjectId === 'politics_government_international_relations') {
    const partyNames = ['Alder', 'Birch', 'Cedar', 'Dune'] as const
    const seats = [42, 31, 17, 10] as const
    const majority = 51
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. In a fictional 100-seat parliament, ${partyNames[0]} holds ${seats[0]} seats, ${partyNames[1]} ${seats[1]}, ${partyNames[2]} ${seats[2]}, and ${partyNames[3]} ${seats[3]}. A majority requires ${majority}. Which two-party coalition has the smallest seat total that still forms a numerical majority? State the arithmetic. Do not infer who will actually govern; coalition agreements and appointment rules are not supplied.`,
      rubric: {
        requiredGroups: [['alder'], ['dune'], ['52'], ['cannot', 'not supplied', 'unknown', 'do not know']],
        forbiddenTerms: ['will govern', 'definitely govern'],
        maxWords: 180,
      },
    })
  }

  if (subjectId === 'social_behavioral_sciences') {
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. A voluntary company survey finds that employees who chose remote work report higher job satisfaction than employees who chose office work. No random assignment occurred. Explain what can and cannot be inferred, name at least one plausible selection/confounding mechanism, and propose a stronger design for estimating a causal effect without inventing individual motives.`,
      rubric: {
        requiredGroups: [
          ['correlation', 'association'],
          ['not caus', 'cannot infer caus', 'does not establish caus'],
          ['selection bias', 'self-selection', 'confound'],
          ['random', 'quasi-experiment', 'natural experiment', 'matched'],
        ],
        forbiddenTerms: ['remote work causes higher satisfaction', 'employees chose remote because they are happier'],
        maxWords: 260,
      },
    })
  }

  if (subjectId === 'economics_finance') {
    const fixed = choose(seed, 'finance:fixed', [100000, 120000, 150000] as const)
    const price = choose(seed, 'finance:price', [50, 60, 75] as const)
    const variable = price - choose(seed, 'finance:margin', [20, 25, 30] as const)
    const margin = price - variable
    const breakEven = fixed / margin
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. A product has fixed annual cost $${fixed}, price $${price} per unit, and variable cost $${variable} per unit. Compute contribution margin per unit and break-even unit volume. State the formulas and do not treat break-even as profit.`,
      rubric: {
        requiredGroups: [['contribution margin'], ['break-even', 'break even'], ['fixed cost'], ['variable cost']],
        exactNumbers: [{ value: margin }, { value: breakEven, allowCeilInteger: true }],
        forbiddenTerms: ['break-even is profit', 'break even is profit'],
        maxWords: 180,
      },
    })
  }

  if (subjectId === 'business_operations') {
    const intake = 90
    const review = 60
    const fulfillment = 85
    const demand = 75
    const growth = demand - review
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. A daily workflow has capacity: intake ${intake}, review ${review}, fulfillment ${fulfillment}. Demand is ${demand} cases/day and work must pass all three stages. Identify the throughput bottleneck, compute expected daily queue growth at that bottleneck, and give the smallest operational intervention to test first.`,
      rubric: {
        requiredGroups: [['review'], ['bottleneck'], [String(growth)], ['capacity', 'throughput'], ['test', 'pilot', 'measure']],
        maxWords: 220,
      },
    })
  }

  if (subjectId === 'law_regulation_governance') {
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. A fictional SaaS company wants to transfer EU customer personal data to a U.S. vendor. The contract excerpt supplied to you is silent on international transfers, and no transfer mechanism or jurisdiction-specific assessment is supplied. State what can be concluded now, what governing documents/evidence must be checked, and what should remain unresolved. Do not give a categorical legal/illegal conclusion from missing evidence.`,
      rubric: {
        requiredGroups: [
          ['cannot conclude', 'insufficient', 'unknown', 'unresolved'],
          ['dpa', 'data processing agreement', 'contract'],
          ['scc', 'standard contractual clauses', 'transfer mechanism'],
          ['jurisdiction', 'law', 'legal review', 'privacy'],
        ],
        forbiddenTerms: ['the transfer is legal', 'the transfer is illegal'],
        maxWords: 260,
      },
    })
  }

  if (subjectId === 'language_communication') {
    const tests = integer(seed, 'comm:tests', 24, 49)
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. Rewrite this status for an executive audience in no more than 70 words: "${tests} automated tests passed. The deployment record is missing. Production health has not been checked. The next routine step is to verify the deployment record and then run the health check." Preserve all facts. Do not turn missing evidence into a claim that deployment did not happen.`,
      rubric: {
        requiredGroups: [[String(tests)], ['deployment record'], ['production', 'health'], ['verify', 'check']],
        forbiddenTerms: ['not deployed', 'deployment failed', 'not live'],
        maxWords: 70,
      },
    })
  }

  if (subjectId === 'history_culture_philosophy_religion') {
    const year = integer(seed, 'history:year', 1912, 1924)
    return finishExam({ ...base,
      prompt: `UNSEEN UNIVERSITY EXAM. Source A is a private diary written in ${year} by a participant in a political movement. Source B is a scholarly synthesis published in 2024 using many archives. They disagree about the movement's principal cause. Explain how their evidentiary roles differ, what each can contribute, and what additional corroboration is needed before preferring one causal account. Do not assume newer automatically means truer or primary automatically means definitive.`,
      rubric: {
        requiredGroups: [
          ['primary', 'contempor'],
          ['scholarly', 'secondary', 'synthesis'],
          ['corrobor', 'additional source', 'other evidence', 'triangulat'],
          ['context', 'bias', 'perspective', 'limitation'],
        ],
        forbiddenTerms: ['newer source is true', 'primary source is definitive'],
        maxWords: 260,
      },
    })
  }

  return finishExam({ ...base,
    prompt: `UNSEEN UNIVERSITY EXAM. Evaluate this inference: "All red widgets are heavy. Some heavy widgets are fragile. Therefore, some red widgets are fragile." Decide whether the conclusion follows. If it does not, give a concrete counterexample consistent with both premises and state what extra premise would make the conclusion follow.`,
    rubric: {
      requiredGroups: [
        ['does not follow', 'invalid', 'not valid'],
        ['counterexample', 'could be', 'possible'],
        ['extra premise', 'additional premise', 'would need'],
      ],
      forbiddenTerms: ['therefore some red widgets are fragile is valid', 'the conclusion necessarily follows'],
      maxWords: 220,
    },
  })
}

/** The deployment stems the first five platform languages have always shared; kept as one list so their rubrics are unchanged. */
const SHARED_DEPLOYMENT_TERMS: readonly string[] = ['deploy', 'desplieg', 'implant', 'wdroż', 'развер']

/** Target-language forms of the facts each language exam requires the answer to state. */
const LANGUAGE_EXAM_TERMS: Record<CosPlatformLanguage, {
  orion: readonly string[]
  three: readonly string[]
  fourteen: readonly string[]
  unknown: readonly string[]
  deployment: readonly string[]
  smoke: readonly string[]
  friday: readonly string[]
  twelve: readonly string[]
  time: readonly string[]
  risk: readonly string[]
  please: readonly string[]
  thanks: readonly string[]
  meeting: readonly string[]
}> = {
  en: {
    orion: ['orion'], three: ['3'], fourteen: ['14'], unknown: ['unknown'], deployment: SHARED_DEPLOYMENT_TERMS, smoke: ['smoke'],
    friday: ['friday'], twelve: ['12'], time: ['14:30'], risk: ['risk'],
    please: ['please', 'could we', 'would it be possible'], thanks: ['thank'], meeting: ['meeting'],
  },
  es: {
    orion: ['orion'], three: ['3'], fourteen: ['14'], unknown: ['desconocid'], deployment: SHARED_DEPLOYMENT_TERMS, smoke: ['smoke'],
    friday: ['viernes'], twelve: ['12'], time: ['14:30'], risk: ['riesgo'],
    please: ['por favor', 'podríamos', 'podemos'], thanks: ['gracias'], meeting: ['reuni'],
  },
  pt: {
    orion: ['orion'], three: ['3'], fourteen: ['14'], unknown: ['desconhecid'], deployment: SHARED_DEPLOYMENT_TERMS, smoke: ['smoke'],
    friday: ['sexta'], twelve: ['12'], time: ['14:30'], risk: ['risco'],
    please: ['por favor', 'poderíamos', 'podemos'], thanks: ['obrigad'], meeting: ['reuni'],
  },
  pl: {
    orion: ['orion'], three: ['3'], fourteen: ['14'], unknown: ['nieznan'], deployment: SHARED_DEPLOYMENT_TERMS, smoke: ['smoke'],
    friday: ['piątek', 'piątku'], twelve: ['12'], time: ['14:30'], risk: ['ryzyk'],
    please: ['proszę', 'czy możemy', 'czy moglibyśmy'], thanks: ['dziękuj'], meeting: ['spotkan'],
  },
  ru: {
    orion: ['orion'], three: ['3'], fourteen: ['14'], unknown: ['неизвест'], deployment: SHARED_DEPLOYMENT_TERMS, smoke: ['smoke'],
    friday: ['пятниц'], twelve: ['12'], time: ['14:30'], risk: ['риск'],
    please: ['пожалуйста', 'прошу', 'можно'], thanks: ['спасибо', 'благодар'], meeting: ['встреч'],
  },
  de: {
    orion: ['orion'], three: ['3'], fourteen: ['14'], unknown: ['unbekannt', 'ungeklärt', 'offen'], deployment: ['deploy', 'bereitstell'], smoke: ['smoke'],
    friday: ['freitag'], twelve: ['12'], time: ['14:30', '14.30'], risk: ['risiko'],
    please: ['bitte', 'könnten wir', 'wäre es möglich'], thanks: ['dank'], meeting: ['meeting', 'besprechung', 'termin', 'sitzung'],
  },
  fr: {
    orion: ['orion'], three: ['3'], fourteen: ['14'], unknown: ['inconnu', 'incertain'], deployment: ['deploy', 'déploi'], smoke: ['smoke'],
    friday: ['vendredi'], twelve: ['12'], time: ['14:30', '14 h 30', '14h30'], risk: ['risque'],
    please: ['s’il vous plaît', 's\'il vous plaît', 'pourriez-vous', 'pourrions-nous', 'serait-il possible', 'pourrais-tu'], thanks: ['merci', 'remerci'], meeting: ['réunion'],
  },
  it: {
    orion: ['orion'], three: ['3'], fourteen: ['14'], unknown: ['sconosciut', 'non noto', 'non è noto', 'ignot'], deployment: ['deploy', 'rilasci'], smoke: ['smoke'],
    friday: ['venerdì', 'venerdi'], twelve: ['12'], time: ['14:30', '14.30'], risk: ['rischi'],
    please: ['per favore', 'potremmo', 'potresti', 'sarebbe possibile'], thanks: ['grazie', 'ringrazi'], meeting: ['riunione'],
  },
  ja: {
    orion: ['orion', 'オリオン'], three: ['3', '３', '三'], fourteen: ['14', '１４'], unknown: ['不明', 'わかって', '分かって', '未確認'], deployment: ['deploy', 'デプロイ'], smoke: ['smoke', 'スモーク'],
    friday: ['金曜'], twelve: ['12', '１２'], time: ['14:30', '14時30分', '１４:３０'], risk: ['リスク'],
    please: ['お願い', 'いただけ', 'ください'], thanks: ['ありがとう', '感謝'], meeting: ['会議', 'ミーティング', '打ち合わせ'],
  },
  ko: {
    orion: ['orion', '오리온'], three: ['3'], fourteen: ['14'], unknown: ['알 수 없', '알려지지', '미확인', '확인되지', '불명'], deployment: ['deploy', '배포'], smoke: ['smoke', '스모크'],
    friday: ['금요일'], twelve: ['12'], time: ['14:30', '14시 30분', '오후 2시 30분'], risk: ['위험', '리스크'],
    please: ['부탁', '주시겠', '주실 수', '가능할까요', '주세요'], thanks: ['감사', '고맙'], meeting: ['회의', '미팅'],
  },
  ar: {
    orion: ['orion', 'أوريون', 'اوريون'], three: ['3', '٣', 'ثلاث'], fourteen: ['14', '١٤'], unknown: ['غير معروف', 'مجهول', 'غير مؤكد', 'غير واضح'], deployment: ['deploy', 'النشر', 'نشر'], smoke: ['smoke', 'فحص أولي', 'الفحص الأولي', 'فحص الدخان'],
    friday: ['الجمعة'], twelve: ['12', '١٢'], time: ['14:30', '١٤:٣٠'], risk: ['مخاطر', 'المخاطر', 'الخطر'],
    please: ['من فضلك', 'هل يمكن', 'هل يمكنك', 'هل يمكننا', 'أرجو', 'يرجى', 'نرجو', 'الرجاء', 'لو سمحت'], thanks: ['شكر'], meeting: ['اجتماع'],
  },
}

function languageExam(seed: string, language: CosPlatformLanguage, dimension: CosPlatformLanguageDimension): CosUniversityBlindExam {
  const languageTitle = COS_PLATFORM_LANGUAGES.find(row => row.id === language)?.title ?? language
  const base = {
    profile: COS_UNIVERSITY_EXAM_PROFILE,
    scorerVersion: COS_UNIVERSITY_EXAM_SCORER,
    seed,
    caseId: `language:${language}:${dimension}:${createHash('sha256').update(seed).digest('hex').slice(0, 12)}`,
    assessmentKind: 'unseen_subject_exam' as const,
    target: { kind: 'language' as const, language, dimension },
    title: `Unseen ${languageTitle} ${dimension.replaceAll('_', ' ')} examination`,
  } as const

  const localized = {
    en: {
      comprehension: 'Project Orion passed 3 checks on 14 September. Deployment status remains unknown. Answer in English: how many checks passed, on what date, and what remains unknown?',
      writing: 'Write a professional English status update in two or three sentences: 27 tests passed; deployment is not yet verified; next step is a smoke check. Add no new facts.',
      instruction_following: 'Answer in English with exactly three numbered actions. Each action must contain Owner, Deadline, and Done when. Use owner Maya and deadline Friday.',
      translation_localization: 'Translate into natural professional English while preserving every fact: "La revisión es el 12 de septiembre a las 14:30. Lleve el informe de riesgos."',
      cultural_pragmatics: 'Write a polite professional English message asking a colleague to move tomorrow’s meeting by one hour. Include thanks and leave room for the colleague to say the proposed time does not work.',
    },
    es: {
      comprehension: 'El proyecto Orion aprobó 3 verificaciones el 14 de septiembre. El estado del despliegue sigue siendo desconocido. Responde en español: ¿cuántas verificaciones pasaron, en qué fecha y qué sigue sin saberse?',
      writing: 'Escribe una actualización profesional en español de dos o tres frases: pasaron 27 pruebas; el despliegue aún no está verificado; el siguiente paso es una verificación smoke. No añadas hechos.',
      instruction_following: 'Responde en español con exactamente tres acciones numeradas. Cada acción debe incluir Responsable, Fecha límite y Terminado cuando. Usa a Maya como responsable y viernes como fecha límite.',
      translation_localization: 'Traduce al español profesional y natural conservando todos los hechos: "The review is on 12 September at 14:30. Bring the risk memo."',
      cultural_pragmatics: 'Escribe un mensaje profesional y cortés en español para pedir a un colega mover una hora la reunión de mañana. Da las gracias y deja espacio para que diga que la nueva hora no le conviene.',
    },
    pt: {
      comprehension: 'O projeto Orion passou em 3 verificações em 14 de setembro. O status da implantação continua desconhecido. Responda em português: quantas verificações passaram, em que data e o que continua desconhecido?',
      writing: 'Escreva uma atualização profissional em português de duas ou três frases: 27 testes passaram; a implantação ainda não foi verificada; o próximo passo é uma verificação smoke. Não acrescente fatos.',
      instruction_following: 'Responda em português com exatamente três ações numeradas. Cada ação deve incluir Responsável, Prazo e Concluído quando. Use Maya como responsável e sexta-feira como prazo.',
      translation_localization: 'Traduza para português profissional e natural preservando todos os fatos: "The review is on 12 September at 14:30. Bring the risk memo."',
      cultural_pragmatics: 'Escreva uma mensagem profissional e cortês em português pedindo a um colega para adiar em uma hora a reunião de amanhã. Agradeça e deixe espaço para ele dizer que o novo horário não funciona.',
    },
    pl: {
      comprehension: 'Projekt Orion przeszedł 3 kontrole 14 września. Status wdrożenia pozostaje nieznany. Odpowiedz po polsku: ile kontroli przeszło, kiedy i co pozostaje nieznane?',
      writing: 'Napisz profesjonalną aktualizację po polsku w dwóch lub trzech zdaniach: 27 testów przeszło; wdrożenie nie zostało jeszcze zweryfikowane; następnym krokiem jest test smoke. Nie dodawaj faktów.',
      instruction_following: 'Odpowiedz po polsku dokładnie trzema ponumerowanymi działaniami. Każde ma zawierać pola Odpowiedzialny, Termin i Gotowe, gdy. Użyj Maya jako odpowiedzialnej i piątku jako terminu.',
      translation_localization: 'Przetłumacz na naturalny profesjonalny polski, zachowując wszystkie fakty: "The review is on 12 September at 14:30. Bring the risk memo."',
      cultural_pragmatics: 'Napisz po polsku uprzejmą profesjonalną wiadomość z prośbą o przesunięcie jutrzejszego spotkania o godzinę. Podziękuj i pozostaw możliwość, że nowa godzina nie pasuje.',
    },
    ru: {
      comprehension: 'Проект Orion прошёл 3 проверки 14 сентября. Статус развертывания остаётся неизвестным. Ответьте по-русски: сколько проверок пройдено, когда и что остаётся неизвестным?',
      writing: 'Напишите профессиональное обновление по-русски в двух или трёх предложениях: 27 тестов пройдены; развертывание ещё не проверено; следующий шаг — smoke-проверка. Не добавляйте фактов.',
      instruction_following: 'Ответьте по-русски ровно тремя нумерованными действиями. В каждом укажите Ответственный, Срок и Готово, когда. Ответственная — Maya, срок — пятница.',
      translation_localization: 'Переведите на естественный профессиональный русский, сохранив все факты: "The review is on 12 September at 14:30. Bring the risk memo."',
      cultural_pragmatics: 'Напишите по-русски вежливое профессиональное сообщение с просьбой перенести завтрашнюю встречу на один час. Поблагодарите и оставьте возможность сказать, что новое время не подходит.',
    },
    de: {
      comprehension: 'Projekt Orion hat am 14. September 3 Prüfungen bestanden. Der Bereitstellungsstatus ist weiterhin unbekannt. Antworten Sie auf Deutsch: Wie viele Prüfungen wurden bestanden, an welchem Datum, und was ist noch unbekannt?',
      writing: 'Schreiben Sie ein professionelles Status-Update auf Deutsch in zwei oder drei Sätzen: 27 Tests bestanden; die Bereitstellung ist noch nicht verifiziert; der nächste Schritt ist ein Smoke-Check. Fügen Sie keine neuen Fakten hinzu.',
      instruction_following: 'Antworten Sie auf Deutsch mit genau drei nummerierten Maßnahmen. Jede Maßnahme muss Verantwortlich, Frist und Erledigt, wenn enthalten. Verwenden Sie Maya als Verantwortliche und Freitag als Frist.',
      translation_localization: 'Übersetzen Sie in natürliches, professionelles Deutsch und bewahren Sie dabei jede Tatsache: "The review is on 12 September at 14:30. Bring the risk memo."',
      cultural_pragmatics: 'Schreiben Sie eine höfliche, professionelle Nachricht auf Deutsch, in der Sie einen Kollegen bitten, das morgige Meeting um eine Stunde zu verschieben. Bedanken Sie sich und lassen Sie dem Kollegen Raum zu sagen, dass die vorgeschlagene Zeit nicht passt.',
    },
    fr: {
      comprehension: 'Le projet Orion a réussi 3 vérifications le 14 septembre. L\'état du déploiement reste inconnu. Répondez en français : combien de vérifications ont réussi, à quelle date, et qu\'est-ce qui reste inconnu ?',
      writing: 'Rédigez une mise à jour de statut professionnelle en français en deux ou trois phrases : 27 tests réussis ; le déploiement n\'est pas encore vérifié ; la prochaine étape est un smoke check. N\'ajoutez aucun fait nouveau.',
      instruction_following: 'Répondez en français avec exactement trois actions numérotées. Chaque action doit contenir Responsable, Échéance et Terminé quand. Utilisez Maya comme responsable et vendredi comme échéance.',
      translation_localization: 'Traduisez en français naturel et professionnel en conservant chaque fait : "The review is on 12 September at 14:30. Bring the risk memo."',
      cultural_pragmatics: 'Rédigez un message professionnel et courtois en français demandant à un collègue de décaler d’une heure la réunion de demain. Remerciez-le et laissez-lui la possibilité de dire que l’horaire proposé ne lui convient pas.',
    },
    it: {
      comprehension: 'Il progetto Orion ha superato 3 controlli il 14 settembre. Lo stato del deploy resta sconosciuto. Rispondi in italiano: quanti controlli sono stati superati, in quale data e cosa resta sconosciuto?',
      writing: 'Scrivi un aggiornamento di stato professionale in italiano in due o tre frasi: 27 test superati; il deploy non è ancora verificato; il prossimo passo è uno smoke check. Non aggiungere fatti nuovi.',
      instruction_following: 'Rispondi in italiano con esattamente tre azioni numerate. Ogni azione deve contenere Responsabile, Scadenza e Completato quando. Usa Maya come responsabile e venerdì come scadenza.',
      translation_localization: 'Traduci in un italiano naturale e professionale conservando ogni fatto: "The review is on 12 September at 14:30. Bring the risk memo."',
      cultural_pragmatics: 'Scrivi un messaggio professionale e cortese in italiano per chiedere a un collega di spostare di un’ora la riunione di domani. Includi un ringraziamento e lascia al collega la possibilità di dire che l’orario proposto non va bene.',
    },
    ja: {
      comprehension: 'プロジェクト Orion は9月14日に3件のチェックに合格しました。デプロイの状態は依然として不明です。日本語で答えてください：合格したチェックは何件で、日付はいつで、何が不明のままですか？',
      writing: '日本語で2〜3文のプロフェッショナルな状況報告を書いてください：27件のテストに合格。デプロイはまだ検証されていない。次のステップはスモークチェック。新しい事実は追加しないでください。',
      instruction_following: '日本語で、番号付きのアクションをちょうど3つ挙げて回答してください。各アクションには担当者、期限、完了条件を含める必要があります。担当者はMaya、期限は金曜日としてください。',
      translation_localization: 'すべての事実を保ったまま、自然でプロフェッショナルな日本語に翻訳してください："The review is on 12 September at 14:30. Bring the risk memo."',
      cultural_pragmatics: '明日の会議を1時間ずらしてもらうよう同僚に依頼する、丁寧でプロフェッショナルな日本語のメッセージを書いてください。感謝の言葉を含め、提案した時間が都合に合わない場合に同僚がそう言える余地を残してください。',
    },
    ko: {
      comprehension: '프로젝트 Orion은 9월 14일에 3개의 검사를 통과했습니다. 배포 상태는 여전히 알 수 없습니다. 한국어로 답하세요: 몇 개의 검사가 통과했고, 날짜는 언제이며, 무엇이 아직 알려지지 않았습니까?',
      writing: '한국어로 두세 문장의 전문적인 상태 업데이트를 작성하세요: 27개 테스트 통과, 배포는 아직 검증되지 않음, 다음 단계는 스모크 점검. 새로운 사실은 추가하지 마세요.',
      instruction_following: '한국어로 번호가 매겨진 실행 항목을 정확히 세 개 작성하여 답변하세요. 각 항목에는 담당자, 기한, 완료 기준이 포함되어야 합니다. 담당자는 Maya, 기한은 금요일로 하세요.',
      translation_localization: '모든 사실을 유지하면서 자연스럽고 전문적인 한국어로 번역하세요: "The review is on 12 September at 14:30. Bring the risk memo."',
      cultural_pragmatics: '동료에게 내일 회의를 한 시간 옮겨 달라고 요청하는 정중하고 전문적인 한국어 메시지를 작성하세요. 감사 인사를 포함하고, 제안한 시간이 맞지 않으면 동료가 말할 수 있는 여지를 남기세요.',
    },
    ar: {
      comprehension: 'اجتاز مشروع Orion 3 فحوصات في 14 سبتمبر. لا تزال حالة النشر غير معروفة. أجب بالعربية: كم عدد الفحوصات التي اجتيزت، وفي أي تاريخ، وما الذي لا يزال غير معروف؟',
      writing: 'اكتب تحديثًا مهنيًا للحالة باللغة العربية في جملتين أو ثلاث: نجح 27 اختبارًا؛ لم يتم التحقق من النشر بعد؛ الخطوة التالية هي فحص أولي (smoke check). لا تُضف أي حقائق جديدة.',
      instruction_following: 'أجب باللغة العربية بثلاثة إجراءات مرقمة بالضبط. يجب أن يتضمن كل إجراء المسؤول والموعد النهائي ومعيار الإنجاز. استخدم Maya مسؤولةً ويوم الجمعة موعدًا نهائيًا.',
      translation_localization: 'ترجم إلى عربية مهنية طبيعية مع الحفاظ على كل الحقائق: "The review is on 12 September at 14:30. Bring the risk memo."',
      cultural_pragmatics: 'اكتب رسالة مهنية مهذبة باللغة العربية تطلب فيها من زميل تأجيل اجتماع الغد ساعة واحدة. أضف عبارة شكر واترك للزميل مجالًا ليقول إن الموعد المقترح لا يناسبه.',
    },
  } as const

  const terms = LANGUAGE_EXAM_TERMS[language]
  const common: CosUniversityExamRubric = {
    requiredGroups: [],
    targetLanguage: language,
    maxWords: dimension === 'instruction_following' ? 180 : 150,
  }

  if (dimension === 'comprehension') {
    return finishExam({ ...base, prompt: localized[language].comprehension, rubric: {
      ...common,
      requiredGroups: [terms.orion, terms.three, terms.fourteen, terms.unknown],
    } })
  }
  if (dimension === 'writing') {
    return finishExam({ ...base, prompt: localized[language].writing, rubric: {
      ...common,
      requiredGroups: [['27'], terms.deployment, terms.smoke],
      forbiddenTerms: language === 'en' ? ['deployment succeeded', 'deployment failed'] : undefined,
    } })
  }
  if (dimension === 'instruction_following') {
    return finishExam({ ...base, prompt: localized[language].instruction_following, rubric: {
      ...common,
      requiredGroups: [['maya'], terms.friday],
      numberedActions: 3,
    } })
  }
  if (dimension === 'translation_localization') {
    return finishExam({ ...base, prompt: localized[language].translation_localization, rubric: {
      ...common,
      requiredGroups: [terms.twelve, terms.time, terms.risk],
    } })
  }
  return finishExam({ ...base, prompt: localized[language].cultural_pragmatics, rubric: {
    ...common,
    requiredGroups: [terms.please, terms.thanks, terms.meeting],
    forbiddenTerms: ['lol', 'whatever'],
  } })
}

export function buildCosUniversityBlindExam(seed: string, target: CosUniversityExamTarget): CosUniversityBlindExam {
  const cleanSeed = String(seed ?? '').trim()
  if (!/^[0-9a-f-]{16,80}$/i.test(cleanSeed)) throw new Error('A stable server-side exam seed is required.')
  return target.kind === 'subject'
    ? subjectExam(cleanSeed, target.subjectId)
    : languageExam(cleanSeed, target.language, target.dimension)
}

export function scoreCosUniversityBlindExam(
  exam: CosUniversityBlindExam,
  reply: string,
  provenance: CosUniversityExamProvenance,
): CosUniversityExamScore {
  const reasons: string[] = []
  const text = String(reply ?? '')
  const normalized = normalize(text)
  if (!normalized) reasons.push('empty_reply')
  if (provenance.handled !== true) reasons.push('not_handled')
  if (provenance.localReasoning !== true) reasons.push('local_reasoning_not_recorded')
  if (provenance.externalAi === true) reasons.push('external_ai_used')
  if (provenance.semanticCache === true) reasons.push('semantic_cache_used')
  if (!String(provenance.turnId ?? '').trim()) reasons.push('turn_id_missing')

  exam.rubric.requiredGroups.forEach((group, index) => {
    if (!hasAny(text, group)) reasons.push(`required_group_${index + 1}_missing`)
  })
  for (const term of exam.rubric.forbiddenTerms ?? []) {
    if (normalized.includes(normalize(term))) reasons.push(`forbidden:${term}`)
  }
  for (const pattern of exam.rubric.exactPatterns ?? []) {
    if (!new RegExp(pattern, 'i').test(text)) reasons.push(`exact_pattern_missing:${pattern}`)
  }
  for (const number of exam.rubric.exactNumbers ?? []) {
    if (!statesExpectedNumber(text, number.value, number.allowCeilInteger === true)) {
      reasons.push(`exact_number_missing:${number.value}`)
    }
  }
  if (exam.rubric.maxWords && words(text) > exam.rubric.maxWords) {
    // Six consecutive reasoning_decision_science failures were all word_limit_exceeded on the same
    // model that passed language and history in the same window. `reasons` recorded only the code, so
    // there is no way to tell a genuinely long answer from one whose visible answer fits and whose
    // shown working does not. The measured count is carried with the failure; the limit itself is
    // unchanged, and nothing else about scoring moves.
    // The exact tag stays first and unchanged: the public feedback path matches it literally, and a
    // tagged string would silently stop length failures becoming study guidance. The measurement is
    // a separate, additive reason.
    reasons.push('word_limit_exceeded')
    reasons.push(`word_limit_measured:words=${words(text)}:limit=${exam.rubric.maxWords}`)
  }
  if (exam.rubric.numberedActions) {
    const actions = [...text.matchAll(/^\s*(\d+)[.)]\s+/gm)].map(match => Number(match[1]))
    if (actions.length !== exam.rubric.numberedActions || actions.some((value, index) => value !== index + 1)) {
      reasons.push('numbered_action_structure_failed')
    }
  }
  if (exam.rubric.targetLanguage && !languageMarker(exam.rubric.targetLanguage).test(text)) {
    reasons.push(`target_language_not_demonstrated:${exam.rubric.targetLanguage}`)
  }
  return { passed: reasons.length === 0, reasons }
}

function freshIndependent(row: CosUniversityExamAssessmentRow, nowMs: number): boolean {
  const observed = Date.parse(String(row.observed_at || ''))
  const validUntil = Date.parse(String(row.valid_until || ''))
  return row.assessment_kind === 'unseen_subject_exam'
    && row.passed === true
    && row.independent_scorer === true
    && row.scorer_authority === 'host_private_exam'
    && Number.isFinite(observed)
    && Number.isFinite(validUntil)
    && observed < validUntil
    && validUntil > nowMs
}

function rotatedLowest<T>(items: Array<{ value: T; count: number; key: string }>, day: number): T {
  const minimum = Math.min(...items.map(item => item.count))
  const tied = items.filter(item => item.count === minimum).sort((a, b) => a.key.localeCompare(b.key))
  return tied[Math.abs(day) % tied.length].value
}

/**
 * Pick one subject and one language-dimension target from fresh independent evidence counts.
 * This keeps language work from being starved by the larger subject catalog and keeps failures in
 * rotation until they accumulate repeated independent passes.
 */
export function selectCosUniversityExamTargets(
  rows: CosUniversityExamAssessmentRow[],
  now = new Date(),
): [CosUniversityExamTarget, CosUniversityExamTarget] {
  const nowMs = now.getTime()
  const valid = rows.filter(row => freshIndependent(row, nowMs))
  const day = Math.floor(nowMs / 86_400_000)

  const subjectItems = COS_UNIVERSITY_SUBJECTS.map(subject => ({
    value: { kind: 'subject' as const, subjectId: subject.id },
    count: valid.filter(row => row.subject_id === subject.id).length,
    key: subject.id,
  }))

  const languageItems = COS_PLATFORM_LANGUAGES.flatMap(language => LANGUAGE_DIMENSIONS.map(dimension => ({
    value: { kind: 'language' as const, language: language.id, dimension },
    count: valid.filter(row => row.language_code === language.id && row.language_dimension === dimension).length,
    key: `${language.id}:${dimension}`,
  })))

  return [rotatedLowest(subjectItems, day), rotatedLowest(languageItems, day + 11)]
}

export function universityExamValidityDays(target: CosUniversityExamTarget): number {
  if (target.kind === 'language') return 120
  if (target.subjectId === 'mathematics' || target.subjectId === 'history_culture_philosophy_religion') return 365
  if (target.subjectId === 'physics_natural_sciences' || target.subjectId === 'quantum_computing' || target.subjectId === 'statistics_data_science' || target.subjectId === 'social_behavioral_sciences' || target.subjectId === 'reasoning_decision_science') return 180
  if (target.subjectId === 'business_operations' || target.subjectId === 'economics_finance' || target.subjectId === 'language_communication') return 120
  return 90
}

export function universityExamValidUntil(target: CosUniversityExamTarget, observedAt: Date): string {
  return new Date(observedAt.getTime() + universityExamValidityDays(target) * 86_400_000).toISOString()
}
