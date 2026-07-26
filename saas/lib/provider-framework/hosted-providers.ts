// saas/lib/provider-framework/hosted-providers.ts
import { randomUUID } from 'node:crypto'
import {
  UNIVERSAL_PROVIDER_SCHEMA_VERSION,
  type UniversalProviderCapability,
  type UniversalProviderHealth,
  type UniversalProviderMetadata,
  type UniversalProviderSdk,
} from './types.ts'

type HostedProviderDefinition = {
  readonly providerId: string
  readonly auth: 'api_key' | 'bearer_token'
  readonly capabilities: readonly string[]
}

export type HostedProviderError = {
  readonly kind: 'unsupported_mutation' | 'configuration'
  readonly message: string
  readonly retryable: false
}

export type HostedProviderResult<T> =
  | { readonly ok: true; readonly value: T; readonly evidence: readonly HostedProviderEvidence[] }
  | { readonly ok: false; readonly error: HostedProviderError; readonly evidence: readonly HostedProviderEvidence[] }

export type HostedProviderEvidence = {
  readonly evidenceId: string
  readonly summary: string
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>
}

const evidence = (
  summary: string,
  metadata: HostedProviderEvidence['metadata'] = {},
): HostedProviderEvidence => ({
  evidenceId: `evidence_${randomUUID()}`,
  summary,
  metadata,
})

function capability(providerId: string, capabilityId: string): UniversalProviderCapability {
  return {
    capabilityId,
    displayNameKey: `universalProvider.${providerId}.capabilities.${capabilityId}.title`,
    descriptionKey: `universalProvider.${providerId}.capabilities.${capabilityId}.description`,
    version: '1.0.0',
    maturity: 'sandbox_verified',
    riskClass: 'read_only',
    channels: ['api', 'scheduler'],
    environments: ['sandbox', 'preview', 'production'],
    authentication: ['api_key'],
    requiresApproval: false,
    readOnly: true,
    rateLimit: { windowSeconds: 300, maxRequests: 1000, scope: 'credential' },
    timeout: { connectMs: 3000, readMs: 10000, totalMs: 15000 },
    retryPolicy: { maxAttempts: 3, backoff: 'exponential', baseDelayMs: 500, maxDelayMs: 10000 },
    scheduler: {
      supported: true,
      minimumIntervalSeconds: 300,
      jitterSupported: true,
      localizationKey: `universalProvider.${providerId}.scheduler`,
    },
    evidenceProviderIds: [`${providerId}_api_snapshot`],
    verificationProviderIds: [`${providerId}_current_state`],
  }
}

export class HostedReadOnlyProviderAdapter implements UniversalProviderSdk {
  readonly metadata: UniversalProviderMetadata

  readonly definition: HostedProviderDefinition
  constructor(definition: HostedProviderDefinition) { this.definition = definition;
    this.metadata = Object.freeze<UniversalProviderMetadata>({
      providerId: definition.providerId,
      displayNameKey: `universalProvider.${definition.providerId}.displayName`,
      descriptionKey: `universalProvider.${definition.providerId}.description`,
      version: {
        providerVersion: '1.0.0',
        sdkVersion: `${definition.providerId}-readonly-v1`,
        capabilityCatalogVersion: `${definition.providerId}-readonly-1`,
        schemaVersion: UNIVERSAL_PROVIDER_SCHEMA_VERSION,
        compatibleSchemaVersions: [UNIVERSAL_PROVIDER_SCHEMA_VERSION],
      },
      health: { lifecycle: 'registered', checkedAt: '1970-01-01T00:00:00.000Z' },
      capabilities: definition.capabilities.map((id) => capability(definition.providerId, id)),
      supportedChannels: ['api', 'scheduler'],
      supportedAuthentication: ['api_key'],
      supportedEnvironments: ['sandbox', 'preview', 'production'],
      supportedRegions: ['global'],
      configurationSchema: {
        schemaId: `${definition.providerId}.connection.v1`,
        version: '1.0.0',
        fields: [
          {
            key: 'credential_ref',
            type: 'secret_ref',
            required: true,
            labelKey: `universalProvider.${definition.providerId}.config.credentialRef`,
          },
        ],
      },
      webhook: { supported: false, eventTypes: [], signatureSchemes: [], replayProtection: false },
      scheduler: {
        supported: true,
        minimumIntervalSeconds: 300,
        jitterSupported: true,
        localizationKey: `universalProvider.${definition.providerId}.scheduler`,
      },
      operator: {
        ownerTeamKey: 'universalProvider.operator.ownerTeam',
        documentationKey: `universalProvider.${definition.providerId}.documentation`,
      },
    })
  }

