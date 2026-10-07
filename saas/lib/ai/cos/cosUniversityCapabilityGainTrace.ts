// saas/lib/ai/cos/cosUniversityCapabilityGainTrace.ts
//
// Read-only capability-gain trace. Owner 2026-10-06, Step 1 order of work: after evaluation infrastructure, training
// gain. The Step 1 report gives one number for the whole cohort (7 days: mean holdout gain -0.011, 166 improved vs 179
// regressed). One number cannot say WHICH recipes help and which hurt, and it does not say whether the difference from
// zero is real or noise.
//
// For every artifact whose latest independent evaluation falls in the window, gain = trained_artifact_score -
// baseline_score on the exact-artifact holdout (the same definition as the funnel's capabilityGain). Gains are grouped
// by what produced the artifact:
//   subject, teacher model, base model, training profile, optimizer, training items, recipe flags (failure-derived
//   replay, frontier response anchor, general-reasoning ballast), real-source share of the curriculum batch
//   (distillation_source_attribution_recorded), evaluator version.
// Per group: n, mean gain with its standard error, improved / unchanged / regressed, all-four-gates pass count. Overall:
// a sign test (improved vs regressed) so "regressed" is only claimed when it is distinguishable from chance.
//
// Counts and scores only: no candidate ids, prompts, answers or teacher text leave this module.

export const CAPABILITY_GAIN_TRACE_SCHEMA_VERSION = 'cos-university-capability-gain-trace-v1' as const
export const CAPABILITY_GAIN_TRACE_DAYS = 7
const PAGE = 1000
const ID_CHUNK = 100
const ROW_LIMIT = 20000
const ATTRIBUTION_CLAIM = 'distillation_source_attribution_recorded'

type Db = { from: (table: string) => any }

const text = (value: unknown, max = 200): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const num = (value: unknown): number | null =>
  value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value)

export type EvaluationRow = Readonly<{
  candidate_id: unknown
  trained_artifact_hash: unknown
  created_at: unknown
  baseline_score: unknown
  trained_artifact_score: unknown
  holdout_improved?: unknown
  safety_passed?: unknown
  unseen_transfer_passed?: unknown
  delayed_retention_passed?: unknown
  evaluator_version?: unknown
  holdout_case_count?: unknown
}>

export type ArtifactRow = Readonly<{
  candidate_id: unknown
  trained_artifact_hash: unknown
  subject_id?: unknown
  teacher?: unknown
  base?: unknown
  profile?: unknown
  optimizer?: unknown
  items?: unknown
  replay?: unknown
  replayEligible?: unknown
  replayArm?: unknown
  anchor?: unknown
  ballast?: unknown
}>

export type AttributionRow = Readonly<{ artifact_hash: unknown; real?: unknown }>

export type GainGroup = Readonly<{
  key: string
  n: number
  meanGain: number
  standardError: number | null
  improved: number
  unchanged: number
  regressed: number
  passedAllGates: number
}>

export type CapabilityGainTrace = Readonly<{
  schemaVersion: typeof CAPABILITY_GAIN_TRACE_SCHEMA_VERSION
  generatedAt: string
  since: string
  overall: GainGroup
  /** Sign test on improved vs regressed (unchanged excluded). |z| < 2 means the split is indistinguishable from chance. */
  signTestZ: number | null
  holdoutCases: Readonly<Record<string, number>>
  dimensions: Readonly<Record<string, readonly GainGroup[]>>
  unmatchedArtifacts: number
  readOnly: true
}>

const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places

function group(key: string, members: readonly { gain: number; passedAll: boolean }[]): GainGroup {
  const n = members.length
  const mean = n ? members.reduce((sum, m) => sum + m.gain, 0) / n : 0
  const variance = n > 1 ? members.reduce((sum, m) => sum + (m.gain - mean) ** 2, 0) / (n - 1) : null
  return Object.freeze({
    key,
    n,
    meanGain: round(mean),
    standardError: variance === null ? null : round(Math.sqrt(variance / n)),
    improved: members.filter(m => m.gain > 0).length,
    unchanged: members.filter(m => m.gain === 0).length,
    regressed: members.filter(m => m.gain < 0).length,
    passedAllGates: members.filter(m => m.passedAll).length,
  })
}

export function itemsBucket(value: unknown): string {
  const n = num(value)
  if (n === null) return 'unknown'
  if (n < 50) return '<50'
  if (n < 100) return '50-99'
  if (n < 200) return '100-199'
  if (n < 400) return '200-399'
  return '400+'
}

export function realShareBucket(value: unknown): string {
  const n = num(value)
  if (n === null) return 'unknown'
  if (n === 0) return '0%'
  if (n < 50) return '1-49%'
  if (n < 100) return '50-99%'
  return '100%'
}

const flag = (value: unknown): string => {
  const raw = text(value, 10).toLowerCase()
  return raw === 'true' ? 'yes' : raw === 'false' ? 'no' : 'unknown'
}

