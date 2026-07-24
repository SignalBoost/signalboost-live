export interface CommercialPortabilityContract {
  readonly schemaVersion: 'v1'
  readonly productScope: 'standalone_commercial_product'
  readonly companyNeutral: true
  readonly buyerOwnedConfiguration: readonly string[]
  readonly supportedDeploymentModels: readonly string[]
  readonly requiredDistributionArtifacts: readonly string[]
  readonly forbiddenCoreDependencies: readonly string[]
  readonly labIntegrationMode: 'optional_reference_adapter_only'
}

function freezeStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values])
}

/**
 * Product-level boundary for the portable Browser Agent.
 *
 * The repository is a development and validation lab. The commercial core must
 * remain installable by unrelated companies without lab-specific services,
 * identities, domains, databases, deployment targets, or business workflows.
 */
export const browserAgentCommercialPortabilityContract: CommercialPortabilityContract = Object.freeze({
  schemaVersion: 'v1',
  productScope: 'standalone_commercial_product',
  companyNeutral: true,
  buyerOwnedConfiguration: freezeStrings([
    'credentials',
    'provider_selection',
    'approved_origins',
    'policies',
    'branding',
    'telemetry',
    'storage',
    'networking',
    'deployment',
  ]),
  supportedDeploymentModels: freezeStrings([
    'npm_package',
    'container',
    'self_hosted_service',
    'customer_cloud',
    'embedded_sdk',
  ]),
  requiredDistributionArtifacts: freezeStrings([
    'versioned_package',
    'configuration_schema',
    'installation_guide',
    'integration_contracts',
    'health_check',
    'upgrade_guide',
    'security_boundaries',
    'reference_deployment',
  ]),
  forbiddenCoreDependencies: freezeStrings([
    'lab_brand_identity',
    'lab_domains',
    'lab_database_schema',
    'lab_authentication',
    'lab_deployment_platform',
    'lab_business_workflows',
  ]),
  labIntegrationMode: 'optional_reference_adapter_only',
})

export function validateCommercialPortabilityContract(value: unknown): value is CommercialPortabilityContract {
  if (!value || typeof value !== 'object') return false
  const contract = value as Partial<CommercialPortabilityContract>
  return contract.schemaVersion === 'v1'
    && contract.productScope === 'standalone_commercial_product'
    && contract.companyNeutral === true
    && contract.labIntegrationMode === 'optional_reference_adapter_only'
    && Array.isArray(contract.buyerOwnedConfiguration)
    && contract.buyerOwnedConfiguration.length > 0
    && Array.isArray(contract.supportedDeploymentModels)
    && contract.supportedDeploymentModels.length > 0
    && Array.isArray(contract.requiredDistributionArtifacts)
    && contract.requiredDistributionArtifacts.length > 0
    && Array.isArray(contract.forbiddenCoreDependencies)
    && contract.forbiddenCoreDependencies.length > 0
}
