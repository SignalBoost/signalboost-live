// saas/scripts/vercel-cos-gates.mjs

// Full production regression gate restored after 2026-09-23 diagnostic isolation.

import { spawnSync } from 'node:child_process'

import { readFileSync } from 'node:fs'



const bypassAudit = spawnSync(process.execPath, ['scripts/check-platform-harness-bypasses.mjs'], { stdio: 'inherit' })

if (bypassAudit.status !== 0) process.exit(bypassAudit.status ?? 1)



const tests = [

  'tests/cosArtifactBirthCertificate.node.test.ts',

  'tests/cosUniversityMassQuarantineReview.node.test.ts',

  'tests/cosUniversityLaneExpectation.node.test.ts',

  'tests/cosUniversityLaneFaultRecorder.node.test.ts',

  'tests/cosUniversityFineTuneEvidence.node.test.ts',

  'tests/cosUniversityFrontierDistillation.node.test.ts',

  'tests/cosUniversityRealSourceQualityFloor.node.test.ts',

  // Red on main since an evaluator refactor because it was never gated: the mass-evaluation suite

  // contract (four suites, shared ceilings, promotion thresholds) had no enforcement.

  'tests/cosUniversityMassDistilledEvaluation.node.test.ts',

  'tests/cosUniversityMassEvaluationJudgeTimeoutContract.node.test.ts',

  'tests/cosUniversityGraduateActivationCron.node.test.ts',

  'tests/universityDistillationRecoveryDrillSafety.node.test.ts',

  'tests/cosUniversityRecoveryDrill.node.test.ts',

  'tests/cosUniversityTeacherPool.node.test.ts',

  'tests/cosUniversityTeacherAdapters.node.test.ts',

  'tests/modelPortabilityRegistry.node.test.ts',

  'tests/modelPortabilityRouting.node.test.ts',

  'tests/modelTransportAdapters.node.test.ts',

  'tests/modelCertification.node.test.ts',

  'tests/modelConsole.node.test.ts',

  'tests/modelAssignmentRelease.node.test.ts',

  'tests/modelTransportPlugin.node.test.ts',

  'tests/modelPortabilitySaleAcceptance.node.test.ts',

  'tests/cosUniversityMassHostedTeacherStage.node.test.ts',

  'tests/cosUniversityTelemetry.node.test.ts',

  'tests/universityArtifactEvidenceArchive.node.test.ts',

  'tests/cosLaneStatus.node.test.ts',

  'tests/cosWorkingDistillationDispatch.node.test.ts',

  'tests/cosWorkingDistillationEvaluationAdmission.node.test.ts',

  'tests/cosWorkingDistillationEvaluatorRuntime.node.test.ts',

  'tests/runpodWorkingCosEvaluatorRuntime.node.test.ts',

  'tests/runpodWorkingCosEvaluatorProvision.node.test.ts',

  'tests/cosUniversityHuggingFaceJobs.node.test.ts',

  'tests/platformHarnessFullEnforcement.node.test.ts',

  'tests/deepInfraHarnessSpendGuard.node.test.ts',

  'tests/cosUniversityMassCanaryArtifactDailyCap.node.test.ts',

  'tests/runpodMassDistilledCanaryAdaFallback.node.test.ts',

  'tests/cosUniversityMassCanaryRollingWindowComplete.node.test.ts',

  'tests/projectGutenbergWrappedLicenseHeader.node.test.ts',

  'tests/cosLearningContinuityPagination.node.test.ts',

  'tests/massEvaluationJudgeSpendReservation.node.test.ts',

  'tests/cosUniversityMassBacklogCompactor.node.test.ts',

  'tests/platformHarnessUniversalIngress.node.test.ts',

  'tests/cosUniversityMassEvaluationBacklogGate.node.test.ts',

  'tests/platformHarnessAbsoluteDeadline.node.test.ts',

  'tests/platformHarnessCompensation.node.test.ts',

  'tests/platformHarnessProductionAcceptance.node.test.ts',

  'tests/cosUniversityDailyLaneCadence.node.test.ts',

  // Registered 2026-09-13. These regressions existed but were never in this gate, so they had

  // never run in CI: every "green" for them came from a sandbox. They defend the execution binding,

  // the per-agent scoping of graduate work, the honest-receipt rule, acquisition selection and the

  // curriculum/exam alignment — all behaviour a deploy can silently undo.

  'tests/cosUniversityPracticeGateParity.node.test.ts',

  'tests/cosUniversitySpecialistRuntimes.node.test.ts',

  'tests/cosUniversityPhdAgentScope.node.test.ts',

  'tests/cosUniversitySpecialistRuntimeDatabase.node.test.ts',

  'tests/cosUniversityMastersRuntimeAgentScope.node.test.ts',

  'tests/cosUniversityMastersAgentAware.node.test.ts',

  'tests/cosUniversityReceiptHonesty.node.test.ts',

  'tests/cosUniversityPracticeDeferralPolicy.node.test.ts',

  'tests/cosUniversityCurriculumExamAlignment.node.test.ts',

  'tests/cosUniversityStudySupplyPriority.node.test.ts',

  'tests/cosUniversityLearningSourceCooldown.node.test.ts',

  'tests/cosLearningProviderLease.node.test.ts',

  'tests/learningSourceMix.node.test.ts',

  'tests/hfOpenDatasetContinuousAcquisition.node.test.ts',

  'tests/publicDomainFullTextSources.node.test.ts',

  'tests/universitySourceFabric.node.test.ts',

  'tests/hfOpenDatasetTransport.node.test.ts',

  'tests/openAlexAbstract.node.test.ts',

  'tests/cosUniversityAgentModelPolicy.node.test.ts',

  'tests/cosUniversityCredentialKeys.node.test.ts',

  'tests/cosUniversityGraduationRuntimePolicy.node.test.ts',

  'tests/cosUniversityAcademicExecutionPolicy.node.test.ts',

  'tests/cosUniversityAgentGradeEligibility.node.test.ts',

  'tests/cyberDependencyScanCoverage.node.test.ts',

  'tests/cyberLegacyPresentation.node.test.ts',

  'tests/cosUniversityExecutionReceipt.node.test.ts',

  'tests/cosUniversityProductionReceiptIdentity.node.test.ts',

  'tests/cosUniversityGraduationRemediation.node.test.ts',

  'tests/cosUniversityAgentCapstone.node.test.ts',

  'tests/builderToolLoop.node.test.ts',

  'tests/builderMcpReadTools.node.test.ts',

  'tests/universalMcpActionsTokenScope.node.test.ts',

  'tests/securityAdmissionShield.node.test.ts',

  'tests/publicFetchGuard.node.test.ts',

  'tests/promoteUploadAdmission.node.test.ts',

  'tests/videoUploadAdmission.node.test.ts',

  'tests/aiSecurityGateway.node.test.ts',

  'tests/aiSecuritySupervisorTelemetry.node.test.ts',

  'tests/cosEvidenceCompaction.node.test.ts',

  'tests/nativeAutonomousLoop.node.test.ts',

  'tests/builderPlaywrightCli.node.test.ts',

  'tests/playwrightMcpProductionAcceptance.node.test.ts',

  'tests/chromeDevtoolsMcpProductionAcceptance.node.test.ts',

  'tests/builderVerificationOrder.node.test.ts',

  'tests/builderProjectLessons.node.test.ts',

  'tests/builderProductReadiness.node.test.ts',

  'tests/builderRepositorySearch.node.test.ts',

  'tests/builderCertificationRunner.node.test.ts',

  'tests/builderResidencyCaseRunner.node.test.ts',

  'tests/builderResidencyOrchestrator.node.test.ts',

  'tests/builderResidencyExactArtifactModel.node.test.ts',

  'tests/builderCheckpoint.node.test.ts',

  'tests/builderTaskCompletion.node.test.ts',

  'tests/localOpenModelInference.node.test.ts',

  'tests/runpodPrimaryRouting.node.test.ts',

  'tests/builderRepairClassification.node.test.ts',

  'tests/builderProjectContext.node.test.ts',

  'tests/builderExecutionEvidence.node.test.ts',

  'tests/builderProjectContinuity.node.test.ts',

  'tests/agentProgressStreaming.node.test.ts',

  'tests/auditCosRuntime.node.test.ts',

  'tests/deterministicUtilities.node.test.ts',

  'tests/engineeringConstants.node.test.ts',

  'tests/calcExpressions.node.test.ts',

  'tests/publicDisclosureGate.node.test.ts',

  'tests/cosIdentityDisclosureBoundary.node.test.ts',

  'tests/publicGovernanceParity.node.test.ts',

  'tests/conciergeBrowserIngressRouting.node.test.ts',

  'tests/conciergeFullTranscript.node.test.ts',

  'tests/conciergeTransportBudget.node.test.ts',

  'tests/pastedOperationalLog.node.test.ts',

  'tests/repairConfirmationIntent.node.test.ts',

  'tests/attachedOperationalEvidence.node.test.ts',

  'tests/builderOperationalLogRouting.node.test.ts',

  'tests/builderContractOscillation.node.test.ts',

  'tests/builderTimeBudget.node.test.ts',

  'tests/builderControlRecovery.node.test.ts',

  'tests/builderControlAdapter.node.test.ts',

  'tests/builderRequestDeadline.node.test.ts',

  'tests/builderTransportRecovery.node.test.ts',

  'tests/builderAsyncJobs.node.test.ts',

  'tests/builderObjectiveContract.node.test.ts',

  'tests/builderDebugFileJob.node.test.ts',

  'tests/builderRoutingStrict.node.test.ts',

  'tests/assistantHistoryOrdering.node.test.ts',

  'tests/assistantSourceFileBoundary.node.test.ts',

  'tests/conciergeOperationalLogRouting.node.test.ts',

  'tests/conciergeResultDelivery.node.test.ts',

  'tests/fullAssistantConciergeIngress.node.test.ts',

  'tests/builderRepositoryRepairTarget.node.test.ts',

  'tests/builderRepositoryRepairProofController.node.test.ts',

  'tests/builderRepositoryRepairSecurity.node.test.ts',

  'tests/cosSoftwareSpecialistRouting.node.test.ts',

  'tests/cosConciergeSoftwareArchitecture.node.test.ts',

  'tests/conciergeGovernedRepairHardening.node.test.ts',

  'tests/mainWriteDiscipline.node.test.ts',

  'tests/conciergeVisuals.node.test.ts',

  'tests/conciergeSemanticVisualIntent.node.test.ts',

  'tests/conciergeVisualTypoRouting.node.test.ts',

  'tests/visualObjectiveContract.node.test.ts',

  'tests/visualPromptFormatNeutrality.node.test.ts',

  'tests/namedSubjectIntent.node.test.ts',

  'tests/runtimeAcceptanceCleanup.node.test.ts',

  'tests/conciergeNamedPeopleRecovery.node.test.ts',

  'tests/suggestedFollowups.node.test.ts',

  'tests/cosPrimaryDeterministicFreshRouting.node.test.ts',

  'tests/cosDomainAvailability.node.test.ts',

  'tests/assistantTransportClient.node.test.ts',

  'tests/cosDurableTurnHistory.node.test.ts',

  'tests/cosInteractiveGraduateLatency.node.test.ts',

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

  'tests/cosReasonerPromptScope.node.test.ts',

  'tests/honestRefusalReply.node.test.ts',

  'tests/learnedEvidencePolicy.node.test.ts',

  'tests/cosRetainedLearningEndToEnd.node.test.ts',

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

  'tests/cosNativeAgentFreshnessGuard.node.test.ts',

  'tests/cosTravelPlanningFreshness.node.test.ts',

  'tests/cosFreshGroundedTask.node.test.ts',

  'tests/listCatalogIntent.node.test.ts',

  'tests/cosFreshLiveRouting.node.test.ts',

  'tests/freshEvidenceLocalSynthesis.node.test.ts',

  'tests/freshEvidenceNeuralReview.node.test.ts',

  'tests/freshEvidencePredicateAmbiguity.node.test.ts',

  'tests/cosFreshGrounding.node.test.ts',

  'tests/cosStructuredLiveInfo.node.test.ts',

  'tests/cosTemporalClaimGuard.node.test.ts',

  'tests/cosLocalDiscovery.node.test.ts',

  'tests/cosCurrentWorldLearning.node.test.ts',

  'tests/cosWebTrainingDataLayer.node.test.ts',

  'tests/webKnowledgeHarness.node.test.ts',

  'tests/webKnowledgeLiveRouting.node.test.ts',

  'tests/cosWebTrainingPdfText.node.test.ts',

  'tests/cosLearningTargetLanguage.node.test.ts',

  'tests/cosLearnedCorpusContinuousIndexing.node.test.ts',

  'tests/workingAgentKnowledge.node.test.ts',

  'tests/cosDirectedStudy.node.test.ts',

  'tests/specialistLearning.node.test.ts',

  'tests/cosDirectedStudyPromotion.node.test.ts',

  'tests/cosAnswerFreshnessSelfReflection.node.test.ts',

  'tests/cosCacheReplayCurrentPolicy.node.test.ts',

  'tests/cosScenarioPremiseIntegrity.node.test.ts',

  'tests/cosPublicGenericScenarioIsolation.node.test.ts',

  'tests/cosReusableReasoningPatterns.node.test.ts',

  'tests/cosGeneralReasoningDiscipline.node.test.ts',

  'tests/cosFeedbackReasoningGeneralization.node.test.ts',

  'tests/cosCognitiveAutonomousCertification.node.test.ts',

  'tests/cosUniversity.node.test.ts',

  'tests/cosUniversityContinuousLearning.node.test.ts',

  'tests/cosUniversityUndergraduateAcceptance.node.test.ts',

  'tests/cosUniversityIndependentExam.node.test.ts',

  'tests/cosUniversityExecutionBinding.node.test.ts',

  'tests/cosUniversityRoleModelPolicy.node.test.ts',

  'tests/cosUniversityMastersAgentScope.node.test.ts',

  'tests/cosUniversityEvidenceSupply.node.test.ts',

  'tests/cosUniversityARange.node.test.ts',

  'tests/cosUniversityLanguageAuthenticity.node.test.ts',

  'tests/cosUniversityContinuousEducation.node.test.ts',

  'tests/cosUniversityPostRemediationStudyProof.node.test.ts',

  'tests/cosUniversityPracticeInferenceFence.node.test.ts',

  'tests/cosUniversityDeliberatePractice.node.test.ts',

  'tests/cosUniversityGraduation.node.test.ts',

  'tests/cosUniversityPrograms.node.test.ts',

  'tests/cosUniversityExamRemediation.node.test.ts',

  'tests/cosUniversityMasters.node.test.ts',

  'tests/cosUniversityPhd.node.test.ts',

  'tests/cosUniversityPhdRuntime.node.test.ts',

  'tests/cosUniversityPhdResearchExecution.node.test.ts',

  'tests/cosUniversityPhdMethodologyExam.node.test.ts',

  'tests/cosUniversityAdmission.node.test.ts',

  'tests/cosUniversityAdmissionRunner.node.test.ts',

  'tests/cosUniversityActiveAcademicLane.node.test.ts',

  'tests/cosBehavioralRobustness.node.test.ts',

  'tests/cosCognitiveSkillRetrievalEfficiency.node.test.ts',

  'tests/cognitiveReasoningImperativeTriggers.node.test.ts',

  'tests/releaseSignalSeverity.node.test.ts',

  'regression/powerStabilizationRelease.node.test.ts',

  'tests/cosAnswerPolicyCore.node.test.ts',

  'tests/cosNormativeAnswerPolicy.node.test.ts',

  'tests/normativeFreshEvidenceFallback.node.test.ts',

  'tests/cosNeuralEvidenceReasoning.node.test.ts',

  'tests/cosPragmaticIntentCore.node.test.ts',

  'tests/cosModelFirstAgentLoop.node.test.ts',

  'tests/cosContextualInterpretationIsolation.node.test.ts',

  'tests/cosOperatingCharter.node.test.ts',

  'tests/publicRecordedProvenance.node.test.ts',

  'tests/groundingConcepts.node.test.ts',

  'tests/answerEvidenceAttributionRepair.node.test.ts',

  'tests/conversationProvenanceIntent.node.test.ts',

  'tests/localEmbeddingsWindowSafeTransport.node.test.ts',

  'tests/publicCorpusEvidence.node.test.ts',

  'tests/googleSheetsConnector.node.test.ts',

  'tests/describeThrownValue.node.test.ts',

  'tests/demoPricing.node.test.ts',

  'tests/repositoryRepairAutoMerge.node.test.ts',

  'tests/repositoryMergeWatch.node.test.ts',

  'tests/cosHarnessIngress.node.test.ts',

  'tests/cosSoftwareSpecialistProductionHarness.node.test.ts',

  'tests/cosA2ASpecialistHarnessIngress.node.test.ts',

  'tests/cosWorkingDistillationReadinessCron.node.test.ts',

  'tests/builderResidencyLiveHost.node.test.ts',

  'tests/builderResidencyFinalEvaluationGate.node.test.ts',

  'tests/cosInteractiveModelHealthMonitoring.node.test.ts',

  'tests/dashboardPromptOnePipeline.node.test.ts',

  'tests/cosChatPathCallLabels.node.test.ts',

  'tests/graduateWarmGate.node.test.ts',

  // 2026-09-29: #3480 replaced the evaluator with a copy that hard-coded the 12h wait while approval and the SQL

  // claim used 10 minutes, so admitted students were refused inside the evaluator. This test was red on main and

  // nothing stopped the deploy. Gate it so the next divergent copy fails its own preview build.

  'tests/massRetentionDelayTestPhase.node.test.ts',

  // 2026-09-29: XSA at 100% made every new student un-examinable (answers 37-44s vs 4.0s standard, 50s limit).

  // Gated so the rollout cannot silently go back up.

  'tests/cosUniversityExclusiveSelfAttention.node.test.ts',

  // 2026-09-29: XSA students are neither canaried nor examined until the XSA runtime answers inside the exam limit.

  'tests/xsaExamPause.node.test.ts',

  // 2026-09-29: always-on RunPod workers left behind by killed exam/canary runs are released every 5 minutes.

  'tests/runpodPinnedWorkerSweeper.node.test.ts',

  // 2026-09-29: graduates leave the University and COS hires them from the Workforce roster.

  'tests/cosWorkforceRoster.node.test.ts',

  'tests/cosWorkforcePostGraduationPipeline.node.test.ts',

  'tests/cosWorkforceAssignmentStage.node.test.ts',

  'tests/cosWorkforceProductionVerification.node.test.ts',

  'tests/cosWorkforceStageDashboard.node.test.ts',

  'tests/cosWorkforceAbandonedAssignments.node.test.ts',

  // 2026-09-29 backwards pass: Workforce dashboard, quarantine rule, Residency time budget and context fit.

  'tests/universityBackwardsPass.node.test.ts',

  // 2026-09-30 quarantine: every quarantined student's reason is named; the review reads in bounded chunks.

  'tests/universityQuarantineLedger.node.test.ts',

  // 2026-09-30 quarantine resolution: proven FAILs leave the University, our-fault students return to the exam.

  'tests/universityQuarantineResolution.node.test.ts',

  // 2026-10-02: the anti-stall pipeline repairs. All five of these were gated once and the entries were lost in a
  // later merge while the test files stayed, which is how main ended up carrying a RED quarantineStallDrain against
  // the shipped loop fix with nothing in CI to catch it.
  //  - evaluation lane picks oldest-first while the exam writer fills newest-first (lookahead 24, writer 10)
  //  - quarantine resolution had two outcomes that never changed a status, and its stall clock could be rewound by
  //    the quarantine -> exam -> quarantine lap
  //  - registration read all candidates' evidence in one newest-first 3000-row query while walking oldest-first
  //  - an artifact waiting to graduate had its proven canary endpoint unprotected from reclaim
  'tests/holdoutExamReadyThroughput.node.test.ts',
  'tests/quarantineStallDrain.node.test.ts',
  'tests/massGraduateRegistrationStarvation.node.test.ts',
  'tests/cosUniversityMassGraduateRegistration.node.test.ts',
  'tests/pendingGraduateEndpointProtection.node.test.ts',

  // 2026-09-30 owner direction "remove them": paused XSA students leave as OUR failure, never a FAIL.

  'tests/universityXsaRemoval.node.test.ts',

  // 2026-09-30 pipeline row: left to right, ending at graduation.

  'tests/universityPipelineOrder.node.test.ts',

  // 2026-09-30 Residency lanes: one parallel lane per admitted resident, warm workers reused, remediation first.

  'tests/residencyLanes.node.test.ts',

  'tests/builderResidencyCron.node.test.ts',

  // 2026-09-30 exam lane: a student whose endpoint is gone is re-canaried instead of retried forever.

  'tests/examEndpointRefresh.node.test.ts',

  'tests/staleGatewayXsaInfrastructure.node.test.ts',

  // 2026-09-29: 220 independent evaluations showed distillation teaching base-rate reasoning (0.000 -> 0.927, 204

  // helped / 0 hurt) while ERASING survivorship (1.000 -> 0.382, 0 helped / 136 hurt) and regression to the mean

  // (0.455 -> 0.127). The worker now replays a fixed rehearsal ballast after GKD. Gate it so the ballast cannot

  // quietly start reusing the evaluator's own questions, lose a damaged skill, or stop running last.

  'tests/generalReasoningBallast.node.test.ts',

  // 2026-09-29 19:13-21:23 UTC: every exam wake died at 10/10 RunPod workers and no exam completed after 17:21

  // while 44 examinable artifacts waited. Reclaim required min === 0, so a SUPERSEDED-generation endpoint pinned

  // always-on held quota forever. Gate the widened reclaim and the quota inventory so neither the protections

  // nor the infrastructure classification of the quota error can regress.

  'tests/runpodWorkerQuotaReclaim.node.test.ts',



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
