import type { RevenueProviderContext, RevenueSecretReference } from './contracts'

function resolveOne(reference: RevenueSecretReference): string {
  if (reference.kind !== 'environment') {
    throw new Error(`REVENUE_SECRET_RESOLVER_UNSUPPORTED:${reference.kind}`)
  }
  const value = process.env[reference.reference]
  if (!value) throw new Error(`REVENUE_SECRET_MISSING:${reference.reference}`)
  return value
}

export function resolveRevenueSecret(context: RevenueProviderContext, referenceName: string): string {
  const reference = context.secretReferences.find(item => item.reference === referenceName)
  if (!reference) throw new Error(`REVENUE_SECRET_REFERENCE_MISSING:${referenceName}`)
  return resolveOne(reference)
}

export function resolveRevenueSecrets(context: RevenueProviderContext): Record<string, string> {
  return Object.fromEntries(context.secretReferences.map(reference => [reference.reference, resolveOne(reference)]))
}
