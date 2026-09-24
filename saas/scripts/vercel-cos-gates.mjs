// Diagnostic-only Q3A slice of the full production gate. Never merge.
import { spawnSync } from 'node:child_process'
const tests = [
  'tests/cosWholeTurnDeadline.node.test.ts',
  'tests/operationalSystemsLearning.node.test.ts',
  'tests/advisoryDiagnosisPolicy.node.test.ts',
  'tests/cosChiefOfStaffAcceptance.node.test.ts',
  'tests/cosChiefOfStaffBlindAcceptance.node.test.ts',
  'tests/cosGroundingConfidence.node.test.ts',
  'tests/groundingConfidence.powerCap.node.test.ts',
  'tests/cosPublicProvenanceAuditIdentity.node.test.ts',
  'tests/cosProvenanceParaphraseContinuity.node.test.ts',
  'tests/cosCreativeConstraintFidelity.node.test.ts',
  'tests/cosReasonerQuality.node.test.ts',
  'tests/honestRefusalReply.node.test.ts',
  'tests/learnedEvidencePolicy.node.test.ts',
  'tests/textTransformationInput.node.test.ts',
  'tests/cosEditIntentFidelity.node.test.ts',
  'tests/writingElementFollowup.node.test.ts',
  'tests/cosConversationContinuityWiring.node.test.ts',
  'tests/cosArtifactConversationContinuation.node.test.ts',
  'tests/executiveCommunication.node.test.ts',
  'tests/professionalDocumentEngine.node.test.ts',
  'tests/assistantComposerReset.node.test.ts',
  'tests/dataCenterOperations.node.test.ts',
  'tests/cosDataCenterCapabilityBenchmark.node.test.ts',
  'tests/cosTurnExperience.node.test.ts',
  'tests/cosOutcomeCorrelation.node.test.ts',
  'tests/cosFailureAutopsy.node.test.ts',
  'tests/cosAdaptiveRetrieval.node.test.ts',
]
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
if (result.error) { console.error(result.error.message); process.exit(1) }
process.exit(result.status ?? 1)
