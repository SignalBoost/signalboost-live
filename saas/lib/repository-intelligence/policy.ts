import type { RepositoryScanOptions } from './contracts.ts'

export interface RepositoryIntelligencePolicy {
  maximumFiles: number
  maximumFileSizeBytes: number
  maximumTotalBytes: number
  maximumSelectedContextFiles: number
  maximumSelectedContextBytes: number
  maximumDirectoryDepth: number
  maximumWarningCount: number
  followSymbolicLinks: boolean
  includeHiddenFiles: boolean
  readBinaryFiles: boolean
  networkAccess: boolean
  repositoryWrites: boolean
  excludedDirectoryNames: readonly string[]
  secretPatterns: readonly string[]
}

const DEFAULT_EXCLUDED_DIRECTORIES = Object.freeze([
  '.git', 'node_modules', '.next', 'dist', 'build', 'coverage', 'tmp', 'temp',
  '.cache', '.vercel', 'out', 'vendor', 'generated', 'artifacts',
  'playwright-report', 'test-results',
])

const MANDATORY_SECRET_PATTERNS = Object.freeze([
  '.env', '.env.*', 'credentials', 'credential', 'secrets', 'secret', 'token',
  'tokens', 'private-key', 'id_rsa', 'id_ed25519', 'service-account', '*.pem',
  '*.key', '*.p12', '*.pfx',
])

export const DEFAULT_REPOSITORY_INTELLIGENCE_POLICY: Readonly<RepositoryIntelligencePolicy> = Object.freeze({
  maximumFiles: 10_000,
  maximumFileSizeBytes: 512 * 1024,
  maximumTotalBytes: 50 * 1024 * 1024,
  maximumSelectedContextFiles: 20,
  maximumSelectedContextBytes: 1024 * 1024,
  maximumDirectoryDepth: 30,
  maximumWarningCount: 100,
  followSymbolicLinks: false,
  includeHiddenFiles: false,
  readBinaryFiles: false,
  networkAccess: false,
  repositoryWrites: false,
  excludedDirectoryNames: DEFAULT_EXCLUDED_DIRECTORIES,
  secretPatterns: MANDATORY_SECRET_PATTERNS,
})

export interface RepositoryPolicyIssue {
  field: string
  reason: string
}

export function resolveRepositoryScanPolicy(options: RepositoryScanOptions): Readonly<RepositoryIntelligencePolicy & RepositoryScanOptions> {
  return Object.freeze({
    ...DEFAULT_REPOSITORY_INTELLIGENCE_POLICY,
    ...options,
    excludedDirectoryNames: Object.freeze([
      ...new Set([
        ...DEFAULT_REPOSITORY_INTELLIGENCE_POLICY.excludedDirectoryNames,
        ...(options.excludedDirectoryNames ?? []),
      ]),
    ]),
    secretPatterns: Object.freeze([
      ...new Set([
        ...DEFAULT_REPOSITORY_INTELLIGENCE_POLICY.secretPatterns,
        ...(options.secretPatterns ?? []),
      ]),
    ]),
  })
}

export function validateRepositoryScanOptions(options: RepositoryScanOptions): readonly RepositoryPolicyIssue[] {
  const policy = resolveRepositoryScanPolicy(options)
  const issues: RepositoryPolicyIssue[] = []

  for (const field of ['maximumFiles', 'maximumFileSizeBytes', 'maximumTotalBytes', 'maximumDirectoryDepth'] as const) {
    if (!Number.isFinite(policy[field]) || policy[field] <= 0) {
      issues.push({ field, reason: 'must_be_a_positive_finite_number' })
    }
  }

  if (policy.repositoryWrites) issues.push({ field: 'repositoryWrites', reason: 'writes_not_permitted' })
  if (policy.networkAccess) issues.push({ field: 'networkAccess', reason: 'network_not_permitted' })
  if (policy.followSymbolicLinks) issues.push({ field: 'followSymbolicLinks', reason: 'symbolic_links_not_permitted' })
  if (policy.readBinaryFiles) issues.push({ field: 'readBinaryFiles', reason: 'binary_inspection_not_permitted' })

  return Object.freeze(issues)
}

export function isSecretLikePath(
  relativePath: string,
  patterns: readonly string[] = DEFAULT_REPOSITORY_INTELLIGENCE_POLICY.secretPatterns,
): boolean {
  const value = relativePath.toLowerCase()
  const effectivePatterns = [
    ...new Set([
      ...DEFAULT_REPOSITORY_INTELLIGENCE_POLICY.secretPatterns,
      ...patterns,
    ]),
  ]

  return effectivePatterns.some(pattern => {
    const expression = pattern.toLowerCase().replace(/\./g, '\\.').replace(/\*/g, '.*')
    return new RegExp(`(^|/)${expression}($|/)`).test(value) || new RegExp(`${expression}$`).test(value)
  })
}
