import type { PortableProductManifest } from './manifestTypes.ts'
import { portableProductManifests, campaignStudioManifest, integrationsHubManifest, videoMakerManifest, controlCenterManifest, marketingSalesManifest, pressMediaManifest, portableChiefOfStaffManifest, browserAgentEcosystemManifest, agentOperationsPlatformManifest, selfHealingSupervisorManifest } from './manifests/index.ts'
import { validatePortableProductManifests } from './manifestValidation.ts'
import type { PortableProductDescriptor } from './product-types.ts'
import { validatePortableProductRegistry } from './product-validation.ts'

function product(manifest: PortableProductManifest, descriptor: Omit<PortableProductDescriptor, 'manifest'>): PortableProductDescriptor {
  return Object.freeze({ manifest, ...descriptor })
}

validatePortableProductManifests(portableProductManifests)
/** Canonical presentation catalog. Product metadata lives only in the referenced manifests. */
export const portableProductRegistry = Object.freeze([
  product(campaignStudioManifest, { localizationKey: 'campaign', glyph: '✦', implementationStatus: 'implemented', implementationClassification: 'implemented_product', sortOrder: 10, route: '/agency' }),
  product(integrationsHubManifest, { localizationKey: 'integrations', glyph: '⛓', implementationStatus: 'implemented', implementationClassification: 'implemented_product', sortOrder: 20 }),
  product(videoMakerManifest, { localizationKey: 'render', glyph: '◍', implementationStatus: 'implemented', implementationClassification: 'implemented_product', sortOrder: 30 }),
  product(controlCenterManifest, { localizationKey: 'console', glyph: '◈', implementationStatus: 'implemented', implementationClassification: 'implemented_product', sortOrder: 40 }),
  product(marketingSalesManifest, { localizationKey: 'marketingSales', glyph: '◎', implementationStatus: 'implemented', implementationClassification: 'implemented_product', sortOrder: 50 }),
  product(pressMediaManifest, { localizationKey: 'press', glyph: '◉', implementationStatus: 'implemented', implementationClassification: 'implemented_product', sortOrder: 60 }),
  product(portableChiefOfStaffManifest, { localizationKey: 'chiefOfStaff', glyph: '❖', implementationStatus: 'preview', implementationClassification: 'preview_product', sortOrder: 70 }),
  product(browserAgentEcosystemManifest, { localizationKey: 'browserAgents', glyph: '◇', implementationStatus: 'descriptor_only', implementationClassification: 'descriptor_only_compatibility_target', sortOrder: 80 }),
  product(agentOperationsPlatformManifest, { localizationKey: 'agentOperations', glyph: '⌁', implementationStatus: 'preview', implementationClassification: 'preview_product', sortOrder: 90 }),
  product(selfHealingSupervisorManifest, { localizationKey: 'selfHealing', glyph: '⟲', implementationStatus: 'preview', implementationClassification: 'preview_product', sortOrder: 100 }),
])

validatePortableProductRegistry(portableProductRegistry)