  listCapabilities() {
    return this.metadata.capabilities
  }

  getCapability(capabilityId: string) {
    return this.metadata.capabilities.find((item) => item.capabilityId === capabilityId)
  }

  getHealth(): UniversalProviderHealth {
    return this.metadata.health
  }

  getVersion() {
    return this.metadata.version
  }

  rejectMutation(operation: string): HostedProviderResult<never> {
    return {
      ok: false,
      error: {
        kind: 'unsupported_mutation',
        message: `${this.definition.providerId} mutation '${operation}' is not supported by the read-only adapter`,
        retryable: false,
      },
      evidence: [evidence('Rejected unsupported provider mutation', { providerId: this.definition.providerId, operation })],
    }
  }
}

const definitions = {
  digitalocean: {
    providerId: 'digitalocean',
    auth: 'bearer_token',
    capabilities: ['digitalocean.connection.validate','digitalocean.account.read','digitalocean.droplets.list','digitalocean.kubernetes.clusters.list','digitalocean.databases.list','digitalocean.apps.list','digitalocean.load_balancers.list','digitalocean.volumes.list','digitalocean.domains.list','digitalocean.projects.list'],
  },
  vercel: {
    providerId: 'vercel',
    auth: 'bearer_token',
    capabilities: ['vercel.connection.validate','vercel.user.read','vercel.teams.list','vercel.projects.list','vercel.deployments.list','vercel.domains.list','vercel.environment_variables.metadata.list','vercel.logs.read','vercel.integrations.list','vercel.audit_log.read'],
  },
  netlify: {
    providerId: 'netlify',
    auth: 'bearer_token',
    capabilities: ['netlify.connection.validate','netlify.user.read','netlify.accounts.list','netlify.sites.list','netlify.deploys.list','netlify.domains.list','netlify.forms.list','netlify.functions.list','netlify.environment_variables.metadata.list','netlify.audit_log.read'],
  },
  railway: {
    providerId: 'railway',
    auth: 'bearer_token',
    capabilities: ['railway.connection.validate','railway.user.read','railway.workspaces.list','railway.projects.list','railway.environments.list','railway.services.list','railway.deployments.list','railway.domains.list','railway.variables.metadata.list','railway.usage.read'],
  },
  render: {
    providerId: 'render',
    auth: 'bearer_token',
    capabilities: ['render.connection.validate','render.owner.read','render.services.list','render.deploys.list','render.databases.list','render.static_sites.list','render.cron_jobs.list','render.custom_domains.list','render.environment_variables.metadata.list','render.metrics.read'],
  },
  flyio: {
    providerId: 'flyio',
    auth: 'bearer_token',
    capabilities: ['flyio.connection.validate','flyio.organizations.list','flyio.apps.list','flyio.machines.list','flyio.volumes.list','flyio.certificates.list','flyio.allocations.list','flyio.releases.list','flyio.secrets.metadata.list','flyio.metrics.read'],
  },
  cloudinary: {
    providerId: 'cloudinary',
    auth: 'api_key',
    capabilities: ['cloudinary.connection.validate','cloudinary.account.read','cloudinary.resources.list','cloudinary.folders.list','cloudinary.transformations.list','cloudinary.usage.read','cloudinary.upload_presets.list','cloudinary.streaming_profiles.list','cloudinary.metadata_fields.list','cloudinary.audit_log.read'],
  },
  bunnycdn: {
    providerId: 'bunnycdn',
    auth: 'api_key',
    capabilities: ['bunnycdn.connection.validate','bunnycdn.account.read','bunnycdn.pull_zones.list','bunnycdn.storage_zones.list','bunnycdn.dns_zones.list','bunnycdn.hostnames.list','bunnycdn.certificates.list','bunnycdn.statistics.read','bunnycdn.edge_rules.list','bunnycdn.audit_log.read'],
  },
  upstash: {
    providerId: 'upstash',
    auth: 'api_key',
    capabilities: ['upstash.connection.validate','upstash.team.read','upstash.redis.databases.list','upstash.kafka.clusters.list','upstash.qstash.schedules.list','upstash.qstash.endpoints.list','upstash.vector.indexes.list','upstash.usage.read','upstash.regions.list','upstash.audit_log.read'],
  },
  neon: {
    providerId: 'neon',
    auth: 'api_key',
    capabilities: ['neon.connection.validate','neon.user.read','neon.organizations.list','neon.projects.list','neon.branches.list','neon.endpoints.list','neon.databases.list','neon.roles.metadata.list','neon.operations.list','neon.consumption.read'],
  },
  planetscale: {
    providerId: 'planetscale',
    auth: 'api_key',
    capabilities: ['planetscale.connection.validate','planetscale.organizations.list','planetscale.databases.list','planetscale.branches.list','planetscale.deploy_requests.list','planetscale.backups.list','planetscale.regions.list','planetscale.audit_log.read','planetscale.usage.read','planetscale.service_tokens.metadata.list'],
  },
  mongodbAtlas: {
    providerId: 'mongodb-atlas',
    auth: 'api_key',
    capabilities: ['mongodb_atlas.connection.validate','mongodb_atlas.organizations.list','mongodb_atlas.projects.list','mongodb_atlas.clusters.list','mongodb_atlas.database_users.metadata.list','mongodb_atlas.network_access.list','mongodb_atlas.alerts.list','mongodb_atlas.backups.list','mongodb_atlas.events.read','mongodb_atlas.usage.read'],
  },
} as const satisfies Record<string, HostedProviderDefinition>

