import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  builderGapCurriculumHash,
  builderGapCurriculumSubject,
  builderGapPracticeSeed,
  BUILDER_GAP_REMEDIATION_PROFILE,
} from '../lib/ai/cos/cosUniversityBuilderGapCurriculum.ts'

test('Builder competency subjects map only to generalized University subjects', () => {
  assert.equal(builderGapCurriculumSubject('software engineering'), 'Computer Science & Coding')
  assert.equal(builderGapCurriculumSubject('agent systems'), 'Artificial Intelligence & Machine Learning')
  assert.equal(builderGapCurriculumSubject('ml and ai engineering'), 'Artificial Intelligence & Machine Learning')
  assert.equal(builderGapCurriculumSubject('private customer repository'), null)
})

test('Builder gap remediation is deterministic, bounded, and contains no originating task text', () => {
  const seed = builderGapPracticeSeed({
    gapId: 'gap-123',
    subject: 'software engineering',
    capability: 'builder_autonomous_completion:builder_verification_failed',
    ordinal: 0,
  })
  assert.ok(seed)
  assert.match(seed!.contentHash, /^[a-f0-9]{64}$/)
  assert.equal(seed!.contentHash, builderGapCurriculumHash({
    gapId: 'gap-123',
    subject: 'software engineering',
    capability: 'builder_autonomous_completion:builder_verification_failed',
    ordinal: 0,
  }))
  assert.match(seed!.summary, /self-contained expert teaching example/i)
  assert.match(seed!.summary, /Do not reconstruct or quote the originating owner request/i)
  assert.doesNotMatch(seed!.summary, /gap-123|builder_verification_failed/)
  assert.equal(builderGapPracticeSeed({
    gapId: 'gap-123',
    subject: 'software engineering',
    capability: 'builder_autonomous_completion:builder_verification_failed',
    ordinal: 20,
  }), null)
})

test('unknown or non-Builder capability classes cannot mint trainable remediation', () => {
  assert.equal(builderGapPracticeSeed({
    gapId: 'gap-1', subject: 'software engineering', capability: 'approval_required', ordinal: 0,
  }), null)
  assert.equal(builderGapPracticeSeed({
    gapId: 'gap-1', subject: 'unknown subject', capability: 'builder_autonomous_completion:builder_verification_failed', ordinal: 0,
  }), null)
})

test('bridge reads only class-level gap metadata and persists explicit safe provenance', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityBuilderGapCurriculum.ts', import.meta.url), 'utf8')
  assert.match(source, /select\('id,subject,capability,escalation_reason,status'\)/)
  assert.doesNotMatch(source, /select\([^\n]*(question|objective|conversation|evidence)/)
  assert.match(source, /source_kind: 'failure_derived_curriculum'/)
  assert.match(source, /license: 'synthetic-benchmark-fixture'/)
  assert.match(source, /sourceDetailsCopied: false/)
  assert.match(source, /authorityExpanded: false/)
  assert.match(source, /BUILDER_GAP_REMEDIATION_PROFILE/)
})

test('mass curriculum replenishment consumes Builder-gap remediation in both inventory states', () => {
  const replenishment = readFileSync(new URL('../lib/ai/cos/cosUniversityDistillationCurriculumReplenishment.ts', import.meta.url), 'utf8')
  const calls = replenishment.match(/installBuilderGapDerivedCurriculum\(/g) || []
  assert.ok(calls.length >= 2)
  assert.match(replenishment, /builderGapDerivedInserted/)
  assert.match(replenishment, /installBuilderGapDerivedCurriculum[\s\S]*installVerifiedFailureDerivedCurriculum/)
})

test('profile is explicit and versioned for portable lineage', () => {
  assert.equal(BUILDER_GAP_REMEDIATION_PROFILE, 'cos-university-builder-gap-remediation-v1')
})


test('fake Builder-looking capability classes fail closed', () => {
  assert.equal(builderGapPracticeSeed({
    gapId: 'gap-fake',
    subject: 'software engineering',
    capability: 'builder_autonomous_completion:builder_some_unknown_failure',
    ordinal: 0,
  }), null)
})

test('Builder curriculum source requires exact capability and escalation provenance pairing', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityBuilderGapCurriculum.ts', import.meta.url), 'utf8')
  assert.match(source, /BUILDER_GAP_CAPABILITIES\.has\(capabilityClass\)/)
  assert.match(source, /escalationReason !== `\$\{BUILDER_GAP_PREFIX\}\$\{capabilityClass\}`/)
})
