import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { getUniversalProviderRegistry } from '@/lib/provider-framework'

// Read-only inventory of every provider registered in the canonical Universal
// Provider Framework registry. Admin-only. Returns sanitized metadata only —
// no credentials, no tokens, no mutation. This is the live proof the framework
// is wired: hit it and you see the registered providers + their capabilities.
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const providers = getUniversalProviderRegistry().toMetadata().map((m) => ({
    providerId: m.providerId,
    displayNameKey: m.displayNameKey,
    lifecycle: m.health.lifecycle,
    version: m.version.providerVersion,
    supportedChannels: m.supportedChannels,
    supportedEnvironments: m.supportedEnvironments,
    capabilityCount: m.capabilities.length,
    capabilities: m.capabilities.map((c) => ({
      capabilityId: c.capabilityId,
      riskClass: c.riskClass,
      readOnly: c.readOnly,
      maturity: c.maturity,
      requiresApproval: c.requiresApproval,
    })),
  }))

  return NextResponse.json({ schemaVersion: 'universal-provider-registry-v1', count: providers.length, providers })
}