export const DigitalOceanProvider = new HostedReadOnlyProviderAdapter(definitions.digitalocean)
export const VercelProvider = new HostedReadOnlyProviderAdapter(definitions.vercel)
export const NetlifyProvider = new HostedReadOnlyProviderAdapter(definitions.netlify)
export const RailwayProvider = new HostedReadOnlyProviderAdapter(definitions.railway)
export const RenderProvider = new HostedReadOnlyProviderAdapter(definitions.render)
export const FlyIoProvider = new HostedReadOnlyProviderAdapter(definitions.flyio)
export const CloudinaryProvider = new HostedReadOnlyProviderAdapter(definitions.cloudinary)
export const BunnyCdnProvider = new HostedReadOnlyProviderAdapter(definitions.bunnycdn)
export const UpstashProvider = new HostedReadOnlyProviderAdapter(definitions.upstash)
export const NeonProvider = new HostedReadOnlyProviderAdapter(definitions.neon)
export const PlanetScaleProvider = new HostedReadOnlyProviderAdapter(definitions.planetscale)
export const MongoDbAtlasProvider = new HostedReadOnlyProviderAdapter(definitions.mongodbAtlas)

export const HostedReadOnlyProviders = Object.freeze([
  DigitalOceanProvider,
  VercelProvider,
  NetlifyProvider,
  RailwayProvider,
  RenderProvider,
  FlyIoProvider,
  CloudinaryProvider,
  BunnyCdnProvider,
  UpstashProvider,
  NeonProvider,
  PlanetScaleProvider,
  MongoDbAtlasProvider,
] as const)
