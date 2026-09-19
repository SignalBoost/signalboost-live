// saas/lib/portable-products/manifests/aiDistillationEngine.ts
import type { PortableProductManifest } from '../manifestTypes.ts'

export const aiDistillationEngineManifest: PortableProductManifest = Object.freeze({
  productId: 'ai-distillation-engine',
  displayName: 'AI Distillation Engine Software',
  shortDescription: 'Turns an approved curriculum snapshot into governed training batches, evaluated model artifacts, and rollback-ready deployment evidence.',
  longDescription: 'A portable model-distillation engine that can be licensed independently or paired with AI University Software. It accepts a buyer-approved curriculum or training snapshot, prepares rights-cleared training material, runs bounded training through replaceable buyer-owned providers, evaluates trained artifacts against baselines and safety/retention gates, and records deployment and rollback evidence without silently widening operational authority.',
  categoryLabel: 'AI model distillation and training software',
  category: 'infrastructure',
  status: 'preview',
  maturity: 'beta',
  publicVisible: true,
  licensingAvailable: false,
  targetAudience: Object.freeze(['ML engineering teams', 'AI platform teams', 'enterprises operating private models', 'software vendors']),
  requiredCapabilities: Object.freeze(['curriculum-snapshot-input', 'training-rights-gates', 'batch-assembly', 'artifact-evaluation', 'baseline-comparison', 'rollback-evidence']),
  optionalCapabilities: Object.freeze(['hugging-face-jobs', 'buyer-training-runtime', 'self-healing-supervision', 'ai-university-curriculum-port']),
  dependencies: Object.freeze(['portable-kernel', 'dynamic-pipeline-router']),
  exclusions: Object.freeze(['training-without-rights-evidence', 'automatic-model-promotion', 'automatic-authority-expansion', 'vendor-locked-training-provider']),
  architectureReferences: Object.freeze(['saas/lib/ai/cos/cosUniversityMassDistillation.ts', 'saas/lib/ai/cos/cosUniversityMassDistillationWorkflow.ts', 'saas/lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts']),
  documentationReferences: Object.freeze(['docs/ONBOARD-SNAPSHOT-2026-09-15-PRE-DISTILLATION-PORTABLE.md', 'docs/portables/ai-university-distillation-suite.md']),
  futureFeatures: Object.freeze(['buyer-neutral-training-provider-port', 'versioned-buyer-release-package', 'licensing-activation']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})