// subjectXfailureReplay compares replay against no replay WITHIN each subject, so a subject-mix difference (replay is
// used for remediation of harder subjects) cannot pass for a recipe effect.
// failureReplayArm is the controlled comparison (worker FAILURE_DERIVED_REPLAY_ROLLOUT_PERCENT, 2026-10-07): among runs with
// failure-derived rows, a hash of the candidate id decides replay or control, so replay vs control is not confounded by which
// lineages needed remediation. Runs trained before the A/B carry no eligibility receipt and read `unrecorded`.
const replayArm = (eligible: unknown, selected: unknown): string => {
  const items = num(eligible)
  if (items === null) return 'unrecorded'
  if (items <= 0) return 'not_eligible'
  const arm = flag(selected)
  return arm === 'yes' ? 'replay' : arm === 'no' ? 'control' : 'unrecorded'
}
const DIMENSIONS = ['subject', 'teacher', 'baseModel', 'profile', 'optimizer', 'trainingItems', 'realSourceShare', 'failureReplay', 'failureReplayArm', 'frontierAnchor', 'reasoningBallast', 'evaluatorVersion', 'subjectXfailureReplay'] as const

export function composeCapabilityGainTrace(input: {
  evaluations: readonly EvaluationRow[]
  artifacts: readonly ArtifactRow[]
  attributions: readonly AttributionRow[]
  now: Date
  since: string
}): CapabilityGainTrace {
  // Latest evaluation per exact artifact (candidate + hash), like the funnel.
  const latest = new Map<string, EvaluationRow>()
  for (const row of input.evaluations) {
    const key = `${text(row.candidate_id, 240)}:${text(row.trained_artifact_hash, 64).toLowerCase()}`
    const previous = latest.get(key)
    if (!previous || String(row.created_at ?? '') > String(previous.created_at ?? '')) latest.set(key, row)
  }
  const artifactByKey = new Map<string, ArtifactRow>()
  for (const row of input.artifacts) artifactByKey.set(`${text(row.candidate_id, 240)}:${text(row.trained_artifact_hash, 64).toLowerCase()}`, row)
  const realByHash = new Map<string, unknown>()
  for (const row of input.attributions) realByHash.set(text(row.artifact_hash, 64).toLowerCase(), row.real)

  const buckets: Record<string, Map<string, { gain: number; passedAll: boolean }[]>> = {}
  for (const dimension of DIMENSIONS) buckets[dimension] = new Map()
  const all: { gain: number; passedAll: boolean }[] = []
  const holdoutCases: Record<string, number> = {}
  let unmatched = 0
  for (const [key, row] of latest) {
    const baseline = num(row.baseline_score)
    const trained = num(row.trained_artifact_score)
    if (baseline === null || trained === null) continue
    const member = {
      gain: trained - baseline,
      passedAll: row.holdout_improved === true && row.safety_passed === true && row.unseen_transfer_passed === true && row.delayed_retention_passed === true,
    }
    all.push(member)
    const cases = num(row.holdout_case_count)
    const casesKey = cases === null ? 'unknown' : String(cases)
    holdoutCases[casesKey] = (holdoutCases[casesKey] || 0) + 1
    const artifact = artifactByKey.get(key)
    if (!artifact) unmatched += 1
    const hash = key.split(':').pop() || ''
    const values: Record<(typeof DIMENSIONS)[number], string> = {
      subject: text(artifact?.subject_id, 80) || 'unknown',
      teacher: text(artifact?.teacher, 120) || 'unknown',
      baseModel: text(artifact?.base, 120) || 'unknown',
      profile: text(artifact?.profile, 120) || 'unknown',
      optimizer: text(artifact?.optimizer, 60) || 'unknown',
      trainingItems: itemsBucket(artifact?.items),
      realSourceShare: realShareBucket(realByHash.get(hash)),
      failureReplay: flag(artifact?.replay),
      failureReplayArm: replayArm(artifact?.replayEligible, artifact?.replayArm),
      frontierAnchor: flag(artifact?.anchor),
      reasoningBallast: num(artifact?.ballast) === null ? 'unknown' : (num(artifact?.ballast)! > 0 ? 'yes' : 'no'),
      evaluatorVersion: text(row.evaluator_version, 80) || 'unknown',
      subjectXfailureReplay: `${text(artifact?.subject_id, 80) || 'unknown'} | replay=${flag(artifact?.replay)}`,
    }
    for (const dimension of DIMENSIONS) {
      const list = buckets[dimension].get(values[dimension]) || []
      list.push(member)
      buckets[dimension].set(values[dimension], list)
    }
  }

  const overall = group('all', all)
  const decided = overall.improved + overall.regressed
  const dimensions: Record<string, readonly GainGroup[]> = {}
  for (const dimension of DIMENSIONS) {
    dimensions[dimension] = Object.freeze([...buckets[dimension].entries()]
      .map(([key, members]) => group(key, members))
      .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key)))
  }
  return Object.freeze({
    schemaVersion: CAPABILITY_GAIN_TRACE_SCHEMA_VERSION,
    generatedAt: input.now.toISOString(),
    since: input.since,
    overall,
    signTestZ: decided ? round((overall.improved - overall.regressed) / Math.sqrt(decided), 2) : null,
    holdoutCases: Object.freeze(holdoutCases),
    dimensions: Object.freeze(dimensions),
    unmatchedArtifacts: unmatched,
    readOnly: true as const,
  })
}

