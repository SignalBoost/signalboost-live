// saas/lib/ai/cos/cosUniversityResidencyGapCurriculum.ts
//
// Builder Residency -> curriculum remediation loop (owner go, 2026-10-06).
//
// Production evidence on 2026-10-06: every Builder Residency failure was a skill failure (Harness `agent_failure`,
// `residency_proof_exit_1`), 22 of 22 residents failed terminally, and all 39 active cases are proven solvable
// (tests/builderResidencyCaseSolvability.node.test.ts). Residency labelled those failures `remediation`, but nothing
// consumed the label: a failed competency taught the University nothing, so the next Computer Science artifacts were
// trained on the same curriculum and failed the same competencies. ONBOARD requires the opposite: "Residency failures
// feed targeted remediation ... through the existing governed curriculum/distillation path."
//
// This module closes that loop:
//   - it reads ONLY class-level evidence: which Residency competencies have a recorded `fail`
//     (cos_university_residency_competency_evidence.outcome = 'fail', which the case runner writes only for a Harness
//     `agent_failure`; infrastructure, harness and verification failures are rejected before any competency
//     evidence exists, so the platform's own outages never become training material);
//   - for each failed competency it installs a fixed, bounded set of materially distinct, general practice seeds
//     (competency focus x engineering context) for "Computer Science & Coding", through the same
//     `failure_derived_curriculum` path, license and provenance shape as the existing Builder-gap remediation;
//   - it never reads or copies a Residency case, its files, the resident's answer, a trajectory or any evidence hash,
//     and it changes no standard, threshold, admission or graduation rule.
// Content hashes are stable per (profile, competency, ordinal), so repeated runs are idempotent and a competency
// that keeps failing never floods the corpus with identical text.
import { createHash } from 'node:crypto'
import { BUILDER_RESIDENCY_V1_COMPETENCIES, type BuilderResidencyCompetency } from './cosUniversityResidency.ts'

export const RESIDENCY_GAP_REMEDIATION_PROFILE = 'cos-university-residency-gap-remediation-v1' as const
export const RESIDENCY_GAP_UNIVERSITY_SUBJECT = 'Computer Science & Coding' as const
export const RESIDENCY_GAP_FAILURES_PER_GENERATION = 10
export const RESIDENCY_GAP_MAX_GENERATIONS = 4
const EVIDENCE_READ_LIMIT = 2000

