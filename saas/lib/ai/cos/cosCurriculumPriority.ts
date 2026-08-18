// saas/lib/ai/cos/cosCurriculumPriority.ts
//
// Autonomous curriculum: decide WHAT COS should learn next from its own measured weakness.
//
// Before this module, learning targets came only from corpus shape (dynamicGaps.ts ranks the
// thinnest/stalest subjects first). That makes COS study what it has least data about rather than
// what it is worst at. The per-problem-class evidence needed to fix that already exists in
// computeCosIndependenceMetrics(): attempts, independent acceptance, external-teacher dependency,
// negative feedback, user corrections, and verified production failures — all keyed by the same
// bounded problem-class taxonomy used everywhere else in the learning loop.
//
// This module is deterministic and model-free. It converts those measurements into standard
// KnowledgeGapSignal rows and lets the existing governed pipeline (generateKnowledgeGaps ->
// ContinuousLearningDirector.prioritizeGaps) do the rest. It promotes nothing, writes nothing,
// and changes no confidence. It only reorders what gets studied.
//
// Deliberately NOT included as inputs: model/council opinions about what COS is bad at (unverified),
// and raw prompt text (unbounded). Only counted evidence classes drive the curriculum.

// Only TYPE imports at module scope. The database-backed report is imported lazily inside
// loadCosCurriculumSignals so the ranking logic above stays a pure, directly testable unit.
import type { KnowledgeGapSignal } from '@/lib/cos-core/layers/learning/gaps'
import type { CosIndependenceMetrics } from '@/lib/ai/cos/cognitiveIndependenceMetrics'

/**
 * Subjects that are real taxonomy buckets but useless as study targets: a research question about
 * "unclassified" or "general reasoning" cannot produce focused evidence. Their weakness still shows
 * in the independence report; it just is not actionable as a curriculum item.
 */
// 'general reasoning' is the value of UNCLASSIFIED_PROBLEM_CLASS in cosProblemClass.ts. It is
// inlined rather than imported because that module pulls in host-aliased dependencies, which would
// make this ranking logic unloadable in a plain node test run.
const NON_STUDYABLE_SUBJECTS = new Set([
  'general reasoning',
  'unclassified',
])

const DEFAULT_MIN_ATTEMPTS = 3
const DEFAULT_LIMIT = 8
const MAX_LIMIT = 25

export type CosCurriculumPriority = {
  subject: string
  attempts: number
  independentAccepted: number
  independenceRate: number | null
  externalRequired: number
  teacherInteractions: number
  negativeFeedback: number
  userCorrections: number
  productionOutcomes: number
  productionFailures: number
  /** Bounded 0..1 ranking pressure. Higher means COS is measurably worse here on real work. */
  pressure: number
  reasons: string[]
}

export type CosCurriculumOptions = {
  /** Ignore thin classes below this many observed attempts, unless production actually failed. */
  minAttempts?: number
  /** Maximum curriculum items emitted per cycle. */
  limit?: number
  /** Independence rate below which a class is considered weak even with no explicit failures. */
  targetIndependentPassRate?: number
}

function boundedCount(value: unknown): number {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'subject'
}

/**
 * Diminishing-returns weight for a raw count. One failure matters a lot more than the tenth,
 * so a single loud class cannot monopolise the whole curriculum.
 */
function saturate(count: number, halfPoint: number): number {
  const safe = Math.max(0, count)
  const half = Math.max(1, halfPoint)
  return safe / (safe + half)
}

/**
 * Rank one problem class by measured weakness on real work.
 *
 * Weights encode the evidence hierarchy the rest of the learning loop already uses: a verified
 * production failure is the strongest signal, an explicit user correction is next, external-teacher
 * dependency next, and a merely low independence rate is the weakest. Volume (attempts and real
 * production outcomes) acts as the business-importance term — a class COS is asked to handle often
 * is worth more than an equally weak class that almost never comes up.
 */
