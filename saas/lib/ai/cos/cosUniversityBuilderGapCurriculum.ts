import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const BUILDER_GAP_REMEDIATION_PROFILE = 'cos-university-builder-gap-remediation-v1' as const
const BUILDER_GAP_PREFIX = 'verified_builder_failure:'
const BUILDER_GAP_CURRICULUM_PER_GAP = 20
const BUILDER_GAP_CAPABILITIES = new Set([
  'builder_verification_failed',
  'builder_model_control_failed',
  'builder_tool_selection_failed',
  'builder_repair_attempts_exhausted',
])

const SUBJECT_MAP: Readonly<Record<string, string>> = Object.freeze({
  'software engineering': 'Computer Science & Coding',
  'agent systems': 'Artificial Intelligence & Machine Learning',
  'ml and ai engineering': 'Artificial Intelligence & Machine Learning',
  'general reasoning': 'Critical Thinking & Problem Solving',
})

const PRACTICE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'software engineering': Object.freeze([
    'reproduce a failing implementation with the smallest check that distinguishes the defect from unrelated noise',
    'inspect types, tests, and runtime boundaries before changing code, then repair the root cause instead of weakening verification',
    'separate a primary compiler or test failure from secondary storage, lockfile, or telemetry bookkeeping failures',
    'verify a repair with a narrow reproducer first and the repository-required gates second',
    'treat deployment success and task-specific Production acceptance as separate claims requiring separate evidence',
  ]),
  'agent systems': Object.freeze([
    'select the minimum authorized tool sequence needed to reproduce a capability failure before mutation',
    'keep observations, hypotheses, tool outputs, and authority claims distinct while planning a bounded repair',
    'recover from a failed tool or planning attempt without expanding scope, bypassing verification, or inventing state',
    'preserve idempotency and generation fencing when an autonomous repair can be retried or resumed',
    'require externally checkable evidence before an agent declares a repair complete',
  ]),
  'ml and ai engineering': Object.freeze([
    'distinguish model capability failure from provider, capacity, timeout, storage, and orchestration failures before training',
    'construct a remediation example that teaches the failed capability without copying hidden evaluation cases',
    'preserve independent evaluation and exact-artifact identity when a trained candidate is compared with its baseline',
    'use transfer and delayed-retention checks to detect narrow memorization or catastrophic regression',
    'keep training curriculum provenance explicit so private operational evidence cannot silently enter model weights',
  ]),
  'general reasoning': Object.freeze([
    'state the observed failure and competing explanations before choosing a repair hypothesis',
    'use a bounded experiment that can falsify the leading diagnosis before making a broad change',
    'preserve prior safety, authority, and verification constraints while solving a new variant',
    'separate evidence from inference and state uncertainty when facts are incomplete',
    'finish with an independently checkable success criterion rather than a self-reported completion claim',
  ]),
})

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function builderGapCurriculumSubject(subject: unknown): string | null {
  return SUBJECT_MAP[clean(subject, 120).toLowerCase()] || null
}

export function builderGapCurriculumHash(input: {
  gapId: string
  subject: string
  capability: string
  ordinal: number
}): string {
  return hash([BUILDER_GAP_REMEDIATION_PROFILE, input.gapId, input.subject, input.capability, input.ordinal])
}

export function builderGapPracticeSeed(input: {
  gapId: string
  subject: string
  capability: string
  ordinal: number
}): Readonly<{ contentHash: string; universitySubject: string; summary: string }> | null {
  const normalized = clean(input.subject, 120).toLowerCase()
  const universitySubject = builderGapCurriculumSubject(normalized)
  const variants = PRACTICE[normalized]
  const capability = clean(input.capability, 160)
  const capabilityClass = capability.startsWith('builder_autonomous_completion:')
    ? capability.slice('builder_autonomous_completion:'.length)
    : ''
  if (!universitySubject || !variants?.length || !BUILDER_GAP_CAPABILITIES.has(capabilityClass)) return null
  const ordinal = Number(input.ordinal)
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= BUILDER_GAP_CURRICULUM_PER_GAP) return null
  const focus = variants[ordinal % variants.length]!
  return Object.freeze({
    contentHash: builderGapCurriculumHash({ gapId: clean(input.gapId, 120), subject: normalized, capability, ordinal }),
    universitySubject,
    summary: [
      `Builder capability remediation for ${universitySubject}.`,
      `Practice focus: ${focus}.`,
      'Create a new self-contained expert teaching example for this capability class.',
      'Do not reconstruct or quote the originating owner request, repository content, logs, secrets, conversations, private evidence, hidden evaluations, or production prompts.',
      'The example must preserve authorization and verification boundaries and must be independently checkable.',
    ].join(' '),
  })
}

