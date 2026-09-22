// Teaching cases for Builder Residency.
//
// These are practical education fixtures, not hidden final exams. Variants are derived from the
// candidate identity so duplicate replays cannot manufacture independent competency evidence.

import { createHash } from 'node:crypto'
import {
  evaluateBuilderCertification,
  type BuilderCertificationCaseId,
} from '@/lib/builder/certification'
import type { BuilderLoopResult, BuilderToolTrace } from '@/lib/builder/contracts'
import type { BuilderResidencyCompetency } from '@/lib/ai/cos/cosUniversityResidency'

export const BUILDER_RESIDENCY_TEACHING_CASE_IDS = [
  'inspect-repair-loop-bound-v1',
  'observe-failure-recover-module-v1',
] as const

export type BuilderResidencyTeachingCaseId =
  (typeof BUILDER_RESIDENCY_TEACHING_CASE_IDS)[number]

export type BuilderResidencyTeachingCase = Readonly<{
  id: BuilderResidencyTeachingCaseId
  caseFamily: string
  competencyId: BuilderResidencyCompetency
  objective: string
  seed: readonly Readonly<{ path: string; content: string }>[]
  variantHash: string
  gradingCaseId: BuilderCertificationCaseId
  expectedStdout: string
  finalExamMaterialUsed: false
}>

const sha256 = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

function bytes(seed: string): Buffer {
  return createHash('sha256').update(seed).digest()
}

function inspectRepair(candidateId: string): BuilderResidencyTeachingCase {
  const b = bytes(`builder-residency:inspect:${candidateId}`)
  const values = [
    2 + (b[0] % 5),
    3 + (b[1] % 7),
    4 + (b[2] % 9),
  ]
  const expected = values.reduce((sum, value) => sum + value, 0)
  const objective = [
    'Open the workspace file total.js and inspect the actual implementation.',
    `Correct the loop defect so total([${values.join(', ')}]) prints exactly ${expected} instead of NaN.`,
    'Make only the necessary repair and prove it with: node total.js',
  ].join(' ')
  const seed = Object.freeze([Object.freeze({
    path: 'total.js',
    content: [
      'function total(values) {',
      '  let sum = 0',
      '  for (let index = 0; index <= values.length; index += 1) {',
      '    sum += values[index]',
      '  }',
      '  return sum',
      '}',
      '',
      `console.log(total([${values.join(', ')}]))`,
      '',
    ].join('\n'),
  })])
  const caseFamily = 'local_javascript_root_cause_repair'
  return Object.freeze({
    id: 'inspect-repair-loop-bound-v1',
    caseFamily,
    competencyId: 'root_cause_diagnosis',
    objective,
    seed,
    variantHash: sha256({ caseFamily, candidateId, objective, seed }),
    gradingCaseId: 'inspect_repair_and_run_v1',
    expectedStdout: String(expected),
    finalExamMaterialUsed: false,
  })
}

function observeRecover(candidateId: string): BuilderResidencyTeachingCase {
  const b = bytes(`builder-residency:recover:${candidateId}`)
  const total = 20 + (b[0] % 70)
  const title = `Residency-${b.subarray(1, 4).toString('hex')}`
  const expected = `${title}: ${total}`
  const objective = [
    'Run: node report.js — it fails.',
    'Observe the recorded failure before changing files, diagnose the actual cause, repair it,',
    `then run the same command again until it succeeds and prints exactly "${expected}".`,
  ].join(' ')
  const seed = Object.freeze([Object.freeze({
    path: 'report.js',
    content: [
      "const { formatReport } = require('./format-report.js')",
      '',
      `console.log(formatReport({ title: '${title}', total: ${total} }))`,
      '',
    ].join('\n'),
  })])
  const caseFamily = 'local_javascript_observe_failure_recovery'
  return Object.freeze({
    id: 'observe-failure-recover-module-v1',
    caseFamily,
    competencyId: 'recovery_from_wrong_initial_diagnosis',
    objective,
    seed,
    variantHash: sha256({ caseFamily, candidateId, objective, seed }),
    gradingCaseId: 'observe_failure_and_recover_v1',
    expectedStdout: expected,
    finalExamMaterialUsed: false,
  })
}

export function materializeBuilderResidencyTeachingCase(
  caseId: BuilderResidencyTeachingCaseId,
  candidateId: string,
): BuilderResidencyTeachingCase {
  if (!candidateId.trim()) throw new Error('builder_residency_candidate_required')
  if (caseId === 'inspect-repair-loop-bound-v1') return inspectRepair(candidateId)
  if (caseId === 'observe-failure-recover-module-v1') return observeRecover(candidateId)
  throw new Error('builder_residency_case_unknown')
}

function successfulRun(trace: readonly BuilderToolTrace[]): BuilderToolTrace | null {
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    const item = trace[index]
    if (
      item.toolId === 'run'
      && item.ok
      && Number((item.output as { exitCode?: unknown } | undefined)?.exitCode) === 0
    ) return item
  }
  return null
}

export function verifyBuilderResidencyTeachingCase(
  teachingCase: BuilderResidencyTeachingCase,
  result: BuilderLoopResult,
): Readonly<{ passed: boolean; reasons: readonly string[]; evidenceHash: string }> {
  const base = evaluateBuilderCertification(teachingCase.gradingCaseId, result)
  const reasons = [...base.reasons]
  const run = successfulRun(result.trace)
  const stdout = String(
    (run?.output as { stdout?: unknown } | undefined)?.stdout ?? '',
  ).trim()

  if (!run) reasons.push('residency_proving_command_missing')
  else if (stdout !== teachingCase.expectedStdout) reasons.push('residency_expected_output_mismatch')

  const evidenceHash = sha256({
    profile: 'builder-residency-teaching-verifier-v1',
    caseId: teachingCase.id,
    variantHash: teachingCase.variantHash,
    resultOk: result.ok,
    trace: result.trace.map(item => ({
      round: item.round,
      toolId: item.toolId,
      ok: item.ok,
      failureClass: item.failureClass ?? null,
      error: item.error ?? null,
      command: item.toolId === 'run' ? String(item.input.command ?? '').slice(0, 1000) : null,
      exitCode: item.toolId === 'run'
        ? Number((item.output as { exitCode?: unknown } | undefined)?.exitCode)
        : null,
    })),
    expectedStdout: teachingCase.expectedStdout,
    observedStdout: stdout,
    reasons,
  })

  return Object.freeze({
    passed: reasons.length === 0,
    reasons: Object.freeze(reasons),
    evidenceHash,
  })
}