export function computeCurriculumPriorities(
  metrics: CosIndependenceMetrics,
  options: CosCurriculumOptions = {},
): CosCurriculumPriority[] {
  const minAttempts = Math.max(1, boundedCount(options.minAttempts ?? DEFAULT_MIN_ATTEMPTS))
  const target = clamp01(
    Number.isFinite(options.targetIndependentPassRate as number)
      ? Number(options.targetIndependentPassRate)
      : Number(metrics?.targetIndependentPassRate ?? 0.85),
  ) || 0.85

  const subjects = metrics?.subjects && typeof metrics.subjects === 'object' ? metrics.subjects : {}
  const priorities: CosCurriculumPriority[] = []

  for (const [rawSubject, rawStats] of Object.entries(subjects)) {
    const subject = String(rawSubject ?? '').replace(/\s+/g, ' ').trim().slice(0, 180)
    if (!subject || NON_STUDYABLE_SUBJECTS.has(subject.toLowerCase())) continue

    const attempts = boundedCount(rawStats?.attempts)
    const independentAccepted = boundedCount(rawStats?.independentAccepted)
    const externalRequired = boundedCount(rawStats?.externalRequired)
    const teacherInteractions = boundedCount(rawStats?.teacherInteractions)
    const negativeFeedback = boundedCount(rawStats?.negativeFeedback)
    const userCorrections = boundedCount(rawStats?.userCorrections)
    const productionOutcomes = boundedCount(rawStats?.productionOutcomes)
    const productionFailures = boundedCount(rawStats?.productionFailures)

    const independenceRate = attempts > 0 ? clamp01(independentAccepted / attempts) : null
    const weakIndependence = independenceRate !== null && independenceRate < target

    const hasHardEvidence = productionFailures > 0 || userCorrections > 0 || negativeFeedback > 0
    const hasDependency = externalRequired > 0 || teacherInteractions > 0
    if (!hasHardEvidence && !hasDependency && !weakIndependence) continue

    // Thin classes are noise, but a real production failure is worth studying even once.
    if (attempts < minAttempts && productionFailures === 0) continue

    const reasons: string[] = []
    if (productionFailures > 0) reasons.push(`verified_production_failures=${productionFailures}`)
    if (userCorrections > 0) reasons.push(`user_corrections=${userCorrections}`)
    if (negativeFeedback > 0) reasons.push(`negative_feedback=${negativeFeedback}`)
    if (teacherInteractions > 0) reasons.push(`external_teacher_interactions=${teacherInteractions}`)
    if (externalRequired > 0) reasons.push(`external_required_turns=${externalRequired}`)
    if (independenceRate !== null) {
      reasons.push(`independent_acceptance=${independentAccepted}/${attempts} (target ${target.toFixed(2)})`)
    }
    if (productionOutcomes > 0) reasons.push(`verified_production_outcomes=${productionOutcomes}`)

    const weakness =
      0.34 * saturate(productionFailures, 1) +
      0.22 * saturate(userCorrections, 2) +
      0.16 * saturate(negativeFeedback, 3) +
      0.18 * saturate(externalRequired + teacherInteractions, 4) +
      0.10 * (weakIndependence && independenceRate !== null ? clamp01((target - independenceRate) / target) : 0)

    // Business importance: how much real work actually flows through this class.
    const importance = 0.5 * saturate(attempts, 10) + 0.5 * saturate(productionOutcomes, 5)
    const pressure = clamp01(weakness * (0.7 + 0.3 * importance))

    priorities.push({
      subject,
      attempts,
      independentAccepted,
      independenceRate,
      externalRequired,
      teacherInteractions,
      negativeFeedback,
      userCorrections,
      productionOutcomes,
      productionFailures,
      pressure,
      reasons,
    })
  }

  return priorities.sort((a, b) => b.pressure - a.pressure || a.subject.localeCompare(b.subject))
}

/**
 * Express measured weakness in the vocabulary the existing gap pipeline already consumes.
 *
 * `confidence` carries the observed independence rate, `escalated` marks external-teacher
 * dependency, and `succeeded: false` marks verified failure or explicit user correction — so
 * generateKnowledgeGaps() derives urgency from real evidence rather than a score invented here.
 */