export async function installBuilderGapDerivedCurriculum(input: {
  db?: NonNullable<ReturnType<typeof cosServiceDb>>
  now: Date
  maxGaps?: number
}) {
  const db = input.db || cosServiceDb()
  if (!db) throw new Error('persistent_learning_store_unavailable')
  const maxGaps = Number.isSafeInteger(input.maxGaps) && Number(input.maxGaps) > 0 ? Math.min(20, Number(input.maxGaps)) : 3
  const gaps = await db.from('cos_learning_gaps')
    .select('id,subject,capability,escalation_reason,status')
    .eq('status', 'pending')
    .like('escalation_reason', `${BUILDER_GAP_PREFIX}%`)
    .order('last_seen_at', { ascending: false })
    .limit(maxGaps)
  if (gaps.error) throw gaps.error

  let inserted = 0
  const gapIds: string[] = []
  for (const row of (gaps.data || []) as any[]) {
    const gapId = clean(row.id, 120)
    const subject = clean(row.subject, 120)
    const capability = clean(row.capability, 160)
    const capabilityClass = capability.startsWith('builder_autonomous_completion:')
      ? capability.slice('builder_autonomous_completion:'.length)
      : ''
    const escalationReason = clean(row.escalation_reason, 200)
    if (!gapId || !BUILDER_GAP_CAPABILITIES.has(capabilityClass)
      || escalationReason !== `${BUILDER_GAP_PREFIX}${capabilityClass}`) continue
    let gapInserted = 0
    for (let ordinal = 0; ordinal < BUILDER_GAP_CURRICULUM_PER_GAP; ordinal += 1) {
      const seed = builderGapPracticeSeed({ gapId, subject, capability, ordinal })
      if (!seed) break
      const write = await db.from('cos_continuous_learning').upsert({
        content_hash: seed.contentHash,
        source_kind: 'failure_derived_curriculum',
        source_uri: `itmounts://cos-university/builder-gap/${seed.contentHash.slice(0, 16)}/${ordinal}`,
        source_title: `${seed.universitySubject} — Builder competency remediation ${ordinal + 1}`,
        observed_at: input.now.toISOString(),
        subject: seed.universitySubject,
        summary: seed.summary,
        facts: [{
          origin: 'failure_derived',
          profile: BUILDER_GAP_REMEDIATION_PROFILE,
          capabilityClass: capability,
          ordinal,
          sourceDetailsCopied: false,
        }],
        confidence: 1,
        license: 'synthetic-benchmark-fixture',
        evidence: [{
          origin: 'failure_derived',
          profile: BUILDER_GAP_REMEDIATION_PROFILE,
          builderCompetencyGap: true,
          capabilityClass: capability,
          sourceGapId: gapId,
          sourceDetailsCopied: false,
          authorityExpanded: false,
        }],
      }, { onConflict: 'content_hash', ignoreDuplicates: true }).select('content_hash')
      if (write.error) throw write.error
      if (Array.isArray(write.data) && write.data.length > 0) {
        inserted += 1
        gapInserted += 1
      }
    }
    if (gapInserted > 0) gapIds.push(gapId)
  }

  return Object.freeze({ inserted, gapIds: Object.freeze(gapIds), profile: BUILDER_GAP_REMEDIATION_PROFILE })
}
