import type { BrowserProviderAdapter, LocalizedText } from '../provider-adapter.ts'
import type { ProviderCapability } from '../provider-capability.ts'
import type { EvidenceProfile } from '../provider-evidence.ts'
import type { NavigationProfile } from '../provider-navigation.ts'
import type { OriginId, OriginProfile } from '../provider-origin.ts'
import type { ProviderSelector } from '../provider-selector.ts'
import type { VerificationProfile } from '../provider-verification.ts'
import { BPAL_SCHEMA_VERSION } from '../provider-version.ts'

const version = {
  provider: '1.0.0',
  capability: '1.0.0',
  schema: BPAL_SCHEMA_VERSION,
} as const

const displayName: LocalizedText = {
  en: 'Vercel',
  es: 'Vercel',
  pt: 'Vercel',
  pl: 'Vercel',
  ru: 'Vercel',
}

function origin(id: OriginId): OriginProfile {
  return {
    id,
    origin: 'https://vercel.com',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  }
}

const origins: readonly OriginProfile[] = [
  origin('dashboard'),
  origin('projects'),
  origin('deployments'),
  origin('domains'),
  origin('settings'),
  origin('login'),
  origin('metadata'),
]

const navigation: readonly NavigationProfile[] = [
  {
    id: 'dashboard-overview',
    origin: 'dashboard',
    pathTemplate: '/dashboard',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'deployment-list',
    origin: 'deployments',
    pathTemplate: '/dashboard/deployments',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'deployment-detail',
    origin: 'deployments',
    pathTemplate: '/dashboard/deployments/:id',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'project-settings',
    origin: 'settings',
    pathTemplate: '/dashboard/:team/:project/settings',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'domains',
    origin: 'domains',
    pathTemplate: '/dashboard/:team/:project/settings/domains',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'environment-metadata',
    origin: 'settings',
    pathTemplate: '/dashboard/:team/:project/settings/environment-variables',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'logs',
    origin: 'deployments',
    pathTemplate: '/dashboard/:team/:project/deployments/:id/logs',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
]

const selectors: readonly ProviderSelector[] = [
  {
    id: 'dashboard.project-count',
    group: 'projects',
    selector: '[data-testid="project-count"]',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'deployments.status',
    group: 'deployments',
    selector: '[data-testid="deployment-status"]',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'deployments.logs',
    group: 'logs',
    selector: '[data-testid="deployment-logs"]',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'domains.status',
    group: 'domains',
    selector: '[data-testid="domain-status"]',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'projects.name',
    group: 'projects',
    selector: '[data-testid="project-name"]',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'settings.environment',
    group: 'settings',
    selector: '[data-testid="environment-variables"]',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'authentication.login',
    group: 'authentication',
    selector: 'form[action*="login"]',
    readOnly: true,
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
]

const verification: readonly VerificationProfile[] = [
  {
    id: 'deployment-healthy',
    assertions: ['status=ready'],
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'deployment-failed',
    assertions: ['status=error'],
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'domain-configured',
    assertions: ['domain=configured'],
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'project-visible',
    assertions: ['project=visible'],
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'environment-metadata-visible',
    assertions: ['metadata=visible'],
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
]

const evidence: readonly EvidenceProfile[] = [
  {
    id: 'deployment-failure',
    expectedScreenshots: ['logs'],
    expectedReads: ['deployments.status', 'deployments.logs'],
    expectedMetadata: ['deploymentId'],
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'deployment-success',
    expectedScreenshots: ['deployment-detail'],
    expectedReads: ['deployments.status'],
    expectedMetadata: ['deploymentId'],
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'dashboard-overview',
    expectedScreenshots: ['dashboard-overview'],
    expectedReads: ['dashboard.project-count'],
    expectedMetadata: ['team'],
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'project-metadata',
    expectedScreenshots: ['project-settings'],
    expectedReads: ['projects.name'],
    expectedMetadata: ['projectId'],
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'environment-metadata',
    expectedScreenshots: ['environment-metadata'],
    expectedReads: ['settings.environment'],
    expectedMetadata: ['projectId'],
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
  {
    id: 'domain-state',
    expectedScreenshots: ['domains'],
    expectedReads: ['domains.status'],
    expectedMetadata: ['domain'],
    schemaVersion: BPAL_SCHEMA_VERSION,
  },
]

function capability(
  id: string,
  options: Pick<
    ProviderCapability,
    | 'supportsApi'
    | 'verificationProfile'
    | 'evidenceProfile'
    | 'navigationProfile'
    | 'allowedOrigins'
  >,
): ProviderCapability {
  return {
    id,
    operation: id,
    descriptionKey: `provider.vercel.capability.${id}`,
    risk: 'read_only',
    maturity: 'sandbox_verified',
    readOnly: true,
    supportsApi: options.supportsApi,
    supportsBrowser: true,
    supportsAutoFailover: false,
    supportsBrowserOnDemand: true,
    verificationProfile: options.verificationProfile,
    evidenceProfile: options.evidenceProfile,
    navigationProfile: options.navigationProfile,
    allowedOrigins: options.allowedOrigins,
    version,
  }
}

const capabilities: readonly ProviderCapability[] = [
  capability('read-deployment-status', {
    supportsApi: false,
    verificationProfile: 'deployment-healthy',
    evidenceProfile: 'deployment-success',
    navigationProfile: 'deployment-list',
    allowedOrigins: ['deployments'],
  }),
  capability('read-deployment-logs', {
    supportsApi: false,
    verificationProfile: 'deployment-failed',
    evidenceProfile: 'deployment-failure',
    navigationProfile: 'logs',
    allowedOrigins: ['deployments'],
  }),
  capability('read-deployment-failure', {
    supportsApi: false,
    verificationProfile: 'deployment-failed',
    evidenceProfile: 'deployment-failure',
    navigationProfile: 'logs',
    allowedOrigins: ['deployments'],
  }),
  capability('read-domain-status', {
    supportsApi: false,
    verificationProfile: 'domain-configured',
    evidenceProfile: 'domain-state',
    navigationProfile: 'domains',
    allowedOrigins: ['domains'],
  }),
  capability('read-project-metadata', {
    supportsApi: false,
    verificationProfile: 'project-visible',
    evidenceProfile: 'project-metadata',
    navigationProfile: 'project-settings',
    allowedOrigins: ['settings'],
  }),
  capability('read-environment-variable-metadata', {
    supportsApi: false,
    verificationProfile: 'environment-metadata-visible',
    evidenceProfile: 'environment-metadata',
    navigationProfile: 'environment-metadata',
    allowedOrigins: ['settings'],
  }),
  capability('capture-dashboard-evidence', {
    supportsApi: false,
    verificationProfile: 'project-visible',
    evidenceProfile: 'dashboard-overview',
    navigationProfile: 'dashboard-overview',
    allowedOrigins: ['dashboard'],
  }),
  capability('compare-dashboard-vs-api', {
    supportsApi: true,
    verificationProfile: 'deployment-healthy',
    evidenceProfile: 'deployment-success',
    navigationProfile: 'deployment-detail',
    allowedOrigins: ['deployments'],
  }),
]

export const vercelProvider: BrowserProviderAdapter = {
  id: 'vercel',
  displayName,
  version,
  health: {
    state: 'unknown',
    checkedAt: '1970-01-01T00:00:00.000Z',
  },
  executionModes: ['read_only'],
  autoFailoverSupported: false,
  browserOnDemandSupported: true,
  readOnlySupported: true,
  productionSupported: true,
  origins,
  navigation,
  selectors,
  verification,
  evidence,
  capabilities,
}