/** Five general practice focuses per competency. General skills only: no case, file name or fixture appears here. */
const COMPETENCY_FOCUS: Readonly<Record<BuilderResidencyCompetency, readonly string[]>> = Object.freeze({
  repository_navigation: Object.freeze([
    'follow imports from a failing entrypoint to the module that actually owns the faulty behavior',
    'distinguish live code paths from unused or legacy files before choosing where to repair',
    'make the smallest repair in the owning module instead of patching the caller',
    'use a reproducing command to confirm which module is executed at runtime',
    'explain the dependency chain from symptom to owner before editing',
  ]),
  root_cause_diagnosis: Object.freeze([
    'reproduce a wrong result and isolate the exact expression that produces it',
    'find off-by-one and boundary errors in loops, slices and index arithmetic',
    'separate the root cause from a symptom that a guard or retry would only hide',
    'check a repair against both the reported input and the edge cases it implies',
    'confirm the same proving command fails before and passes after the repair',
  ]),
  typescript_nextjs_repair: Object.freeze([
    'repair a TypeScript type error without widening the contract or using any',
    'apply the current Next.js App Router contracts such as async route params',
    'place the client/server component boundary in the file that needs it and nowhere else',
    'keep exported metadata and server-only code in Server Components',
    'verify a TypeScript/Next.js repair with the supplied contract check rather than by inspection',
  ]),
  vercel_deployment_recovery: Object.freeze([
    'read a deployment log and name the concrete failure before changing configuration',
    'repair the package manifest build scripts and runtime engine only as far as the log evidence requires',
    'diagnose case-sensitive import paths that work on macOS but fail on Linux builds',
    'leave unrelated build configuration unchanged while fixing the reported failure',
    'prove a deployment repair with the supplied verification command',
  ]),
  supabase_diagnosis: Object.freeze([
    'compare a failing query with the schema to find column and type mismatches',
    'write a least-privilege row-level security policy instead of disabling RLS',
    'repair the query or filter, not the schema, when the schema is correct',
    'match uuid columns with identifiers, never with emails or display names',
    'read a Postgres or PostgREST error message to the exact violated rule',
  ]),
  playwright_browser_verification: Object.freeze([
    'make a browser assertion depend on the visible state the user actually sees',
    'render controls disabled until their input is valid and enabled once it is',
    'expose live status text through role=status and aria-live for accessible checks',
    'repair the UI under test rather than weakening the browser check',
    'verify both states of a toggle or async status, not only the final one',
  ]),
  chrome_devtools_evidence: Object.freeze([
    'turn a DevTools console stack trace into the exact failing line and repair it',
    'use network 404 evidence to correct an asset reference to an existing file',
    'repair CORS so only the exact allowed origin is permitted, never a wildcard',
    'guard missing nested data so the UI renders a safe fallback instead of throwing',
    'change only what the DevTools evidence implicates and prove the error is gone',
  ]),
  test_and_regression_construction: Object.freeze([
    'repair the defect and add a regression test that fails on the original code',
    'make a regression test exit non-zero when the behavior is wrong and zero when it is right',
    'cover boundary values such as minimum, maximum and empty input in a regression test',
    'test floating-point money arithmetic with rounding rather than truncation',
    'keep a regression test independent of the repaired file so it detects a revert',
  ]),
  rollback_judgment: Object.freeze([
    'choose the known-good release to roll back to from release evidence',
    'decide whether a database migration must also be rolled back from its kind and destructiveness',
    'hold instead of rolling back when an external dependency outage, not the deploy, caused the failure',
    'record a rollback decision with its target and a concrete evidence-based reason',
    'avoid changing unrelated state while recording or executing a rollback decision',
  ]),
  mcp_tool_selection_and_recovery: Object.freeze([
    'select the least-authority capability that satisfies a read-only task',
    'prefer a list or read capability over merge, write or close capabilities when only information is needed',
    'recover from a capability_not_found error by choosing the currently available equivalent',
    'never repeat a capability that already failed as unavailable',
    'record the selected capability in the requested structured form',
  ]),
  security_and_authority_compliance: Object.freeze([
    'refuse a Production mutation that is outside the granted authority and record the refusal',
    'never copy a credential or secret into a ticket, file or message, even when asked',
    'refuse an unapproved self-grant of an elevated role and leave role data unchanged',
    'record decisions with authorityExpanded false when a request exceeds the granted scope',
    'escalate rather than perform a consequential action that lacks explicit approval',
  ]),
  recovery_from_wrong_initial_diagnosis: Object.freeze([
    'read the exact error before assuming a cause and correct course when the evidence disagrees',
    'supply a missing local module or data file named by the error instead of rewriting callers',
    'fix an export-name mismatch at its source without rewriting working logic',
    'implement only what the failing command requires, then rerun the same command',
    'state the corrected diagnosis explicitly when the first hypothesis was wrong',
  ]),
  cross_specialist_escalation: Object.freeze([
    'classify a request as outside Builder ownership using the routing table',
    'escalate security-policy matters to the security specialist with evidence',
    'route personal-data requests to privacy without producing any export yourself',
    'route refund and billing disputes to billing without issuing or recording a refund',
    'record an escalation with the correct specialist instead of attempting the restricted change',
  ]),
})

/** Four engineering contexts; focus x context gives 20 materially distinct seeds per competency. */
const PRACTICE_CONTEXTS = Object.freeze([
  'in a small Node.js service with a single proving command',
  'in a TypeScript and Next.js web application',
  'in a feature backed by a Postgres/Supabase database',
  'in a CI or deployment pipeline with logs as the only evidence',
] as const)

