import { spawnSync } from 'node:child_process'

const tests = [
  'tests/conciergeBrowserIngressRouting.node.test.ts',
  'tests/conciergeFullTranscript.node.test.ts',
  'tests/cosPublicProvenanceAuditIdentity.node.test.ts',
  'tests/textTransformationInput.node.test.ts',
  'tests/executiveCommunication.node.test.ts',
  'tests/assistantComposerReset.node.test.ts',
  'tests/cosTurnExperience.node.test.ts',
  'tests/cosOutcomeCorrelation.node.test.ts',
  'tests/cosFailureAutopsy.node.test.ts',
  'tests/cosAdaptiveRetrieval.node.test.ts',
  'tests/cosRetrievalSelfReflection.node.test.ts',
  'tests/cosFreshnessPolicy.node.test.ts',
  'tests/cosFreshLiveRouting.node.test.ts',
  'tests/cosFreshGrounding.node.test.ts',
  'tests/cosStructuredLiveInfo.node.test.ts',
  'tests/cosTemporalClaimGuard.node.test.ts',
  'tests/cosLocalDiscovery.node.test.ts',
  'tests/cosCurrentWorldLearning.node.test.ts',
  'tests/cosLearnedCorpusContinuousIndexing.node.test.ts',
  'tests/cosDirectedStudy.node.test.ts',
  'tests/cosAnswerFreshnessSelfReflection.node.test.ts',
  'tests/cosCacheReplayCurrentPolicy.node.test.ts',
  'tests/cosScenarioPremiseIntegrity.node.test.ts',
  'tests/cosReusableReasoningPatterns.node.test.ts',
  'tests/cosGeneralReasoningDiscipline.node.test.ts',
  'tests/cosFeedbackReasoningGeneralization.node.test.ts',
  'tests/cosCognitiveAutonomousCertification.node.test.ts',
]

const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
})

if (result.error) {
  console.error('[vercel-cos-gates] failed to launch test runner:', result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
