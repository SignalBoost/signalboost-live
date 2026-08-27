import type { KnowledgeGap } from '../../cos-core/layers/learning/index.ts'
import type { KnowledgeGapSignal } from '../../cos-core/layers/learning/gaps.ts'

/**
 * Bounded operational-systems curriculum.
 *
 * Purpose: steer existing evidence-gated adapters (scientific journals, official docs,
 * high-signal video) toward high-density compute power, telemetry, and control-loop
 * knowledge. This is discovery targeting only.
 *
 * Hard limits:
 * - advisory knowledge only — never facility actuation, BMS writes, or breaker control
 * - small rotating set (default 4) so daily mining quota is not captured
 * - no change to admission, grounding, contradiction, or promotion thresholds
 */
export const OPERATIONAL_SYSTEMS_CURRICULUM_ID = 'ops-systems'

export const OPERATIONAL_SYSTEMS_SAFETY_EVIDENCE =
  'owner-directed operational systems curriculum; advisory only; no facility control; no BMS or breaker actuation'

const MAX_GAPS_PER_RUN = 4

type Focus = {
  id: string
  subject: string
  question: string
  capability: string
  urgency: number
}

const FOCI: readonly Focus[] = [
  {
    id: 'gpu-power-telemetry',
    subject: 'High-density GPU rack power telemetry and transient control',
    capability: 'operational_power_telemetry',
    urgency: 90,
    question:
      'What verified real-time telemetry and control-loop mechanisms exist for detecting a multi-GPU rack or row power transient within hundreds of milliseconds, and which published sources describe the sensors, sampling cadence, and decision path used to stabilize load?',
  },
  {
    id: 'dvfs-power-cap',
    subject: 'Hardware DVFS and GPU power capping under transient load',
    capability: 'operational_dvfs_capping',
    urgency: 89,
    question:
      'What verified hardware-level Dynamic Voltage and Frequency Scaling (DVFS) and power-capping mechanisms exist on datacenter GPUs and modules, including typical actuation latency, thermal-design-power limits, and trade-offs versus job throughput when a short power spike threatens a PDU or breaker trip?',
  },
  {
    id: 'pdu-thermal-breaker',
    subject: 'PDU and thermal-breaker behavior in high-density compute rows',
    capability: 'operational_pdu_protection',
    urgency: 88,
    question:
      'What verified electrical and thermal characteristics of rack PDUs and thermal-magnetic breakers matter when a high-density compute row (around 1 MW class) sees a sudden collective GPU power increase, and what published guidance exists on trip curves, headroom, and sub-second transients?',
  },
  {
    id: 'checkpoint-preemption',
    subject: 'Checkpoint job preemption versus active model-weight safety',
    capability: 'operational_job_preemption',
    urgency: 87,
    question:
      'What verified strategies exist for preempting non-urgent checkpoint or batch GPU jobs to shed load during a power transient without corrupting active model weights, and what are the documented consistency, restart, and time-to-shed trade-offs?',
  },
  {
    id: 'tor-packet-pacing',
    subject: 'Top-of-rack packet pacing versus compute-side power actuation',
    capability: 'operational_network_pacing',
    urgency: 86,
    question:
      'What verified uses of Top-of-Rack (ToR) or NIC packet pacing exist for reducing synchronized GPU collective bursts and therefore power draw, and how do published sources compare that network-side lever with hardware DVFS or job preemption for sub-second stabilization?',
  },
  {
    id: 'cooling-electrical-coupling',
    subject: 'Cooling-loop coupling to electrical transients in GPU rows',
    capability: 'operational_cooling_coupling',
    urgency: 82,
    question:
      'What verified relationships exist between liquid-cooling loop response times and electrical power transients in GPU-dense rows, and which published sources treat cooling as too slow for sub-second power spikes versus useful for the following thermal tail?',
  },
  {
    id: 'hierarchical-power-mgmt',
    subject: 'Hierarchical datacenter power management from site to GPU',
    capability: 'operational_hierarchical_power',
    urgency: 85,
    question:
      'What verified hierarchical power-management designs exist that coordinate site, row, rack, node, and GPU power budgets, including how unused headroom is reallocated and how emergency policies respond without changing the site power envelope?',
  },
  {
    id: 'evidence-boundaries',
    subject: 'Evidence boundaries for incomplete power-telemetry incidents',
    capability: 'operational_evidence_boundaries',
    urgency: 80,
    question:
      'When telemetry is incomplete for a high-density GPU power incident, what verified operator checklists and evidence requirements do published sources recommend next, without instructing any physical actuation?',
  },
] as const

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function dateStamp(now: Date): string {
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`
}

export function operationalSystemsSlot(now = new Date()): number {
  const day = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000)
  return ((day % FOCI.length) + FOCI.length) % FOCI.length
}

export function operationalSystemsKnowledgeGaps(
  now = new Date(),
  limit = MAX_GAPS_PER_RUN,
): KnowledgeGap[] {
  const cap = Math.max(1, Math.min(MAX_GAPS_PER_RUN, Math.floor(limit)))
  const start = operationalSystemsSlot(now)
  const stamp = dateStamp(now)
  const selected: KnowledgeGap[] = []

  for (let offset = 0; offset < cap; offset += 1) {
    const focus = FOCI[(start + offset) % FOCI.length]!
    selected.push({
      id: `${OPERATIONAL_SYSTEMS_CURRICULUM_ID}:${focus.id}:${stamp}:r${pad(start)}`,
      subject: focus.subject,
      question: focus.question,
      portableIds: ['cos'],
      expectedReuse: 20,
      expectedAvoidedCostUsd: 1,
      urgency: focus.urgency,
      evidence: [OPERATIONAL_SYSTEMS_SAFETY_EVIDENCE, `focus=${focus.id}`, `slot=${start}`],
    })
  }

  return selected
}

export function operationalSystemsCurriculumSignals(
  now = new Date(),
  limit = MAX_GAPS_PER_RUN,
): KnowledgeGapSignal[] {
  return operationalSystemsKnowledgeGaps(now, limit).map((gap, index) => {
    const start = operationalSystemsSlot(now)
    const focus = FOCI[(start + index) % FOCI.length]!
    return {
      taskId: gap.id,
      subject: gap.subject,
      capability: focus.capability,
      objective: gap.question,
      confidence: 0.2,
      escalated: true,
      succeeded: false,
      missingFacts: [
        'verified sub-second telemetry and actuation path',
        'documented trade-offs among DVFS, packet pacing, and checkpoint preemption',
        'weight-safety constraints when shedding GPU load',
      ],
      repeatedCount: 1,
      externalCostUsd: 0,
      evidence: gap.evidence,
      portableIds: ['cos'],
    }
  })
}

export function isOperationalSystemsGap(gap: { id?: string; evidence?: string[] }): boolean {
  const id = String(gap.id || '')
  const operationalId = id.startsWith(`${OPERATIONAL_SYSTEMS_CURRICULUM_ID}:`)
    || id.startsWith(`auto-gap:${OPERATIONAL_SYSTEMS_CURRICULUM_ID}:`)
  return operationalId && Array.isArray(gap.evidence) && gap.evidence.includes(OPERATIONAL_SYSTEMS_SAFETY_EVIDENCE)
}

export const OPERATIONAL_SYSTEMS_FOCUS_IDS = FOCI.map(focus => focus.id)