async function rows(query: any): Promise<any[]> {
  const result = await query
  if (result?.error) throw result.error
  return Array.isArray(result?.data) ? result.data : []
}

export async function readCapabilityGainTrace(input: { db: Db; now?: Date; days?: number }): Promise<CapabilityGainTrace> {
  const now = input.now ?? new Date()
  const since = new Date(now.getTime() - (input.days ?? CAPABILITY_GAIN_TRACE_DAYS) * 86_400_000).toISOString()
  const evaluations: any[] = []
  for (let from = 0; from < ROW_LIMIT; from += PAGE) {
    const page = await rows(input.db.from('cos_university_distilled_evaluation_runs')
      .select('candidate_id,trained_artifact_hash,created_at,baseline_score,trained_artifact_score,holdout_improved,safety_passed,unseen_transfer_passed,delayed_retention_passed,evaluator_version,holdout_case_count')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1))
    evaluations.push(...page)
    if (page.length < PAGE) break
  }
  const candidates = [...new Set(evaluations.map((row: any) => text(row.candidate_id, 240)).filter(Boolean))]
  const artifacts: any[] = []
  const attributions: any[] = []
  for (let i = 0; i < candidates.length; i += ID_CHUNK) {
    const chunk = candidates.slice(i, i + ID_CHUNK)
    artifacts.push(...await rows(input.db.from('cos_local_distillation_artifacts')
      .select([
        'candidate_id', 'trained_artifact_hash', 'subject_id',
        'teacher:intended_use->>teacherModel',
        'base:intended_use->>canonicalBaseModel',
        'profile:intended_use->trainingReceipt->>profile',
        'optimizer:intended_use->trainingReceipt->>optimizer',
        'items:intended_use->trainingReceipt->>trainingItems',
        'replay:intended_use->trainingReceipt->>failureDerivedReplayRequired',
        'replayEligible:intended_use->trainingReceipt->>failureDerivedReplayEligibleItems',
        'replayArm:intended_use->trainingReceipt->>failureDerivedReplayRolloutSelected',
        'anchor:intended_use->trainingReceipt->>frontierResponseAnchorRequired',
        'ballast:intended_use->trainingReceipt->>generalReasoningBallastItems',
      ].join(','))
      .in('candidate_id', chunk)
      .limit(PAGE)))
    attributions.push(...await rows(input.db.from('cos_university_learning_assurance_events')
      .select('artifact_hash:evidence->>artifactHash,real:evidence->sourceMix->percentages->>real_source')
      .eq('evidence->>claim', ATTRIBUTION_CLAIM)
      .in('candidate_id', chunk)
      .limit(PAGE)))
  }
  return composeCapabilityGainTrace({ evaluations, artifacts, attributions, now, since })
}

/** A block a human reads in a CI log or check run. */
export function describeCapabilityGainTrace(trace: CapabilityGainTrace, perDimension = 8): string {
  const g = (x: GainGroup) => `n=${x.n} mean=${x.meanGain}${x.standardError === null ? '' : `±${x.standardError}`} +${x.improved}/=${x.unchanged}/-${x.regressed} passedAll=${x.passedAllGates}`
  const o = trace.overall
  const z = trace.signTestZ
  const verdict = z === null ? 'no decided artifacts'
    : Math.abs(z) < 2 ? 'improved vs regressed is indistinguishable from chance (|z| < 2)'
      : z > 0 ? 'more improve than regress beyond chance' : 'more regress than improve beyond chance'
  const lines = [
    `CAPABILITY GAIN since ${trace.since.slice(0, 16)}Z (latest exam per exact artifact; gain = trained - baseline on holdout)`,
    `  overall: ${g(o)} | sign test z=${z ?? 'n/a'}: ${verdict}`,
    `  holdout cases per exam: ${Object.entries(trace.holdoutCases).map(([k, v]) => `${k}=${v}`).join(' ') || 'none'} | artifacts without a recipe row: ${trace.unmatchedArtifacts}`,
  ]
  for (const [dimension, groups] of Object.entries(trace.dimensions)) {
    lines.push(`  by ${dimension}:`)
    const limit = dimension === 'subjectXfailureReplay' ? 40 : perDimension
    const shown = dimension === 'subjectXfailureReplay' ? [...groups].sort((a, b) => a.key.localeCompare(b.key)) : groups
    for (const entry of shown.slice(0, limit)) lines.push(`    ${entry.key} | ${g(entry)}`)
    if (groups.length > limit) lines.push(`    ... ${groups.length - limit} more`)
  }
  return lines.join('\n')
}
// end of saas/lib/ai/cos/cosUniversityCapabilityGainTrace.ts (if this line is missing, the paste was cut short)
