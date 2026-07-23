import type { PortableProductManifest } from '../manifestTypes.ts'

export const videoMakerManifest: PortableProductManifest = Object.freeze({
  productId: 'video-maker',
  displayName: 'Video Maker',
  shortDescription: 'Voice and branded video with governed prepaid use.',
  longDescription: 'A portable media workflow for creating branded video artifacts with human approval retained before publishing.',
  category: 'media',
  status: 'live',
  maturity: 'production',
  publicVisible: true,
  licensingAvailable: true,
  targetAudience: Object.freeze(['marketing teams', 'content teams']),
  requiredCapabilities: Object.freeze(['video-rendering', 'human-approval']),
  optionalCapabilities: Object.freeze(['voice', 'captions']),
  dependencies: Object.freeze(['approved-media-provider']),
  exclusions: Object.freeze(['unapproved-publishing']),
  architectureReferences: Object.freeze(['render-core', 'render-host']),
  documentationReferences: Object.freeze(['docs/portables/render-module.md']),
  futureFeatures: Object.freeze(['package-presets']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})