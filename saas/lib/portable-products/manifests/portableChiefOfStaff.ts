import type { PortableProductManifest } from '../manifestTypes.ts'

export const portableChiefOfStaffManifest: PortableProductManifest = Object.freeze({
  productId: 'portable-ai-chief-of-staff',
  displayName: 'Portable AI Chief of Staff',
  shortDescription: 'Plans and carries out only approved work through buyer-supplied ports.',
  longDescription: 'A portable planning layer designed to coordinate approved work through buyer-supplied ports while preserving human control.',
  category: 'operations',
  status: 'preview',
  maturity: 'preview',
  publicVisible: true,
  licensingAvailable: false,
  targetAudience: Object.freeze(['business owners', 'operations teams']),
  requiredCapabilities: Object.freeze(['planning', 'approval-gates']),
  optionalCapabilities: Object.freeze(['buyer-supplied-ports']),
  dependencies: Object.freeze(['portable-kernel']),
  exclusions: Object.freeze(['autonomous-consequential-actions']),
  architectureReferences: Object.freeze(['COS', 'portable-kernel']),
  documentationReferences: Object.freeze(['docs/portables/cos-host-integration-guide.md']),
  futureFeatures: Object.freeze(['licensing-activation']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})