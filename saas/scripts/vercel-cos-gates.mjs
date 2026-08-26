import { spawnSync } from 'node:child_process'

const tests = [
  'tests/deterministicUtilities.node.test.ts',
  'tests/engineeringConstants.node.test.ts',
  'tests/calcExpressions.node.test.ts',
  'tests/publicDisclosureGate.node.test.ts',
  'tests/publicGovernanceParity.node.test.ts',
  'tests/conciergeBrowserIngressRouting.node.test.ts',
  'tests/conciergeFullTranscript.node.test.ts',
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
  'tests/cosDirectedStudyPromotion.node.test.ts',
  'tests/cosAnswerFreshnessSelfReflection.node.test.ts',
  'tests/cosCacheReplayCurrentPolicy.node.test.ts',
  'tests/cosScenarioPremiseIntegrity.node.test.ts',
  'tests/cosPublicGenericScenarioIsolation.node.test.ts',
  'tests/cosReusableReasoningPatterns.node.test.ts',
  'tests/cosGeneralReasoningDiscipline.node.test.ts',
  'tests/cosFeedbackReasoningGeneralization.node.test.ts',
  'tests/cosCognitiveAutonomousCertification.node.test.ts',
  'tests/cosCognitiveSkillRetrievalEfficiency.node.test.ts',
  'tests/cognitiveReasoningImperativeTriggers.node.test.ts',
  'tests/releaseSignalSeverity.node.test.ts',
  'tests/cosAnswerPolicyCore.node.test.ts',
  'tests/cosOperatingCharter.node.test.ts',
  'tests/publicProvenanceRecast.node.test.ts',
  'tests/groundingConcepts.node.test.ts',
  'tests/answerEvidenceAttributionRepair.node.test.ts',
  'tests/conversationProvenanceIntent.node.test.ts',
  'tests/localEmbeddingsWindowSafeTransport.node.test.ts',
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