export function curriculumSignalsFromIndependence(
  metrics: CosIndependenceMetrics,
  options: CosCurriculumOptions = {},
): KnowledgeGapSignal[] {
  const limit = Math.max(1, Math.min(MAX_LIMIT, boundedCount(options.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT))

  return computeCurriculumPriorities(metrics, options)
    .slice(0, limit)
    .map(priority => ({
      taskId: `curriculum:${slug(priority.subject)}`,
      subject: priority.subject,
      capability: 'independent_problem_class',
      objective: `"${priority.subject}" problems without external teacher escalation`,
      confidence: priority.independenceRate ?? 0,
      escalated: priority.externalRequired > 0 || priority.teacherInteractions > 0,
      succeeded: priority.productionFailures > 0 || priority.userCorrections > 0 ? false : undefined,
      repeatedCount: Math.max(1, priority.attempts),
      evidence: [
        'curriculum_source=measured_independence_metrics',
        `pressure=${priority.pressure.toFixed(3)}`,
        ...priority.reasons,
      ],
      portableIds: ['cos'],
    }))
}

/**
 * Read the bounded independence report and return this cycle's failure-driven curriculum.
 * Never throws into the learning cycle: a curriculum read failure must not stop learning entirely,
 * it only means this cycle falls back to corpus-shape gaps.
 */
export async function loadCosCurriculumSignals(
  options: CosCurriculumOptions & { windowDays?: number; rowLimit?: number } = {},
): Promise<KnowledgeGapSignal[]> {
  try {
    const { getCosIndependenceReport } = await import('@/lib/ai/cos/cognitiveIndependenceReport')
    const report = await getCosIndependenceReport({
      windowDays: options.windowDays,
      rowLimit: options.rowLimit,
    })
    return curriculumSignalsFromIndependence(report.metrics, options)
  } catch (error) {
    console.warn(
      '[cos-curriculum-unavailable]',
      error instanceof Error ? error.message : String(error),
    )
    return []
  }
}


export type CosCurriculumTrack = { id:'cyber_defense'|'software_engineering'|'agent_systems'|'ml_data_engineering'|'ai_systems_safety'|'cognitive_science'|'robotics_edge_ai'|'space_science'|'applied_physics'; title:string; topics:string[]; evaluation:string[]; safetyBoundary:string }
/** Versioned focus tracks; gaps determine what is studied, this manifest determines how it is evaluated. */
export const COS_CORE_CURRICULUM_TRACKS:ReadonlyArray<CosCurriculumTrack>=[
 {id:'cyber_defense',title:'Cyber defense',topics:['secure coding','vulnerability analysis','incident triage','logs and network/cloud security','defensive remediation'],evaluation:['authorized read-only analysis','isolated lab exercise','evidence-backed remediation plan'],safetyBoundary:'Authorized defensive sources and isolated labs only; no uncontrolled production testing or offensive execution.'},
 {id:'software_engineering',title:'Coding and computer science',topics:['software design','TypeScript and Next.js','databases','testing and debugging','distributed systems','APIs'],evaluation:['reproducible test','code review against specification','holdout debugging task'],safetyBoundary:'Changes remain reviewable and require approval before production deployment.'},
 {id:'ml_data_engineering',title:'ML and data engineering',topics:['dataset lineage and quality','deduplication and labeling','bias checks','embeddings and retrieval evaluation','model selection','fine-tuning and inference evaluation'],evaluation:['reproducible dataset-quality check','retrieval holdout evaluation','bounded model experiment'],safetyBoundary:'No frontier-model training claims; datasets require provenance, scope controls, and privacy review.'},
 {id:'ai_systems_safety',title:'AI systems and safety',topics:['GPU and inference operations','networking and capacity','observability and cost control','recovery','alignment','human approval and domain evidence'],evaluation:['capacity or incident simulation','observability review','policy-gated action simulation'],safetyBoundary:'No physical hardware validation; consequential infrastructure changes require approval and rollback evidence.'},
 {id:'space_science',title:'Space science, physics, and scientific computing',topics:['mechanics gravity energy and optics','astronomy astrophysics and planetary science','space chemistry and geology','calculus linear algebra differential equations and statistics','simulation and uncertainty analysis'],evaluation:['public-dataset analysis','reproducible simulation','assumption and uncertainty review'],safetyBoundary:'Public or authorized datasets and simulations only. No real spacecraft or mission control, navigation command authority, or safety-critical operational decisions.'},
 {id:'applied_physics',title:'Applied physics and advanced engineering',topics:['semiconductors nanotechnology and materials','optics photonics and sensing','quantum engineering concepts','renewable energy and storage','medical-physics research fundamentals'],evaluation:['research synthesis','simulation or design analysis','qualified-review checklist'],safetyBoundary:'Research and simulation only. No medical diagnosis or treatment planning, device certification, fabrication claims, laboratory control, or safety-critical deployment without qualified validation.'},
 {id:'robotics_edge_ai',title:'Robotics, edge AI, and aerial sensing',topics:['edge inference and latency budgets','sensor fusion','LiDAR thermal and multispectral interpretation','digital twins and recorded sensor datasets','multi-agent simulation','BVLOS regulatory and safety planning'],evaluation:['digital-twin simulation','recorded-sensor dataset evaluation','operator-reviewed safety checklist'],safetyBoundary:'Simulation and recorded datasets only. No weaponization, target selection, harmful surveillance, or real-world autonomous drone control; any authorized flight requires operator control, legal review, geofencing, and emergency-stop/return-to-home safeguards.'},
 {id:'cognitive_science',title:'Cognitive science and human decision-making',topics:['learning memory and attention','problem solving and decision biases','human-agent collaboration','ethical behavioral economics','cognitive load accessibility and multilingual communication'],evaluation:['consented task-feedback analysis','explanation clarity evaluation','aggregated outcome experiment'],safetyBoundary:'No mental-state inference, diagnosis, manipulation, or psychological profiling; use only consented task-relevant behavior and aggregated outcomes.'},
 {id:'agent_systems',title:'Agent systems',topics:['perception planning bounded action','RAG and evidence quality','symbolic and BDI reasoning','multi-agent coordination','evaluation and prompt optimization','human collaboration and alignment'],evaluation:['grounded planning task','tool-policy simulation','held-out agent evaluation'],safetyBoundary:'Consequential actions remain approval-governed; provenance and uncertainty must be recorded.'},
]
export function coreCurriculumTrackForSubject(subject:string):CosCurriculumTrack|null{
 const value=String(subject??'').toLowerCase()
 if(/security|cyber|vulnerab|incident|network|threat|defen/.test(value))return COS_CORE_CURRICULUM_TRACKS[0]
 if(/code|software|program|typescript|next|database|api|debug|computer science/.test(value))return COS_CORE_CURRICULUM_TRACKS[1]
 if(/machine learning|ml |dataset|data science|embedding|fine.tun|model evaluation/.test(value))return COS_CORE_CURRICULUM_TRACKS[2]
 if(/gpu|inference|cloud|capacity|observability|alignment|safety|ethic|hardware/.test(value))return COS_CORE_CURRICULUM_TRACKS[3]
 if(/space|astronomy|astrophys|planetary|orbital|gravity|telescope|rocket/.test(value))return COS_CORE_CURRICULUM_TRACKS[4]
 if(/semiconductor|nanotech|photon|laser|quantum|renewable energy|solar cell|medical physics/.test(value))return COS_CORE_CURRICULUM_TRACKS[5]
 if(/robot|drone|edge ai|lidar|thermal|multispectral|sensor fusion|bvlos|aerial/.test(value))return COS_CORE_CURRICULUM_TRACKS[8]
 if(/cognitive|psycholog|behavioral economics|decision bias|attention|memory|human.agent|accessibility|cognitive load/.test(value))return COS_CORE_CURRICULUM_TRACKS[7]
 if(/agent|rag|retrieval|prompt|symbolic|multi-agent|planning/.test(value))return COS_CORE_CURRICULUM_TRACKS[6]
 return null
}
