// saas/lib/integrations/catalog-security.ts
// Audit, cybersecurity, and compliance providers — registered as the same plug-and-play
// adapters as the sales stack. GitHub Advanced Security and Snyk are wired REAL (both
// directly API-callable) to prove the audit path end to end; the rest are cataloged with
// their task templates and light up the moment a method is implemented. Honest throughout.
import type { IntegrationProvider, IntegrationContext, IntegrationResult } from './types'
import { registerProvider } from './registry'

const ok = (data: any, mode: string): IntegrationResult => ({ ok: true, data, mode })
const bad = (mode: string, error?: string): IntegrationResult => ({ ok: false, mode, error })

function repoOf(ctx: IntegrationContext, args: Record<string, any>): string | null {
  const r = (args.repo || ctx.accountRef || '').trim()
  return /^[^/\s]+\/[^/\s]+$/.test(r) ? r : null
}
async function ghAlerts(ctx: IntegrationContext, repo: string, kind: string): Promise<IntegrationResult> {
  const res = await fetch(`https://api.github.com/repos/${repo}/${kind}`, {
    headers: { Authorization: `Bearer ${ctx.accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'SignalBoost', 'X-GitHub-Api-Version': '2022-11-28' },
  })
  const d: any = await res.json().catch(() => ([]))
  if (!res.ok) return bad('github_scan_failed', (d && d.message) || `http_${res.status}`)
  const alerts = Array.isArray(d) ? d : []
  return ok({ count: alerts.length, alerts: alerts.slice(0, 50) }, `github_${kind.replace(/[^a-z]/gi, '_')}`)
}

// ── Audit / patch ────────────────────────────────────────────────────────────────
const githubSecurity: IntegrationProvider = {
  id: 'github_security', label: 'GitHub Advanced Security', category: 'audit', auth: 'oauth2',
  authUrl: 'https://github.com/login/oauth/authorize', tokenUrl: 'https://github.com/login/oauth/access_token',
  scopes: ['repo', 'security_events'], docsUrl: 'https://docs.github.com/en/rest/secret-scanning',
  capabilities: ['code_scan', 'secret_scan', 'dependency_scan'],
  async scanCode(ctx, args) { const r = repoOf(ctx, args); return r ? ghAlerts(ctx, r, 'code-scanning/alerts') : bad('repo_required') },
  async scanSecrets(ctx, args) { const r = repoOf(ctx, args); return r ? ghAlerts(ctx, r, 'secret-scanning/alerts') : bad('repo_required') },
  async scanDependencies(ctx, args) { const r = repoOf(ctx, args); return r ? ghAlerts(ctx, r, 'dependabot/alerts') : bad('repo_required') },
}

const snyk: IntegrationProvider = {
  id: 'snyk', label: 'Snyk', category: 'audit', auth: 'api_key',
  docsUrl: 'https://docs.snyk.io/snyk-api', capabilities: ['dependency_scan', 'auto_fix'],
  async scanDependencies(ctx, args) {
    const org = (args.org || ctx.accountRef || '').trim()
    if (!org) return bad('snyk_org_required')
    const res = await fetch(`https://api.snyk.io/rest/orgs/${encodeURIComponent(org)}/issues?version=2024-01-01&limit=50`, { headers: { Authorization: `token ${ctx.apiKey}`, Accept: 'application/vnd.api+json' } })
    const d: any = await res.json().catch(() => ({}))
    if (!res.ok) return bad('snyk_scan_failed', d?.errors?.[0]?.detail || `http_${res.status}`)
    const issues = Array.isArray(d.data) ? d.data : []
    return ok({ count: issues.length, issues: issues.slice(0, 50).map((i: any) => ({ id: i.id, title: i.attributes?.title, severity: i.attributes?.effective_severity_level })) }, 'snyk_dependency_scan')
  },
}

const sonarqube: IntegrationProvider = { id: 'sonarqube', label: 'SonarQube', category: 'audit', auth: 'api_key', docsUrl: 'https://docs.sonarsource.com/sonarqube/latest/web-api/', capabilities: ['code_scan'] }
const owaspZap: IntegrationProvider = { id: 'owasp_zap', label: 'OWASP ZAP', category: 'audit', auth: 'api_key', docsUrl: 'https://www.zaproxy.org/docs/api/', capabilities: ['dast_scan'] }
const dependabot: IntegrationProvider = { id: 'dependabot', label: 'Dependabot', category: 'audit', auth: 'oauth2', authUrl: 'https://github.com/login/oauth/authorize', capabilities: ['dependency_scan', 'auto_fix'] }

// ── Cybersecurity ────────────────────────────────────────────────────────────────
const cloudflare: IntegrationProvider = { id: 'cloudflare_security', label: 'Cloudflare Security', category: 'cybersecurity', auth: 'api_key', docsUrl: 'https://developers.cloudflare.com/api/', capabilities: ['waf_events', 'identity_manage'] }
const crowdstrike: IntegrationProvider = { id: 'crowdstrike', label: 'CrowdStrike Falcon', category: 'cybersecurity', auth: 'oauth2', authUrl: 'https://api.crowdstrike.com/oauth2/token', capabilities: ['edr_status'] }
const okta: IntegrationProvider = { id: 'okta', label: 'Okta', category: 'cybersecurity', auth: 'oauth2', authUrl: 'https://{domain}/oauth2/v1/authorize', docsUrl: 'https://developer.okta.com/docs/reference/', capabilities: ['identity_manage'] }
const tenable: IntegrationProvider = { id: 'tenable', label: 'Tenable', category: 'cybersecurity', auth: 'api_key', docsUrl: 'https://developer.tenable.com/', capabilities: ['vuln_scan'] }
const rapid7: IntegrationProvider = { id: 'rapid7', label: 'Rapid7', category: 'cybersecurity', auth: 'api_key', docsUrl: 'https://docs.rapid7.com/insightvm/api/', capabilities: ['vuln_scan', 'siem_query'] }

// ── Compliance (CSPM) ─────────────────────────────────────────────────────────────
const wiz: IntegrationProvider = { id: 'wiz', label: 'Wiz', category: 'compliance', auth: 'oauth2', docsUrl: 'https://docs.wiz.io/', capabilities: ['cloud_posture'] }
const prismaCloud: IntegrationProvider = { id: 'prisma_cloud', label: 'Prisma Cloud', category: 'compliance', auth: 'api_key', capabilities: ['cloud_posture'] }
const orca: IntegrationProvider = { id: 'orca', label: 'Orca Security', category: 'compliance', auth: 'api_key', capabilities: ['cloud_posture'] }

export const SECURITY_CATALOG: IntegrationProvider[] = [
  githubSecurity, snyk, sonarqube, owaspZap, dependabot,
  cloudflare, crowdstrike, okta, tenable, rapid7,
  wiz, prismaCloud, orca,
]

export function registerSecurityCatalog(): void {
  for (const p of SECURITY_CATALOG) registerProvider(p)
}