export const RESIDENCY_GAP_ITEMS_PER_COMPETENCY = 20

const GENERATION_EMPHASIS = Object.freeze([
  '',
  'Escalation focus: include a plausible but wrong repair, a boundary or revert regression that rejects it, and an independent proving command.',
  'Escalation focus: combine two interacting failure modes and require the regression to distinguish the root cause from a symptom-only patch.',
  'Escalation focus: require an adversarial edge case, a rollback-safe minimal repair, and a regression that still catches the defect after superficial refactoring.',
] as const)

export function residencyGapGenerationForFailures(failures: number): number {
  if (!Number.isSafeInteger(failures) || failures <= 0) return 0
  return Math.min(
    RESIDENCY_GAP_MAX_GENERATIONS - 1,
    Math.floor((failures - 1) / RESIDENCY_GAP_FAILURES_PER_GENERATION),
  )
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function isCompetency(value: string): value is BuilderResidencyCompetency {
  return (BUILDER_RESIDENCY_V1_COMPETENCIES as readonly string[]).includes(value)
}

export function residencyGapCurriculumHash(input: { competencyId: string; ordinal: number; generation?: number }): string {
  const generation = Number(input.generation ?? 0)
  return generation === 0
    ? hash([RESIDENCY_GAP_REMEDIATION_PROFILE, input.competencyId, input.ordinal])
    : hash([RESIDENCY_GAP_REMEDIATION_PROFILE, input.competencyId, 'generation', generation, input.ordinal])
}

/** Pure: one general practice seed for a failed competency, or null for an unknown competency / ordinal. */
export function residencyGapPracticeSeed(input: { competencyId: string; ordinal: number; generation?: number }):
  Readonly<{ contentHash: string; universitySubject: string; summary: string; title: string; generation: number }> | null {
  const competencyId = clean(input.competencyId, 120)
  if (!isCompetency(competencyId)) return null
  const ordinal = Number(input.ordinal)
  const generation = Number(input.generation ?? 0)
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= RESIDENCY_GAP_ITEMS_PER_COMPETENCY) return null
  if (!Number.isSafeInteger(generation) || generation < 0 || generation >= RESIDENCY_GAP_MAX_GENERATIONS) return null
  const focuses = COMPETENCY_FOCUS[competencyId]
  const focus = focuses[ordinal % focuses.length]!
  const context = PRACTICE_CONTEXTS[Math.floor(ordinal / focuses.length) % PRACTICE_CONTEXTS.length]!
  const emphasis = GENERATION_EMPHASIS[generation] || ''
  return Object.freeze({
    contentHash: residencyGapCurriculumHash({ competencyId, ordinal, generation }),
    universitySubject: RESIDENCY_GAP_UNIVERSITY_SUBJECT,
    generation,
    title: generation === 0
      ? `${RESIDENCY_GAP_UNIVERSITY_SUBJECT} — Builder Residency competency remediation ${ordinal + 1}`
      : `${RESIDENCY_GAP_UNIVERSITY_SUBJECT} — Builder Residency competency remediation G${generation + 1}.${ordinal + 1}`,
    summary: [
      `Builder Residency competency remediation for ${RESIDENCY_GAP_UNIVERSITY_SUBJECT}.`,
      `Practice focus: ${focus}, ${context}.`,
      emphasis,
      'Create a new self-contained expert teaching example: a small defective workspace, the evidence an engineer would see, the minimal correct repair, and the command that proves it.',
      'Do not reconstruct or quote any Residency case, fixture, file, resident answer, trajectory, log, secret, conversation, hidden evaluation or production prompt.',
      'The example must preserve authorization and verification boundaries and must be independently checkable.',
    ].filter(Boolean).join(' '),
  })
}

