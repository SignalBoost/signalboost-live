// saas/lib/portable-products/manifests/index.ts
import { agentOperationsPlatformManifest } from './agentOperationsPlatform.ts'
import { browserAgentEcosystemManifest } from './browserAgentEcosystem.ts'
import { campaignStudioManifest } from './campaignStudio.ts'
import { controlCenterManifest } from './controlCenter.ts'
import { integrationsHubManifest } from './integrationsHub.ts'
import { marketingSalesManifest } from './marketingSales.ts'
import { portableChiefOfStaffManifest } from './portableChiefOfStaff.ts'
import { pressMediaManifest } from './pressMedia.ts'
import { providerHubManifest } from './providerHub.ts'
import { selfHealingSupervisorManifest } from './selfHealingSupervisor.ts'
import { videoMakerManifest } from './videoMaker.ts'

export { agentOperationsPlatformManifest, browserAgentEcosystemManifest, campaignStudioManifest, controlCenterManifest, integrationsHubManifest, marketingSalesManifest, portableChiefOfStaffManifest, pressMediaManifest, providerHubManifest, selfHealingSupervisorManifest, videoMakerManifest }

export const portableProductManifests = Object.freeze([
  providerHubManifest, campaignStudioManifest, integrationsHubManifest, videoMakerManifest, controlCenterManifest,
  marketingSalesManifest, pressMediaManifest, portableChiefOfStaffManifest,
  browserAgentEcosystemManifest, agentOperationsPlatformManifest, selfHealingSupervisorManifest,
])
