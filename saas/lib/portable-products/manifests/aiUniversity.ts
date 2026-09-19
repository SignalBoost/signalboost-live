// saas/lib/portable-products/manifests/aiUniversity.ts
import type { PortableProductManifest } from '../manifestTypes.ts'

export const aiUniversityManifest: PortableProductManifest = Object.freeze({
  productId: 'ai-university',
  displayName: 'AI University Software',
  shortDescription: 'A governed AI education system with a shared foundation, majors, electives, organization courses, exams, retention, and evidence.',
  longDescription: 'A portable AI education engine modeled after a human university. Every student completes a common mandatory foundation before advancing into a buyer-selected major, electives, and organization-specific courses. Curriculum profiles are buyer-owned and versionable, while learning, exams, retention, transfer evaluation, graduation evidence, and optional distillation integration remain governed and auditable.',
  categoryLabel: 'AI education and capability-development software',
  category: 'operations',
  status: 'preview',
  maturity: 'beta',
  publicVisible: true,
  licensingAvailable: false,
  targetAudience: Object.freeze(['AI platform teams', 'enterprises operating AI agents', 'software vendors', 'research organizations']),
  requiredCapabilities: Object.freeze(['mandatory-core-curriculum', 'configurable-majors', 'electives', 'organization-curriculum', 'learning-evidence', 'exams-and-retention']),
  optionalCapabilities: Object.freeze(['scientific-source-adapters', 'web-learning', 'youtube-learning', 'distillation-port', 'specialist-programs']),
  dependencies: Object.freeze(['portable-kernel']),
  exclusions: Object.freeze(['silent-removal-of-mandatory-core', 'unverified-graduation-claims', 'automatic-authority-expansion-from-learning']),
  architectureReferences: Object.freeze(['saas/lib/portable-university', 'saas/lib/ai/cos/cosCurriculumPriority.ts', 'saas/lib/cos/dailyAutonomousLearning.ts']),
  documentationReferences: Object.freeze(['docs/COS-UNIVERSITY-POST-UNDERGRADUATE-ROADMAP-2026-09-08.md', 'docs/portables/ai-university-distillation-suite.md']),
  futureFeatures: Object.freeze(['buyer-neutral-host-extraction', 'curriculum-administration-ui', 'versioned-curriculum-import-export', 'licensing-activation']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})
