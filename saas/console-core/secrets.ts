// saas/console-core/secrets.ts
// The single place console-core reads provider credentials. Executors call getSecret(key)
// instead of process.env[key], so a Fortune-500 host points every provider at THEIR vault
// (AWS Secrets Manager, HashiCorp Vault, Azure Key Vault) by installing one resolver at boot.
// The default resolver reads process.env, so SignalBoost's own deployment is unchanged.

export interface SecretsResolver {
  get(key: string): string | undefined
}

const envResolver: SecretsResolver = { get: (k) => process.env[k] }
let active: SecretsResolver = envResolver

// A host installs its vault-backed resolver once, at startup (createHost() does this for it).
export function setSecretsResolver(resolver: SecretsResolver): void {
  active = resolver || envResolver
}

// Every executor resolves provider credentials through this — never process.env directly.
export function getSecret(key: string): string | undefined {
  return active.get(key)
}