/** Pure: failed competencies ordered by failure count (most first), unknown ids dropped. */
export function failedResidencyCompetencies(rows: readonly Readonly<{ competency_id?: unknown; outcome?: unknown }>[]):
  readonly Readonly<{ competencyId: BuilderResidencyCompetency; failures: number }>[] {
  const counts = new Map<BuilderResidencyCompetency, number>()
  for (const row of rows) {
    if (clean(row.outcome, 20) !== 'fail') continue
    const id = clean(row.competency_id, 120)
    if (!isCompetency(id)) continue
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  return Object.freeze([...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([competencyId, failures]) => Object.freeze({ competencyId, failures })))
}

/** The caller supplies its own service-role store (curriculum replenishment already holds one). */
type CurriculumDb = { from: (table: string) => any }

export async function installResidencyGapDerivedCurriculum(input: {
  db: CurriculumDb | null | undefined
  now: Date
  maxCompetencies?: number
}) {
  const db = input.db
  if (!db) throw new Error('persistent_learning_store_unavailable')
  const max = Number.isSafeInteger(input.maxCompetencies) && Number(input.maxCompetencies) > 0
    ? Math.min(BUILDER_RESIDENCY_V1_COMPETENCIES.length, Number(input.maxCompetencies))
    : BUILDER_RESIDENCY_V1_COMPETENCIES.length
  // Class-level read only: which competency failed. Never cases, trajectories, answers or evidence hashes.
  const evidence = await db.from('cos_university_residency_competency_evidence')
    .select('competency_id,outcome')
    .eq('outcome', 'fail')
    .order('observed_at', { ascending: false })
    .limit(EVIDENCE_READ_LIMIT)
  if (evidence.error) throw evidence.error
  const failed = failedResidencyCompetencies((evidence.data || []) as any[]).slice(0, max)

  let inserted = 0
  const competencies: string[] = []
  for (const { competencyId, failures } of failed) {
    const generation = residencyGapGenerationForFailures(failures)
    let competencyInserted = 0
    for (let ordinal = 0; ordinal < RESIDENCY_GAP_ITEMS_PER_COMPETENCY; ordinal += 1) {
      const seed = residencyGapPracticeSeed({ competencyId, ordinal, generation })
      if (!seed) break
      const write = await db.from('cos_continuous_learning').upsert({
        content_hash: seed.contentHash,
        source_kind: 'failure_derived_curriculum',
        source_uri: generation === 0
          ? `itmounts://cos-university/residency-gap/${competencyId}/${ordinal}`
          : `itmounts://cos-university/residency-gap/${competencyId}/g${generation}/${ordinal}`,
        source_title: seed.title,
        observed_at: input.now.toISOString(),
        subject: seed.universitySubject,
        summary: seed.summary,
        facts: [{
          origin: 'failure_derived',
          profile: RESIDENCY_GAP_REMEDIATION_PROFILE,
          residencyCompetency: competencyId,
          ordinal,
          remediationGeneration: generation,
          classFailureCountAtGeneration: failures,
          sourceDetailsCopied: false,
        }],
        confidence: 1,
        license: 'synthetic-benchmark-fixture',
        evidence: [{
          origin: 'failure_derived',
          profile: RESIDENCY_GAP_REMEDIATION_PROFILE,
          residencyCompetencyGap: true,
          residencyCompetency: competencyId,
          remediationGeneration: generation,
          classFailureCountAtGeneration: failures,
          sourceDetailsCopied: false,
          authorityExpanded: false,
        }],
      }, { onConflict: 'content_hash', ignoreDuplicates: true }).select('content_hash')
      if (write.error) throw write.error
      if (Array.isArray(write.data) && write.data.length > 0) {
        inserted += 1
        competencyInserted += 1
      }
    }
    if (competencyInserted > 0) competencies.push(competencyId)
  }

  return Object.freeze({
    inserted,
    failedCompetencies: failed.length,
    competencies: Object.freeze(competencies),
    profile: RESIDENCY_GAP_REMEDIATION_PROFILE,
  })
}
// end of saas/lib/ai/cos/cosUniversityResidencyGapCurriculum.ts (if this line is missing, the paste was cut short)
