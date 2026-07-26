// saas/press-media-host/index.ts
// Press & Media portable — host assembly. This is the one place a host (SignalBoost today,
// a buyer tomorrow) turns the host-agnostic core into a live pipeline: it builds the default
// registry (free reference adapter), lets the host register its own PAID adapters, wires the
// real Ports (callModel / Resend / owner email), and returns the engine methods pre-bound.
//
// Plug-and-play: a new provider is one line —
//   const host = createPressMediaHost((r) => { r.register(createPrWireAdapter()) })
// The engine, spend gate, approval queue and proof handling never change.
import { createDefaultMediaRegistry, createPrWireAdapter, createAdPlatformAdapter, createDirectIoAdapter, createMediaDatabaseAdapter, type MediaProviderRegistry } from '@/press-media-core'
import { createHostPorts } from './ports.ts'
import {
  runCampaign, dispatchApprovedCampaign, recordPublishedUrl, updateCampaignCopy,
  type PressMediaContext, type RunCampaignArgs, type RunCampaignResult,
} from './engine.ts'

export * from './ports.ts'
export * from './engine.ts'

export interface PressMediaHost {
  registry: MediaProviderRegistry
  ports: PortBundleLike
  runCampaign(args: RunCampaignArgs): Promise<RunCampaignResult>
  dispatchApprovedCampaign(campaignId: string): Promise<RunCampaignResult>
  recordPublishedUrl(campaignId: string, url: string): Promise<RunCampaignResult>
  updateCampaignCopy(campaignId: string, copy: string): Promise<RunCampaignResult>
}

// Local structural alias so we don't re-export the core PortBundle name here.
type PortBundleLike = ReturnType<typeof createHostPorts>

export function createPressMediaHost(register?: (registry: MediaProviderRegistry) => void): PressMediaHost {
  const registry = createDefaultMediaRegistry()
  // All five provider types are registered; each stays "coming soon" in the cockpit until it
  // is actually connected (a provider_registry row + credential). Connect activates it.
  registry.register(createPrWireAdapter())
  registry.register(createAdPlatformAdapter())
  registry.register(createDirectIoAdapter())
  registry.register(createMediaDatabaseAdapter())
  if (register) register(registry)                 // a buyer-host can add more paid adapters here
  const ports = createHostPorts()
  const ctx: PressMediaContext = { registry, ports }

  return {
    registry,
    ports,
    runCampaign: (args) => runCampaign(ctx, args),
    dispatchApprovedCampaign: (campaignId) => dispatchApprovedCampaign(ctx, campaignId),
    recordPublishedUrl: (campaignId, url) => recordPublishedUrl(ctx, campaignId, url),
    updateCampaignCopy: (campaignId, copy) => updateCampaignCopy(ctx, campaignId, copy),
  }
}

// Cached default host for SignalBoost's own routes (free adapter only).
let cached: PressMediaHost | null = null
export function getPressMediaHost(): PressMediaHost {
  if (!cached) cached = createPressMediaHost()
  return cached
}
